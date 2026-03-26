import { Prisma } from '../../lib/prisma-client.js';
import { PaymentProvider } from '../../interfaces/payment-provider.js';
import { AppError } from '../../utils/errors.js';
import { assertValidTransition } from '../../utils/order-state-machine.js';
import { AuditService } from '../shared/audit.service.js';
import { QrService } from '../shared/qr.service.js';
import { OrderRepository, PaymentRepository } from '../../repositories/index.js';
import { AuditEntityType, AuditEventType, OrderStatus, PaymentStatus } from '../../models/domain.js';

const successEvents = new Set(['payment.captured', 'order.paid']);
const failureEvents = new Set(['payment.failed']);
const toJson = (value: Record<string, unknown>) => value as Prisma.InputJsonValue;

export class PaymentService {
  constructor(
    private readonly paymentRepository: PaymentRepository,
    private readonly orderRepository: OrderRepository,
    private readonly auditService: AuditService,
    private readonly qrService: QrService,
    private readonly paymentProvider: PaymentProvider
  ) {}

  async initiateOrderPayment(input: {
    tenantId: string;
    customerId: string;
    orderId: string;
    idempotencyKey: string;
  }) {
    const order = await this.orderRepository.findCustomerOrder(input.orderId, input.tenantId, input.customerId);
    if (!order) {
      throw new AppError(404, 'Order not found');
    }

    const initiatableStates: OrderStatus[] = [OrderStatus.CREATED, OrderStatus.PAYMENT_FAILED];
    if (!initiatableStates.includes(order.status)) {
      throw new AppError(409, `Payment cannot be initiated from order state ${order.status}`);
    }

    const existingByKey = await this.paymentRepository.findByIdempotencyKey(input.idempotencyKey);
    if (existingByKey) {
      return existingByKey;
    }

    const existingPayment = await this.paymentRepository.findByOrderId(order.id);
    const reusablePaymentStates: PaymentStatus[] = [PaymentStatus.PENDING, PaymentStatus.SUCCESS];
    if (existingPayment && reusablePaymentStates.includes(existingPayment.status)) {
      return existingPayment;
    }

    const providerOrder = await this.paymentProvider.initiatePayment({
      amountInPaise: order.totalInPaise,
      currency: order.currency,
      receipt: `order_${order.id}`,
      notes: {
        orderId: order.id,
        tenantId: input.tenantId,
        customerId: input.customerId
      }
    });

    assertValidTransition(order.status, OrderStatus.PAYMENT_PENDING);
    await this.orderRepository.updateStatus(order.id, input.tenantId, OrderStatus.PAYMENT_PENDING, {
      paymentInitiatedAt: new Date()
    });

    const payment = existingPayment
      ? await this.paymentRepository.update(existingPayment.id, {
          provider: 'RAZORPAY',
          providerOrderId: providerOrder.providerOrderId,
          providerReceipt: providerOrder.receipt,
          amountInPaise: providerOrder.amountInPaise,
          currency: providerOrder.currency,
          idempotencyKey: input.idempotencyKey,
          status: PaymentStatus.PENDING,
          gatewayResponse: toJson(providerOrder.raw)
        })
      : await this.paymentRepository.create({
          provider: 'RAZORPAY',
          providerOrderId: providerOrder.providerOrderId,
          providerReceipt: providerOrder.receipt,
          amountInPaise: providerOrder.amountInPaise,
          currency: providerOrder.currency,
          idempotencyKey: input.idempotencyKey,
          status: PaymentStatus.PENDING,
          gatewayResponse: toJson(providerOrder.raw),
          college: { connect: { id: input.tenantId } },
          order: { connect: { id: order.id } }
        });

    await this.auditService.recordOrderTransition({
      tenantId: input.tenantId,
      orderId: order.id,
      actorUserId: input.customerId,
      previousState: order.status,
      newState: OrderStatus.PAYMENT_PENDING,
      reason: 'Payment initiated'
    });

    await this.auditService.recordEvent({
      tenantId: input.tenantId,
      orderId: order.id,
      paymentId: payment.id,
      actorUserId: input.customerId,
      entityType: AuditEntityType.PAYMENT,
      eventType: AuditEventType.PAYMENT_INITIATED,
      metadata: {
        providerOrderId: providerOrder.providerOrderId,
        idempotencyKey: input.idempotencyKey
      }
    });

    return payment;
  }

  verifyPaymentSignature(input: {
    providerOrderId: string;
    providerPaymentId: string;
    signature: string;
  }) {
    const isValid = this.paymentProvider.verifyPayment(input);
    if (!isValid) {
      throw new AppError(400, 'Invalid payment signature');
    }

    return { verified: true };
  }

