import { z } from 'zod';

export const registerSchema = z.object({
  tenantId: z.string().uuid(),
  email: z.email(),
  password: z.string().min(8),
  fullName: z.string().min(2),
  phone: z.string().min(8),
  studentFacultyId: z.string().optional(),
  yearOfStudy: z.number().int().min(1).max(8).optional()
});

export const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(8)
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(20)
});
