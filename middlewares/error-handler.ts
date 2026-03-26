import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { isAppError } from '../utils/errors.js';

export const notFoundHandler = (_req: Request, res: Response) => {
  res.status(404).json({ success: false, message: 'Route not found' });
};

export const errorHandler = (
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  if (isAppError(error)) {
    return res.status(error.statusCode).json({
      success: false,
      message: error.message,
      details: error.details
    });
  }

  if (error instanceof ZodError) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: error.issues
    });
  }

  console.error(error);
  return res.status(500).json({ success: false, message: 'Internal server error' });
};
