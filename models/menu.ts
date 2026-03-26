import { z } from 'zod';

export const menuItemSchema = z.object({
  canteenId: z.string().uuid(),
  name: z.string().min(2),
  description: z.string().optional(),
  category: z.string().optional(),
  priceInPaise: z.number().int().positive(),
  stockQuantity: z.number().int().min(0).default(0),
  isAvailable: z.boolean().default(true),
  imageBase64: z.string().optional()
});

export const menuItemUpdateSchema = menuItemSchema.partial().extend({
  canteenId: z.string().uuid().optional()
});

export const menuFilterSchema = z.object({
  canteenId: z.string().uuid().optional()
});

export const menuItemIdParamSchema = z.object({
  menuItemId: z.string().uuid()
});
