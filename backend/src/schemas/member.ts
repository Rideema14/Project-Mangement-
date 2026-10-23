import { z } from "zod";

export const addMemberSchema = z.object({
  userId: z.number().int().positive(),
  role: z.enum(["MEMBER", "VIEWER"]).default("MEMBER"),
});

export const updateMemberSchema = z.object({
  role: z.enum(["MEMBER", "VIEWER"]),
});
