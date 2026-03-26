import { NextFunction, Request, Response } from 'express';
import { RoleCode } from '../models/domain.js';

export const authorize =
  (...roles: RoleCode[]) =>
  (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Unauthenticated request' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    next();
  };
