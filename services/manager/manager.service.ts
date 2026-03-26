import { AppError } from '../../utils/errors.js';
import { assertValidTransition } from '../../utils/order-state-machine.js';
import {
  CanteenRepository,
  ManagerAssignmentRepository,
  MenuItemRepository,
  OrderRepository,
  PaymentRepository
} from '../../repositories/index.js';
import { AuditService } from '../shared/audit.service.js';
import { storageProvider } from '../shared/storage.service.js';
import { PaymentService } from '../payments/payment.service.js';
import { QrService } from '../shared/qr.service.js';
import { env } from '../../utils/env.js';
import { AuditEntityType, AuditEventType, OrderStatus } from '../../models/domain.js';

export class ManagerService {
  constructor(
    private readonly managerAssignmentRepository: ManagerAssignmentRepository,
    private readonly canteenRepository: CanteenRepository,
    private readonly menuItemRepository: MenuItemRepository,
    private readonly orderRepository: OrderRepository,
    private readonly paymentRepository: PaymentRepository,
    private readonly auditService: AuditService,
    private readonly qrService: QrService,
    private readonly paymentService: PaymentService
  ) {}

  private async ensureManagerAccess(tenantId: string, managerId: string, canteenId: string) {
    const assignment = await this.managerAssignmentRepository.hasAccessToCanteen(tenantId, managerId, canteenId);
    if (!assignment) {
      throw new AppError(403, 'Manager does not have access to this canteen');
    }
  }

  async listMenuItems(tenantId: string, managerId: string, canteenId?: string) {
    const assignments = await this.managerAssignmentRepository.listForManager(tenantId, managerId);
    const canteenIds = assignments.map((assignment) => assignment.canteenId);
    if (canteenIds.length === 0) {
      return [];
    }

    if (canteenId && !canteenIds.includes(canteenId)) {
      throw new AppError(403, 'Manager cannot access this canteen');
    }

    return this.menuItemRepository.listForManager(tenantId, canteenId);
  }

  async createMenuItem(input: {
    tenantId: string;
    managerId: string;
    canteenId: string;
    name: string;
    description?: string;
    category?: string;
    priceInPaise: number;
    stockQuantity: number;
    isAvailable: boolean;
    imageBase64?: string;
  }) {
    await this.ensureManagerAccess(input.tenantId, input.managerId, input.canteenId);

    const uploadedImage = input.imageBase64
      ? await storageProvider.uploadFile({
          file: input.imageBase64,
          folder: `${env.CLOUDINARY_FOLDER}/${input.tenantId}/menu`
        })
      : null;

    const menuItem = await this.menuItemRepository.create({
      name: input.name,
      description: input.description,
      category: input.category,
      imageUrl: uploadedImage?.fileUrl,
      priceInPaise: input.priceInPaise,
      stockQuantity: input.stockQuantity,
      isAvailable: input.isAvailable,
      college: { connect: { id: input.tenantId } },
      canteen: { connect: { id: input.canteenId } }
    });

    await this.auditService.recordEvent({
      tenantId: input.tenantId,
      actorUserId: input.managerId,
      entityType: AuditEntityType.MENU_ITEM,
      eventType: AuditEventType.MENU_UPDATED,
      metadata: { menuItemId: menuItem.id, action: 'create' }
    });

    return menuItem;
  }

  async updateMenuItem(
    input: {
      tenantId: string;
      managerId: string;
      menuItemId: string;
      canteenId?: string;
      name?: string;
      description?: string;
      category?: string;
      priceInPaise?: number;
      stockQuantity?: number;
      isAvailable?: boolean;
      imageBase64?: string;
    }
  ) {
    const existing = await this.menuItemRepository.findById(input.menuItemId, input.tenantId);
    if (!existing) {
      throw new AppError(404, 'Menu item not found');
    }

    await this.ensureManagerAccess(input.tenantId, input.managerId, existing.canteenId);

    const uploadedImage = input.imageBase64
      ? await storageProvider.uploadFile({
          file: input.imageBase64,
          folder: `${env.CLOUDINARY_FOLDER}/${input.tenantId}/menu`
        })
      : null;

    const updated = await this.menuItemRepository.update(existing.id, input.tenantId, {
      name: input.name,
      description: input.description,
      category: input.category,
      priceInPaise: input.priceInPaise,
      stockQuantity: input.stockQuantity,
      isAvailable: input.isAvailable,
      imageUrl: uploadedImage?.fileUrl ?? existing.imageUrl
    });

    await this.auditService.recordEvent({
      tenantId: input.tenantId,
      actorUserId: input.managerId,
      entityType: AuditEntityType.MENU_ITEM,
      eventType: AuditEventType.MENU_UPDATED,
      metadata: { menuItemId: existing.id, action: 'update' }
    });

    return updated;
  }

