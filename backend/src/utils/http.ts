import { Response } from "express";
import { ZodError } from "zod";

// Turns a URL value like "5" into the number 5, or null if invalid
export function parseId(value: unknown): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// Sends a 400 response listing which fields were wrong
export function validationError(res: Response, error: ZodError) {
  return res.status(400).json({
    message: "Invalid input",
    errors: error.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
  });
}