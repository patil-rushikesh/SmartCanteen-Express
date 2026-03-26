import { Request, Response } from 'express';
import { container } from '../../lib/container.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { OrderStatus } from '../../models/domain.js';

export const listManagerMenu = asyncHandler(async (req: Request, res: Response) => {
  const items = await container.managerService.listMenuItems(
    req.tenantId!,
    req.user!.userId,
    req.query.canteenId?.toString()
  );
  res.status(200).json({ success: true, data: items });
});

export const createManagerMenuItem = asyncHandler(async (req: Request, res: Response) => {
  const item = await container.managerService.createMenuItem({
    tenantId: req.tenantId!,
    managerId: req.user!.userId,
    ...req.body
  });
  res.status(201).json({ success: true, data: item });
});

export const updateManagerMenuItem = asyncHandler(async (req: Request, res: Response) => {
  const item = await container.managerService.updateMenuItem({
    tenantId: req.tenantId!,
    managerId: req.user!.userId,
    menuItemId: req.params.menuItemId.toString(),
    ...req.body
  });
  res.status(200).json({ success: true, data: item });
});

export const deleteManagerMenuItem = asyncHandler(async (req: Request, res: Response) => {
  const result = await container.managerService.deleteMenuItem(
    req.tenantId!,
    req.user!.userId,
    req.params.menuItemId.toString()
  );
  res.status(200).json({ success: true, data: result });
});

export const listManagerOrders = asyncHandler(async (req: Request, res: Response) => {
  const status = req.query.status ? (req.query.status.toString() as OrderStatus) : undefined;
  const orders = await container.managerService.listOrders(req.tenantId!, req.user!.userId, status);
  res.status(200).json({ success: true, data: orders });
});

export const scanOrderQr = asyncHandler(async (req: Request, res: Response) => {
  const result = await container.managerService.scanQr(
    req.tenantId!,
    req.user!.userId,
    req.body.signedToken
  );
  res.status(200).json({ success: true, data: result });
});

export const updateManagerOrderStatus = asyncHandler(async (req: Request, res: Response) => {
  const result = await container.managerService.updateOrderStatus({
    tenantId: req.tenantId!,
    managerId: req.user!.userId,
    orderId: req.params.orderId.toString(),
    nextStatus: req.body.nextStatus,
    reason: req.body.reason
  });
  res.status(200).json({ success: true, data: result });
});

export const managerPaymentReport = asyncHandler(async (req: Request, res: Response) => {
  const payments = await container.managerService.getPaymentReport(req.tenantId!, req.user!.userId);
  res.status(200).json({ success: true, data: payments });
});
