import { z } from "zod";

const status = z.enum(["TODO", "IN_PROGRESS", "DONE"]);
const priority = z.enum(["LOW", "MEDIUM", "HIGH"]);

export const createTaskSchema = z.object({
  title: z.string().trim().min(2, "Title must be at least 2 characters").max(150),
  description: z.string().trim().max(2000).optional(),
  status: status.optional(),
  priority: priority.optional(),
  dueDate: z.coerce.date().nullable().optional(),
  assigneeId: z.number().int().positive().nullable().optional(),
});

export const updateTaskSchema = z.object({
  version: z.number().int().positive(), // REQUIRED: the version the client last saw
  title: z.string().trim().min(2).max(150).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  status: status.optional(),
  priority: priority.optional(),
  dueDate: z.coerce.date().nullable().optional(),
  assigneeId: z.number().int().positive().nullable().optional(),
});

export const commentSchema = z.object({
  content: z.string().trim().min(1, "Comment cannot be empty").max(1000),
});