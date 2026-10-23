import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { GlobalRole } from "@prisma/client";
import { prisma } from "../prisma";

// Tell TypeScript that req.user exists after requireAuth runs
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: number;
        name: string;
        email: string;
        role: GlobalRole;
      };
    }
  }
}

// GUARD 1: "Are you logged in?"
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.token;
  if (!token) {
    return res.status(401).json({ message: "Please log in first" });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET as string) as { userId: number };

    // Load the user fresh from the database, so a deactivated user is blocked immediately
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, name: true, email: true, role: true, isActive: true },
    });

    if (!user || !user.isActive) {
      return res.status(401).json({ message: "Account not found or deactivated" });
    }

    req.user = { id: user.id, name: user.name, email: user.email, role: user.role };
    next(); // let the request continue to the route
  } catch {
    return res.status(401).json({ message: "Session expired or invalid. Please log in again" });
  }
}

// GUARD 2: "Is your role allowed here?"  Usage: requireRole("ADMIN", "PROJECT_MANAGER")
export function requireRole(...allowedRoles: GlobalRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: "Please log in first" });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: "You do not have permission to do this" });
    }
    next();
  };
}
