import { Prisma, PrismaClient } from '../lib/prisma-client.js';
import {
  AuditEntityType,
  AuditEventType,
  OrderStatus,
  PaymentStatus,
  QRStatus,
  RoleCode
} from '../models/domain.js';

type DbClient = PrismaClient;

export const userSelect = {
  id: true,
  tenantId: true,
  email: true,
  fullName: true,
  phone: true,
  studentFacultyId: true,
  yearOfStudy: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  role: {
    select: {
      code: true,
      name: true
    }
  }
} satisfies Prisma.UserSelect;

export const orderInclude = {
  orderItems: true,
  payment: true,
  qrToken: true,
  canteen: true,
  customer: {
    select: userSelect
  }
} satisfies Prisma.OrderInclude;

export const menuItemInclude = {
  canteen: true
} satisfies Prisma.MenuItemInclude;

export class RoleRepository {
  constructor(private readonly db: DbClient) {}

  findByCode(code: RoleCode) {
    return this.db.role.findUnique({ where: { code } });
  }

  list() {
    return this.db.role.findMany({ orderBy: { name: 'asc' } });
  }
}

export class CollegeRepository {
  constructor(private readonly db: DbClient) {}

  create(data: Prisma.CollegeCreateInput) {
    return this.db.college.create({ data });
  }

  findById(id: string) {
    return this.db.college.findUnique({ where: { id } });
  }

  list() {
    return this.db.college.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: {
            users: true,
            canteens: true,
            orders: true
          }
        }
      }
    });
  }

  listActivePublic() {
    return this.db.college.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        slug: true,
        code: true
      }
    });
  }

  update(id: string, data: Prisma.CollegeUpdateInput) {
    return this.db.college.update({ where: { id }, data });
  }
}

export class CanteenRepository {
  constructor(private readonly db: DbClient) {}

  create(data: Prisma.CanteenCreateInput) {
    return this.db.canteen.create({ data });
  }

  findById(id: string) {
    return this.db.canteen.findUnique({ where: { id } });
  }

  findByTenant(tenantId: string) {
    return this.db.canteen.findMany({
      where: { tenantId, isActive: true },
      orderBy: { name: 'asc' }
    });
  }

  findManagerCanteens(tenantId: string, managerId: string) {
    return this.db.managerAssignment.findMany({
      where: { tenantId, managerId },
      include: { canteen: true }
    });
  }
}

export class UserRepository {
  constructor(private readonly db: DbClient) {}

  create(data: Prisma.UserCreateInput) {
    return this.db.user.create({
      data,
      select: {
        ...userSelect,
        passwordHash: false
      }
    });
  }

  createRaw(data: Prisma.UserCreateInput) {
    return this.db.user.create({ data, include: { role: true } });
  }

  findByEmail(email: string) {
    return this.db.user.findUnique({
      where: { email },
      include: {
        role: true,
        managerAssignments: {
          include: { canteen: true }
        }
      }
    });
  }

  findById(id: string) {
    return this.db.user.findUnique({
      where: { id },
      select: userSelect
    });
  }

  findDetailedById(id: string) {
    return this.db.user.findUnique({
      where: { id },
      include: {
        role: true,
        managerAssignments: {
          include: { canteen: true }
        }
      }
    });
  }

  listManagers(tenantId: string) {
    return this.db.user.findMany({
      where: {
        tenantId,
        role: { code: RoleCode.CANTEEN_MANAGER }
      },
      select: userSelect,
      orderBy: { createdAt: 'desc' }
    });
  }
}

export class ManagerAssignmentRepository {
  constructor(private readonly db: DbClient) {}

  create(data: Prisma.ManagerAssignmentCreateInput) {
    return this.db.managerAssignment.create({
      data,
      include: {
        manager: {
          select: userSelect
        },
        canteen: true
      }
    });
  }

  listForManager(tenantId: string, managerId: string) {
    return this.db.managerAssignment.findMany({
      where: { tenantId, managerId },
      include: { canteen: true }
    });
  }

  hasAccessToCanteen(tenantId: string, managerId: string, canteenId: string) {
    return this.db.managerAssignment.findUnique({
      where: {
        tenantId_managerId_canteenId: {
          tenantId,
          managerId,
          canteenId
        }
      }
    });
  }
}

