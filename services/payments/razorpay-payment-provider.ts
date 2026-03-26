import { env } from '../../utils/env.js';
import { createHmacSha256, safeEqual } from '../../utils/crypto.js';
import {
  InitiatePaymentInput,
  InitiatePaymentResult,
  PaymentProvider,
  PaymentWebhookEvent,
  RefundPaymentInput,
  RefundPaymentResult,
  VerifyPaymentInput
} from '../../interfaces/payment-provider.js';
import { razorpayClient } from '../../config/razorpay.js';

export class RazorpayPaymentProvider implements PaymentProvider {
  async initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentResult> {
    const order = await razorpayClient.orders.create({
      amount: input.amountInPaise,
      currency: input.currency,
      receipt: input.receipt,
      notes: input.notes
    });

    return {
      providerOrderId: order.id,
      amountInPaise: Number(order.amount),
      currency: order.currency,
      receipt: order.receipt ?? input.receipt,
      raw: order as unknown as Record<string, unknown>
    };
  }

  verifyPayment(input: VerifyPaymentInput): boolean {
    const expectedSignature = createHmacSha256(
      `${input.providerOrderId}|${input.providerPaymentId}`,
      env.RAZORPAY_KEY_SECRET
    );

    return safeEqual(expectedSignature, input.signature);
  }

  async refundPayment(input: RefundPaymentInput): Promise<RefundPaymentResult> {
    const refund = await razorpayClient.payments.refund(input.providerPaymentId, {
      amount: input.amountInPaise,
      notes: input.notes
    });

    return {
      refundId: refund.id,
      raw: refund as unknown as Record<string, unknown>
    };
  }

  verifyWebhookSignature(rawBody: string, signature: string): boolean {
    const expectedSignature = createHmacSha256(rawBody, env.RAZORPAY_WEBHOOK_SECRET);
    return safeEqual(expectedSignature, signature);
  }

  parseWebhook(rawBody: string): PaymentWebhookEvent {
    const payload = JSON.parse(rawBody) as Record<string, any>;
    const paymentEntity = payload.payload?.payment?.entity;

    return {
      eventId: payload.created_at?.toString(),
      eventType: payload.event,
      providerOrderId: paymentEntity?.order_id,
      providerPaymentId: paymentEntity?.id,
      signature: paymentEntity?.signature,
      method: paymentEntity?.method,
      amountInPaise: paymentEntity?.amount,
      payload
    };
  }
}
