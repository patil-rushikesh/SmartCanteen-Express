import { AppError } from '../../utils/errors.js';
import { cacheKeys, cacheProvider } from '../shared/cache.service.js';
import { AuditService } from '../shared/audit.service.js';
import { MenuItemRepository, OrderRepository, QRTokenRepository } from '../../repositories/index.js';
import { AuditEntityType, AuditEventType, OrderStatus } from '../../models/domain.js';

type CartItem = {
  menuItemId: string;
  quantity: number;
};

export class CustomerService {
  constructor(
    private readonly menuItemRepository: MenuItemRepository,
    private readonly orderRepository: OrderRepository,
    private readonly qrTokenRepository: QRTokenRepository,
    private readonly auditService: AuditService
  ) {}

  listMenu(tenantId: string, canteenId?: string) {
    return this.menuItemRepository.list(tenantId, canteenId);
  }

  async getCart(tenantId: string, customerId: string) {
    return (await cacheProvider.get<CartItem[]>(cacheKeys.cart(tenantId, customerId))) ?? [];
  }

  async setCart(tenantId: string, customerId: string, items: CartItem[]) {
    await cacheProvider.set(cacheKeys.cart(tenantId, customerId), items, 24 * 60 * 60);
    return items;
  }

  async clearCart(tenantId: string, customerId: string) {
    await cacheProvider.del(cacheKeys.cart(tenantId, customerId));
  }

  async createOrder(input: {
    tenantId: string;
    customerId: string;
    canteenId: string;
    items: CartItem[];
  }) {
    if (input.items.length === 0) {
      throw new AppError(400, 'Order must contain at least one item');
    }

    const menuItems = await this.menuItemRepository.findByIds(
      input.tenantId,
      input.items.map((item) => item.menuItemId)
    );

    if (menuItems.length !== input.items.length) {
      throw new AppError(400, 'One or more menu items are invalid');
    }

    const orderItems = input.items.map((item) => {
      const menuItem = menuItems.find((candidate) => candidate.id === item.menuItemId);
      if (!menuItem) {
        throw new AppError(400, `Menu item ${item.menuItemId} not found`);
      }

      if (!menuItem.isAvailable || menuItem.canteenId !== input.canteenId) {
        throw new AppError(409, `Menu item ${menuItem.name} is unavailable`);
      }

      return {
        menuItemId: menuItem.id,
        menuItemName: menuItem.name,
        imageUrl: menuItem.imageUrl,
        unitPriceInPaise: menuItem.priceInPaise,
        quantity: item.quantity,
        totalPriceInPaise: menuItem.priceInPaise * item.quantity
      };
    });

    const subtotalInPaise = orderItems.reduce((sum, item) => sum + item.totalPriceInPaise, 0);
    const order = await this.orderRepository.create({
      subtotalInPaise,
      totalInPaise: subtotalInPaise,
      status: OrderStatus.CREATED,
      college: { connect: { id: input.tenantId } },
      canteen: { connect: { id: input.canteenId } },
      customer: { connect: { id: input.customerId } },
      orderItems: {
        create: orderItems.map((item) => ({
          tenantId: input.tenantId,
          menuItem: { connect: { id: item.menuItemId } },
          menuItemName: item.menuItemName,
          imageUrl: item.imageUrl,
          unitPriceInPaise: item.unitPriceInPaise,
          quantity: item.quantity,
          totalPriceInPaise: item.totalPriceInPaise
        }))
      }
    });

    await this.clearCart(input.tenantId, input.customerId);
    return order;
  }

  listOrders(tenantId: string, customerId: string) {
    return this.orderRepository.listForCustomer(tenantId, customerId);
  }

  async getQrForOrder(tenantId: string, customerId: string, orderId: string) {
    const order = await this.orderRepository.findCustomerOrder(orderId, tenantId, customerId);
    if (!order) {
      throw new AppError(404, 'Order not found');
    }

    if (order.status !== OrderStatus.QR_GENERATED || !order.qrToken) {
      throw new AppError(409, 'QR is not available for this order yet');
    }

    return order.qrToken;
  }

  async reportIssue(input: {
    tenantId: string;
    customerId: string;
    orderId: string;
    reason: string;
  }) {
    const order = await this.orderRepository.findCustomerOrder(input.orderId, input.tenantId, input.customerId);
    if (!order) {
      throw new AppError(404, 'Order not found');
    }

    const reportableStates: OrderStatus[] = [
      OrderStatus.CONFIRMED,
      OrderStatus.PREPARING,
      OrderStatus.READY,
      OrderStatus.COMPLETED,
      OrderStatus.DELAYED
    ];

    if (!reportableStates.includes(order.status)) {
      throw new AppError(409, `Issue reporting is not allowed for order state ${order.status}`);
    }

    const updatedOrder = await this.orderRepository.updateStatus(order.id, input.tenantId, OrderStatus.ISSUE_REPORTED, {
      issueReason: input.reason
    });

    await this.auditService.recordEvent({
      tenantId: input.tenantId,
      orderId: order.id,
      actorUserId: input.customerId,
      entityType: AuditEntityType.ORDER,
      eventType: AuditEventType.ISSUE_REPORTED,
      reason: input.reason
    });

    return updatedOrder;
  }
}