export class MenuItemRepository {
  constructor(private readonly db: DbClient) {}

  create(data: Prisma.MenuItemCreateInput) {
    return this.db.menuItem.create({
      data,
      include: menuItemInclude
    });
  }

  update(id: string, tenantId: string, data: Prisma.MenuItemUpdateInput) {
    return this.db.$transaction(async (tx) => {
      await tx.menuItem.updateMany({
        where: { id, tenantId },
        data
      });
      return tx.menuItem.findFirstOrThrow({
        where: { id, tenantId },
        include: menuItemInclude
      });
    });
  }

  findById(id: string, tenantId: string) {
    return this.db.menuItem.findFirst({
      where: { id, tenantId },
      include: menuItemInclude
    });
  }

  findByIds(tenantId: string, ids: string[]) {
    return this.db.menuItem.findMany({
      where: {
        tenantId,
        id: { in: ids }
      }
    });
  }

  list(tenantId: string, canteenId?: string) {
    return this.db.menuItem.findMany({
      where: {
        tenantId,
        ...(canteenId ? { canteenId } : {}),
        isAvailable: true
      },
      include: menuItemInclude,
      orderBy: [{ category: 'asc' }, { name: 'asc' }]
    });
  }

  listForManager(tenantId: string, canteenId?: string) {
    return this.db.menuItem.findMany({
      where: {
        tenantId,
        ...(canteenId ? { canteenId } : {})
      },
      include: menuItemInclude,
      orderBy: { createdAt: 'desc' }
    });
  }

  delete(id: string, tenantId: string) {
    return this.db.menuItem.deleteMany({
      where: { id, tenantId }
    });
  }
}

export class OrderRepository {
  constructor(private readonly db: DbClient) {}

  create(data: Prisma.OrderCreateInput) {
    return this.db.order.create({
      data,
      include: orderInclude
    });
  }

  findById(id: string, tenantId: string) {
    return this.db.order.findFirst({
      where: { id, tenantId },
      include: orderInclude
    });
  }

  findCustomerOrder(orderId: string, tenantId: string, customerId: string) {
    return this.db.order.findFirst({
      where: { id: orderId, tenantId, customerId },
      include: orderInclude
    });
  }

  updateStatus(
    id: string,
    tenantId: string,
    status: OrderStatus,
    data: Omit<Prisma.OrderUpdateInput, 'status'> = {}
  ) {
    return this.db.$transaction(async (tx) => {
      await tx.order.updateMany({
        where: { id, tenantId },
        data: {
          ...data,
          status
        }
      });
      return tx.order.findFirstOrThrow({
        where: { id, tenantId },
        include: orderInclude
      });
    });
  }

  listForCustomer(tenantId: string, customerId: string) {
    return this.db.order.findMany({
      where: { tenantId, customerId },
      include: orderInclude,
      orderBy: { createdAt: 'desc' }
    });
  }

  listForManager(tenantId: string, canteenIds: string[], status?: OrderStatus) {
    return this.db.order.findMany({
      where: {
        tenantId,
        canteenId: { in: canteenIds },
        ...(status ? { status } : {})
      },
      include: orderInclude,
      orderBy: { createdAt: 'desc' }
    });
  }

  findOrdersEligibleForDelay(tenantId: string, threshold: Date) {
    return this.db.order.findMany({
      where: {
        tenantId,
        status: { in: [OrderStatus.CONFIRMED, OrderStatus.PREPARING] },
        updatedAt: { lt: threshold }
      },
      include: orderInclude
    });
  }

  findQrExpiredOrders(tenantId: string, threshold: Date) {
    return this.db.order.findMany({
      where: {
        tenantId,
        status: OrderStatus.QR_GENERATED,
        expiresAt: { lte: threshold }
      },
      include: orderInclude
    });
  }

  aggregateTotals() {
    return this.db.order.groupBy({
      by: ['tenantId'],
      _sum: { totalInPaise: true },
      _count: { _all: true }
    });
  }
}

export class PaymentRepository {
  constructor(private readonly db: DbClient) {}

