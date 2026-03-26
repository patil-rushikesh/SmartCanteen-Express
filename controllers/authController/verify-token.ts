import { Request, Response } from 'express';
import { authenticate } from '../../middlewares/authenticate.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { container } from '../../lib/container.js';

export const verifyToken = authenticate;

export const verifyTokenController = asyncHandler(async (req: Request, res: Response) => {
  const user = await container.authService.getCurrentUser(req.user!.userId);
  res.status(200).json({
    success: true,
    message: 'Token is valid',
    data: user
  });
});
