
import { PrismaClient } from "@prisma/client";

// One shared database connection for the whole backend
export const prisma = new PrismaClient();