  create(data: Prisma.PaymentCreateInput) {
    return this.db.payment.create({
      data,
      include: { order: true }
    });
  }

  update(id: string, data: Prisma.PaymentUpdateInput) {
    return this.db.payment.update({
      where: { id },
      data,
      include: { order: true }
    });
  }

  findByOrderId(orderId: string) {
    return this.db.payment.findUnique({
      where: { orderId },
      include: { order: true }
    });
  }

  findByProviderOrderId(providerOrderId: string) {
    return this.db.payment.findFirst({
      where: { providerOrderId },
      include: { order: true }
    });
  }

  findByIdempotencyKey(idempotencyKey: string) {
    return this.db.payment.findUnique({
      where: { idempotencyKey },
      include: { order: true }
    });
  }

  listForTenant(tenantId: string) {
    return this.db.payment.findMany({
      where: { tenantId },
      include: { order: true },
      orderBy: { createdAt: 'desc' }
    });
  }
}

export class QRTokenRepository {
  constructor(private readonly db: DbClient) {}

  create(data: Prisma.QRTokenCreateInput) {
    return this.db.qRToken.create({
      data,
      include: {
        order: {
          include: orderInclude
        }
      }
    });
  }

  findByOrderId(orderId: string) {
    return this.db.qRToken.findUnique({
      where: { orderId },
      include: {
        order: {
          include: orderInclude
        }
      }
    });
  }

  findByTokenHash(tokenHash: string) {
    return this.db.qRToken.findUnique({
      where: { tokenHash },
      include: {
        order: {
          include: orderInclude
        }
      }
    });
  }

  update(id: string, data: Prisma.QRTokenUpdateInput) {
    return this.db.qRToken.update({
      where: { id },
      data,
      include: {
        order: {
          include: orderInclude
        }
      }
    });
  }
}

export class RefreshTokenRepository {
  constructor(private readonly db: DbClient) {}

  create(data: Prisma.RefreshTokenCreateInput) {
    return this.db.refreshToken.create({ data });
  }

  findByTokenHash(tokenHash: string) {
    return this.db.refreshToken.findUnique({
      where: { tokenHash },
      include: {
        user: { include: { role: true } }
      }
    });
  }

  revoke(id: string) {
    return this.db.refreshToken.update({
      where: { id },
      data: { revokedAt: new Date() }
    });
  }

  revokeAllForUser(userId: string) {
    return this.db.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() }
    });
  }
}

export class AuditLogRepository {
  constructor(private readonly db: DbClient) {}

  create(data: Prisma.AuditLogCreateInput) {
    return this.db.auditLog.create({ data });
  }

  createOrderTransition(params: {
    tenantId: string;
    orderId: string;
    actorUserId?: string;
    previousState: OrderStatus;
    newState: OrderStatus;
    reason?: string;
    metadata?: Prisma.InputJsonValue;
  }) {
    return this.db.auditLog.create({
      data: {
        entityType: AuditEntityType.ORDER,
        eventType: AuditEventType.STATE_TRANSITION,
        tenantId: params.tenantId,
        orderId: params.orderId,
        actorUserId: params.actorUserId,
        previousState: params.previousState,
        newState: params.newState,
        reason: params.reason,
        metadata: params.metadata
      }
    });
  }

  listByOrder(orderId: string) {
    return this.db.auditLog.findMany({
      where: { orderId },
      orderBy: { createdAt: 'asc' }
    });
  }
}

export class AnalyticsRepository {
  constructor(private readonly db: DbClient) {}

  getOverview() {
    return Promise.all([
      this.db.college.count({ where: { isActive: true } }),
      this.db.user.count({ where: { role: { code: RoleCode.CUSTOMER } } }),
      this.db.user.count({ where: { role: { code: RoleCode.CANTEEN_MANAGER } } }),
      this.db.order.count(),
      this.db.order.aggregate({
        _sum: { totalInPaise: true }
      }),
      this.db.order.groupBy({
        by: ['status'],
        _count: { _all: true }
      }),
      this.db.payment.count({ where: { status: PaymentStatus.SUCCESS } })
    ]);
  }
}
