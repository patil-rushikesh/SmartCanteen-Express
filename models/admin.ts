import { z } from 'zod';

export const collegeSchema = z.object({
  name: z.string().min(2),
  code: z.string().min(2).max(20),
  contactEmail: z.email(),
  contactPhone: z.string().optional(),
  address: z.string().optional(),
  defaultCanteenName: z.string().min(2),
  defaultCanteenLocation: z.string().optional()
});

export const updateCollegeSchema = z.object({
  name: z.string().min(2).optional(),
  contactEmail: z.email().optional(),
  contactPhone: z.string().optional(),
  address: z.string().optional(),
  isActive: z.boolean().optional()
});

export const assignManagerSchema = z.object({
  tenantId: z.string().uuid(),
  canteenId: z.string().uuid(),
  email: z.email(),
  password: z.string().min(8),
  fullName: z.string().min(2),
  phone: z.string().min(8)
});

export const idParamSchema = z.object({
  id: z.string().uuid()
});
