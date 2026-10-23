import { z } from "zod";

export const createProjectSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(100),
  description: z.string().trim().max(1000).optional(),
});

export const updateProjectSchema = z
  .object({
    name: z.string().trim().min(2, "Name must be at least 2 characters").max(100).optional(),
    description: z.string().trim().max(1000).nullable().optional(),
  })
  .refine((data) => data.name !== undefined || data.description !== undefined, {
    message: "Send at least one field to update",
  });

export const assignManagerSchema = z.object({
  userId: z.number().int().positive(),
});