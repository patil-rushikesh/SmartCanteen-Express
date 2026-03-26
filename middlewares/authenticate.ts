import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { verifyAccessToken } from '../utils/jwt.js';

export const authenticate = (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '').trim();

    if (!token) {
      return res.status(401).json({ success: false, message: 'Authorization token is required' });
    }

    const payload = verifyAccessToken(token);
    req.user = {
      userId: payload.sub,
      tenantId: payload.tenantId,
      role: payload.role,
      email: payload.email
    };

    next();
  } catch (error) {
    const message =
      error instanceof jwt.TokenExpiredError ? 'Access token has expired' : 'Invalid access token';
    return res.status(401).json({ success: false, message });
  }
};
