import { z } from 'zod';
import { OrderStatus } from './domain.js';

export const cartItemSchema = z.object({
  menuItemId: z.string().uuid(),
  quantity: z.number().int().positive()
});

export const cartSchema = z.object({
  items: z.array(cartItemSchema)
});

export const createOrderSchema = z.object({
  canteenId: z.string().uuid(),
  items: z.array(cartItemSchema).min(1)
});

export const orderIdParamSchema = z.object({
  orderId: z.string().uuid()
});

export const initiatePaymentSchema = z.object({
  idempotencyKey: z.string().min(8)
});

export const verifyPaymentSchema = z.object({
  providerOrderId: z.string().min(4),
  providerPaymentId: z.string().min(4),
  signature: z.string().min(8)
});

export const scanQrSchema = z.object({
  signedToken: z.string().min(20)
});

export const managerOrderStatusSchema = z.object({
  nextStatus: z.enum([
    OrderStatus.PREPARING,
    OrderStatus.READY,
    OrderStatus.COMPLETED,
    OrderStatus.CANCELLED,
    OrderStatus.REFUNDED
  ]),
  reason: z.string().optional()
});

export const reportIssueSchema = z.object({
  reason: z.string().min(5)
});