  async deleteMenuItem(tenantId: string, managerId: string, menuItemId: string) {
    const existing = await this.menuItemRepository.findById(menuItemId, tenantId);
    if (!existing) {
      throw new AppError(404, 'Menu item not found');
    }

    await this.ensureManagerAccess(tenantId, managerId, existing.canteenId);
    await this.menuItemRepository.delete(menuItemId, tenantId);
    return { deleted: true };
  }

  private async syncOperationalStates(tenantId: string) {
    const now = new Date();
    const expiredOrders = await this.orderRepository.findQrExpiredOrders(tenantId, now);
    for (const order of expiredOrders) {
      await this.qrService.expireQr(order.id, tenantId);
    }

    const delayedOrders = await this.orderRepository.findOrdersEligibleForDelay(
      tenantId,
      new Date(now.getTime() - env.ORDER_DELAY_MINUTES * 60 * 1000)
    );

    for (const order of delayedOrders) {
      if (order.status === OrderStatus.CONFIRMED || order.status === OrderStatus.PREPARING) {
        const updated = await this.orderRepository.updateStatus(order.id, tenantId, OrderStatus.DELAYED, {
          delayMarkedAt: now
        });
        await this.auditService.recordEvent({
          tenantId,
          orderId: order.id,
          entityType: AuditEntityType.ORDER,
          eventType: AuditEventType.DELAY_MARKED,
          previousState: order.status,
          newState: updated.status
        });
      }
    }
  }

  async listOrders(tenantId: string, managerId: string, status?: OrderStatus) {
    const assignments = await this.managerAssignmentRepository.listForManager(tenantId, managerId);
    const canteenIds = assignments.map((assignment) => assignment.canteenId);
    if (canteenIds.length === 0) {
      return [];
    }

    await this.syncOperationalStates(tenantId);
    return this.orderRepository.listForManager(tenantId, canteenIds, status);
  }

  async scanQr(tenantId: string, managerId: string, signedToken: string) {
    return this.qrService.validateAndConsume({ tenantId, managerId, signedToken });
  }

  async updateOrderStatus(input: {
    tenantId: string;
    managerId: string;
    orderId: string;
    nextStatus: OrderStatus;
    reason?: string;
  }) {
    const order = await this.orderRepository.findById(input.orderId, input.tenantId);
    if (!order) {
      throw new AppError(404, 'Order not found');
    }

    await this.ensureManagerAccess(input.tenantId, input.managerId, order.canteenId);

    if (input.nextStatus === OrderStatus.REFUNDED) {
      return this.paymentService.refundOrder({
        tenantId: input.tenantId,
        orderId: input.orderId,
        actorUserId: input.managerId,
        reason: input.reason
      });
    }

    assertValidTransition(order.status, input.nextStatus);

    const updated = await this.orderRepository.updateStatus(order.id, input.tenantId, input.nextStatus, {
      completedAt: input.nextStatus === OrderStatus.COMPLETED ? new Date() : undefined
    });

    await this.auditService.recordOrderTransition({
      tenantId: input.tenantId,
      orderId: order.id,
      actorUserId: input.managerId,
      previousState: order.status,
      newState: input.nextStatus,
      reason: input.reason
    });

    return updated;
  }

  async getPaymentReport(tenantId: string, managerId: string) {
    const assignments = await this.managerAssignmentRepository.listForManager(tenantId, managerId);
    const canteenIds = assignments.map((assignment) => assignment.canteenId);
    if (canteenIds.length === 0) {
      return [];
    }

    const payments = await this.paymentRepository.listForTenant(tenantId);
    return payments.filter((payment) => canteenIds.includes(payment.order.canteenId));
  }
}
