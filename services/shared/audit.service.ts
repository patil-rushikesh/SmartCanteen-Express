import { Prisma } from '../../lib/prisma-client.js';
import { AuditLogRepository } from '../../repositories/index.js';
import { AuditEntityType, AuditEventType, OrderStatus } from '../../models/domain.js';

export class AuditService {
  constructor(private readonly auditLogRepository: AuditLogRepository) {}

  recordOrderTransition(params: {
    tenantId: string;
    orderId: string;
    actorUserId?: string;
    previousState: OrderStatus;
    newState: OrderStatus;
    reason?: string;
    metadata?: Prisma.InputJsonValue;
  }) {
    return this.auditLogRepository.createOrderTransition(params);
  }

  recordEvent(params: {
    tenantId?: string | null;
    orderId?: string;
    paymentId?: string;
    qrTokenId?: string;
    actorUserId?: string;
    entityType: AuditEntityType;
    eventType: AuditEventType;
    previousState?: string;
    newState?: string;
    reason?: string;
    metadata?: Prisma.InputJsonValue;
  }) {
    return this.auditLogRepository.create({
      college: params.tenantId ? { connect: { id: params.tenantId } } : undefined,
      order: params.orderId ? { connect: { id: params.orderId } } : undefined,
      payment: params.paymentId ? { connect: { id: params.paymentId } } : undefined,
      qrToken: params.qrTokenId ? { connect: { id: params.qrTokenId } } : undefined,
      actor: params.actorUserId ? { connect: { id: params.actorUserId } } : undefined,
      entityType: params.entityType,
      eventType: params.eventType,
      previousState: params.previousState,
      newState: params.newState,
      reason: params.reason,
      metadata: params.metadata
    });
  }
}
