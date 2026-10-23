import { Router } from "express";
import bcrypt from "bcryptjs";
import { GlobalRole } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { parseId, validationError } from "../utils/http";

const router = Router();
router.use(requireAuth, requireRole("ADMIN"));

const createUserSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(100),
  role: z.nativeEnum(GlobalRole),
});
const updateUserSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  role: z.nativeEnum(GlobalRole).optional(),
  isActive: z.boolean().optional(),
}).refine((data) => Object.keys(data).length > 0, { message: "Send at least one field to update" });

router.get("/", async (_req, res) => {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true, _count: { select: { memberships: true, assignedTasks: true } } },
  });
  res.json({ users });
});

router.post("/", async (req, res) => {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error);
  const { name, email, password, role } = parsed.data;
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return res.status(409).json({ message: "A user with this email already exists" });
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({ data: { name, email, passwordHash, role }, select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true } });
  res.status(201).json({ message: "User created", user });
});

router.patch("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: "Invalid user id" });
  const parsed = updateUserSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error);
  if (id === req.user!.id && parsed.data.isActive === false) return res.status(400).json({ message: "You cannot deactivate your own account" });
  const exists = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!exists) return res.status(404).json({ message: "User not found" });
  const user = await prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({ where: { id }, data: parsed.data, select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true } });
    if (parsed.data.isActive === false || (parsed.data.role && parsed.data.role !== "PROJECT_MANAGER")) {
      await tx.projectMember.updateMany({ where: { userId: id, role: "MANAGER" }, data: { role: "MEMBER" } });
    }
    return updated;
  });
  res.json({ message: "User updated", user });
});

export default router;
