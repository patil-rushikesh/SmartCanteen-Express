import { Request, Response } from 'express';
import { container } from '../../lib/container.js';
import { asyncHandler } from '../../utils/async-handler.js';

export const browseMenu = asyncHandler(async (req: Request, res: Response) => {
  const items = await container.customerService.listMenu(req.tenantId!, req.query.canteenId?.toString());
  res.status(200).json({ success: true, data: items });
});

export const getCart = asyncHandler(async (req: Request, res: Response) => {
  const cart = await container.customerService.getCart(req.tenantId!, req.user!.userId);
  res.status(200).json({ success: true, data: cart });
});

export const setCart = asyncHandler(async (req: Request, res: Response) => {
  const cart = await container.customerService.setCart(req.tenantId!, req.user!.userId, req.body.items);
  res.status(200).json({ success: true, data: cart });
});

export const clearCart = asyncHandler(async (req: Request, res: Response) => {
  await container.customerService.clearCart(req.tenantId!, req.user!.userId);
  res.status(200).json({ success: true, message: 'Cart cleared' });
});

export const createOrder = asyncHandler(async (req: Request, res: Response) => {
  const order = await container.customerService.createOrder({
    tenantId: req.tenantId!,
    customerId: req.user!.userId,
    canteenId: req.body.canteenId,
    items: req.body.items
  });
  res.status(201).json({ success: true, data: order });
});

export const listOrders = asyncHandler(async (req: Request, res: Response) => {
  const orders = await container.customerService.listOrders(req.tenantId!, req.user!.userId);
  res.status(200).json({ success: true, data: orders });
});

export const getOrderQr = asyncHandler(async (req: Request, res: Response) => {
  const qr = await container.customerService.getQrForOrder(
    req.tenantId!,
    req.user!.userId,
    req.params.orderId.toString()
  );
  res.status(200).json({ success: true, data: qr });
});

export const reportIssue = asyncHandler(async (req: Request, res: Response) => {
  const order = await container.customerService.reportIssue({
    tenantId: req.tenantId!,
    customerId: req.user!.userId,
    orderId: req.params.orderId.toString(),
    reason: req.body.reason
  });
  res.status(200).json({ success: true, data: order });
});
