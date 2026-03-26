import { Request, Response } from 'express';
import { container } from '../../lib/container.js';
import { asyncHandler } from '../../utils/async-handler.js';

export const listColleges = asyncHandler(async (_req: Request, res: Response) => {
  const colleges = await container.adminService.listColleges();
  res.status(200).json({ success: true, data: colleges });
});

export const createCollege = asyncHandler(async (req: Request, res: Response) => {
  const college = await container.adminService.createCollege(req.body);
  res.status(201).json({ success: true, data: college });
});

export const updateCollege = asyncHandler(async (req: Request, res: Response) => {
  const college = await container.adminService.updateCollege(req.params.id.toString(), req.body);
  res.status(200).json({ success: true, data: college });
});

export const deleteCollege = asyncHandler(async (req: Request, res: Response) => {
  const college = await container.adminService.deactivateCollege(req.params.id.toString());
  res.status(200).json({ success: true, data: college });
});

export const assignManager = asyncHandler(async (req: Request, res: Response) => {
  const assignment = await container.adminService.assignManager(req.body);
  res.status(201).json({ success: true, data: assignment });
});

export const listManagers = asyncHandler(async (req: Request, res: Response) => {
  const managers = await container.adminService.listManagers(req.params.id.toString());
  res.status(200).json({ success: true, data: managers });
});

export const overviewAnalytics = asyncHandler(async (_req: Request, res: Response) => {
  const analytics = await container.adminService.getOverviewAnalytics();
  res.status(200).json({ success: true, data: analytics });
});
