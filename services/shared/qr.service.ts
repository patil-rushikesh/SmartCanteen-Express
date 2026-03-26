import crypto from 'crypto';
import { env } from '../../utils/env.js';
import { createSha256Hash } from '../../utils/crypto.js';
import { AppError } from '../../utils/errors.js';
import { signQrToken, verifyQrToken } from '../../utils/jwt.js';
import { assertValidTransition } from '../../utils/order-state-machine.js';
import { cacheKeys, cacheProvider } from './cache.service.js';
import { AuditService } from './audit.service.js';
import { OrderRepository, QRTokenRepository } from '../../repositories/index.js';
import { AuditEntityType, AuditEventType, OrderStatus, QRStatus } from '../../models/domain.js';

export class QrService {
  constructor(
    private readonly qrTokenRepository: QRTokenRepository,
    private readonly orderRepository: OrderRepository,
    private readonly auditService: AuditService
  ) {}

  async generateForPaidOrder(orderId: string, tenantId: string) {
    const existing = await this.qrTokenRepository.findByOrderId(orderId);
    if (existing && existing.status === QRStatus.ACTIVE) {
      return existing;
    }

    const nonce = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + env.QR_TTL_MINUTES * 60 * 1000);
    const signedToken = signQrToken({
      orderId,
      tenantId,
      nonce,
      exp: Math.floor(expiresAt.getTime() / 1000)
    });
    const tokenHash = createSha256Hash(signedToken);

    const qrToken = existing
      ? await this.qrTokenRepository.update(existing.id, {
          tokenHash,
          signedToken,
          nonce,
          expiresAt,
          status: QRStatus.ACTIVE,
          scannedAt: null,
          scannedBy: { disconnect: true }
        })
      : await this.qrTokenRepository.create({
          tokenHash,
          signedToken,
          nonce,
          expiresAt,
          status: QRStatus.ACTIVE,
          college: { connect: { id: tenantId } },
          order: { connect: { id: orderId } }
        });

    await cacheProvider.set(cacheKeys.qr(tenantId, orderId), { status: QRStatus.ACTIVE }, env.QR_TTL_MINUTES * 60);

    await this.auditService.recordEvent({
      tenantId,
      orderId,
      qrTokenId: qrToken.id,
      entityType: AuditEntityType.QR_TOKEN,
      eventType: AuditEventType.QR_GENERATED,
      reason: 'QR token generated',
      metadata: {
        expiresAt: expiresAt.toISOString()
      }
    });

    return qrToken;
  }

  async validateAndConsume(input: { signedToken: string; tenantId: string; managerId: string }) {
    const payload = verifyQrToken(input.signedToken);

    if (payload.tenantId !== input.tenantId) {
      throw new AppError(403, 'QR token does not belong to this tenant');
    }

    const tokenHash = createSha256Hash(input.signedToken);
    const qrToken = await this.qrTokenRepository.findByTokenHash(tokenHash);
    if (!qrToken) {
      throw new AppError(404, 'QR token not found');
    }

    if (qrToken.status !== QRStatus.ACTIVE) {
      throw new AppError(409, 'QR token is no longer active');
    }

    if (qrToken.expiresAt.getTime() <= Date.now()) {
      await this.expireQr(qrToken.orderId, qrToken.order.tenantId);
      throw new AppError(410, 'QR token has expired');
    }

    assertValidTransition(qrToken.order.status, OrderStatus.CONFIRMED);

    const updatedQr = await this.qrTokenRepository.update(qrToken.id, {
      status: QRStatus.USED,
      scannedAt: new Date(),
      scannedBy: { connect: { id: input.managerId } }
    });

    const updatedOrder = await this.orderRepository.updateStatus(
      qrToken.orderId,
      input.tenantId,
      OrderStatus.CONFIRMED,
      { confirmedAt: new Date() }
    );

    await cacheProvider.set(cacheKeys.qr(input.tenantId, qrToken.orderId), { status: QRStatus.USED }, 60);

    await this.auditService.recordOrderTransition({
      tenantId: input.tenantId,
      orderId: qrToken.orderId,
      actorUserId: input.managerId,
      previousState: qrToken.order.status,
      newState: OrderStatus.CONFIRMED,
      reason: 'QR scanned by manager'
    });

    await this.auditService.recordEvent({
      tenantId: input.tenantId,
      orderId: qrToken.orderId,
      qrTokenId: updatedQr.id,
      actorUserId: input.managerId,
      entityType: AuditEntityType.QR_TOKEN,
      eventType: AuditEventType.QR_SCANNED
    });

    return {
      qrToken: updatedQr,
      order: updatedOrder
    };
  }

  async expireQr(orderId: string, tenantId: string) {
    const qrToken = await this.qrTokenRepository.findByOrderId(orderId);
    if (!qrToken || qrToken.status !== QRStatus.ACTIVE) {
      return qrToken;
    }

    const updatedQr = await this.qrTokenRepository.update(qrToken.id, { status: QRStatus.EXPIRED });

    if (qrToken.order.status === OrderStatus.QR_GENERATED) {
      await this.orderRepository.updateStatus(orderId, tenantId, OrderStatus.EXPIRED);
      await this.auditService.recordOrderTransition({
        tenantId,
        orderId,
        previousState: OrderStatus.QR_GENERATED,
        newState: OrderStatus.EXPIRED,
        reason: 'QR token expired'
      });
    }

    await cacheProvider.del(cacheKeys.qr(tenantId, orderId));
    return updatedQr;
  }
}