  async handleWebhook(input: { signature: string; rawBody: string }) {
    if (!this.paymentProvider.verifyWebhookSignature(input.rawBody, input.signature)) {
      throw new AppError(400, 'Invalid webhook signature');
    }

    const event = this.paymentProvider.parseWebhook(input.rawBody);
    if (!event.providerOrderId) {
      return { processed: false, reason: 'Provider order id missing' };
    }

    const payment = await this.paymentRepository.findByProviderOrderId(event.providerOrderId);
    if (!payment) {
      throw new AppError(404, 'Payment record not found for webhook');
    }

    if (successEvents.has(event.eventType)) {
      if (payment.status !== PaymentStatus.SUCCESS) {
        await this.paymentRepository.update(payment.id, {
          status: PaymentStatus.SUCCESS,
          providerPaymentId: event.providerPaymentId,
          method: event.method,
          amountInPaise: event.amountInPaise,
          webhookEventId: event.eventId,
          gatewayResponse: toJson(event.payload)
        });

        if (payment.order.status === OrderStatus.PAYMENT_PENDING) {
          await this.orderRepository.updateStatus(payment.orderId, payment.tenantId, OrderStatus.PAID, {
            paidAt: new Date()
          });
          await this.auditService.recordOrderTransition({
            tenantId: payment.tenantId,
            orderId: payment.orderId,
            previousState: OrderStatus.PAYMENT_PENDING,
            newState: OrderStatus.PAID,
            reason: `Webhook ${event.eventType}`
          });
        }

        const qrToken = await this.qrService.generateForPaidOrder(payment.orderId, payment.tenantId);
        await this.orderRepository.updateStatus(payment.orderId, payment.tenantId, OrderStatus.QR_GENERATED, {
          qrGeneratedAt: new Date(),
          expiresAt: qrToken.expiresAt
        });
        await this.auditService.recordOrderTransition({
          tenantId: payment.tenantId,
          orderId: payment.orderId,
          previousState: OrderStatus.PAID,
          newState: OrderStatus.QR_GENERATED,
          reason: 'QR generated after payment success'
        });

        await this.auditService.recordEvent({
          tenantId: payment.tenantId,
          orderId: payment.orderId,
          paymentId: payment.id,
          entityType: AuditEntityType.PAYMENT,
          eventType: AuditEventType.PAYMENT_SUCCEEDED,
          metadata: toJson(event.payload)
        });
      }

      return { processed: true, status: 'success' };
    }

    if (failureEvents.has(event.eventType)) {
      await this.paymentRepository.update(payment.id, {
        status: PaymentStatus.FAILED,
        providerPaymentId: event.providerPaymentId,
        method: event.method,
        webhookEventId: event.eventId,
        gatewayResponse: toJson(event.payload)
      });

      if (payment.order.status === OrderStatus.PAYMENT_PENDING) {
        await this.orderRepository.updateStatus(payment.orderId, payment.tenantId, OrderStatus.PAYMENT_FAILED);
        await this.auditService.recordOrderTransition({
          tenantId: payment.tenantId,
          orderId: payment.orderId,
          previousState: OrderStatus.PAYMENT_PENDING,
          newState: OrderStatus.PAYMENT_FAILED,
          reason: `Webhook ${event.eventType}`
        });
      }

      await this.auditService.recordEvent({
        tenantId: payment.tenantId,
        orderId: payment.orderId,
        paymentId: payment.id,
        entityType: AuditEntityType.PAYMENT,
        eventType: AuditEventType.PAYMENT_FAILED,
        metadata: toJson(event.payload)
      });

      return { processed: true, status: 'failed' };
    }

    return { processed: false, reason: `Unhandled event ${event.eventType}` };
  }

  async refundOrder(input: { tenantId: string; orderId: string; actorUserId: string; reason?: string }) {
    const order = await this.orderRepository.findById(input.orderId, input.tenantId);
    if (!order) {
      throw new AppError(404, 'Order not found');
    }

    const payment = await this.paymentRepository.findByOrderId(order.id);
    if (!payment || !payment.providerPaymentId || payment.status !== PaymentStatus.SUCCESS) {
      throw new AppError(409, 'Refund is only available for successful payments');
    }

    const refund = await this.paymentProvider.refundPayment({
      providerPaymentId: payment.providerPaymentId,
      amountInPaise: order.totalInPaise,
      notes: {
        orderId: order.id,
        tenantId: input.tenantId,
        reason: input.reason ?? 'Refund requested'
      }
    });

    await this.paymentRepository.update(payment.id, {
      status: PaymentStatus.REFUNDED,
      refundedAmountInPaise: order.totalInPaise,
      gatewayResponse: toJson(refund.raw)
    });

    await this.orderRepository.updateStatus(order.id, input.tenantId, OrderStatus.REFUNDED);
    await this.auditService.recordOrderTransition({
      tenantId: input.tenantId,
      orderId: order.id,
      actorUserId: input.actorUserId,
      previousState: order.status,
      newState: OrderStatus.REFUNDED,
      reason: input.reason ?? 'Refund completed'
    });
    await this.auditService.recordEvent({
      tenantId: input.tenantId,
      orderId: order.id,
      paymentId: payment.id,
      actorUserId: input.actorUserId,
      entityType: AuditEntityType.PAYMENT,
      eventType: AuditEventType.REFUND_COMPLETED,
      reason: input.reason,
      metadata: { refundId: refund.refundId } as Prisma.InputJsonValue
    });

    return { refundId: refund.refundId };
  }
}
