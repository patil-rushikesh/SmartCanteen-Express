import { Request, Response } from 'express';
import { container } from '../../lib/container.js';
import { asyncHandler } from '../../utils/async-handler.js';

export const registerCustomer = asyncHandler(async (req: Request, res: Response) => {
  const response = await container.authService.registerCustomer(req.body);
  res.status(201).json({ success: true, data: response });
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const response = await container.authService.login(req.body.email, req.body.password);
  res.status(200).json({ success: true, data: response });
});

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const response = await container.authService.refresh(req.body.refreshToken);
  res.status(200).json({ success: true, data: response });
});

export const me = asyncHandler(async (req: Request, res: Response) => {
  const user = await container.authService.getCurrentUser(req.user!.userId);
  res.status(200).json({ success: true, data: user });
});
