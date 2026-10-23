import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { canViewProject, canManageProject } from "../utils/access";
import { createProjectSchema, updateProjectSchema, assignManagerSchema } from "../schemas/project";
import { addMemberSchema, updateMemberSchema } from "../schemas/member";

const router = Router();

// Every route in this file requires login
router.use(requireAuth);

// Turn ":id" from the URL into a number, or null if it is not a valid number
function parseId(value: string | string[] | undefined): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function validationError(res: any, error: any) {
  return res.status(400).json({
    message: "Invalid input",
    errors: error.issues.map((i: any) => ({ field: i.path.join("."), message: i.message })),
  });
}

// GET /projects  -> projects this user may see
router.get("/", async (req, res) => {
  const user = req.user!;
  const page = Math.max(1, Number.parseInt(String(req.query.page ?? "1"), 10) || 1);
  const limit = Math.min(50, Math.max(1, Number.parseInt(String(req.query.limit ?? "50"), 10) || 50));
  const search = typeof req.query.search === "string" ? req.query.search.trim().slice(0, 100) : "";
  const status = req.query.status === "ACTIVE" || req.query.status === "ARCHIVED" ? req.query.status : undefined;
  const where: Prisma.ProjectWhereInput = user.role === "ADMIN" ? {} : { members: { some: { userId: user.id } } };
  if (search) where.name = { contains: search, mode: "insensitive" };
  if (status) where.status = status;

  const [projects, total] = await prisma.$transaction([
    prisma.project.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { tasks: true, members: true } },
        members: { where: { role: "MANAGER" }, select: { user: { select: { id: true, name: true } } } },
      },
    }),
    prisma.project.count({ where }),
  ]);
  res.json({ projects, pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } });
});

// GET /projects/:id  -> one project with members and tasks
router.get("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: "Invalid project id" });

  // Not allowed to see it? Say "not found" so its existence stays hidden.
  if (!(await canViewProject(req.user!, id))) {
    return res.status(404).json({ message: "Project not found" });
  }

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      createdBy: { select: { id: true, name: true } },
      members: {
        orderBy: { addedAt: "asc" },
        select: { id: true, role: true, user: { select: { id: true, name: true, email: true } } },
      },
      tasks: {
        orderBy: { createdAt: "desc" },
        include: { assignee: { select: { id: true, name: true } } },
      },
    },
  });

  if (!project) return res.status(404).json({ message: "Project not found" });
  res.json({ project });
});


// GET /projects/:id/available-members - users a manager can add to this project
router.get("/:id/available-members", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: "Invalid project id" });
  if (!(await canViewProject(req.user!, id))) return res.status(404).json({ message: "Project not found" });
  if (!(await canManageProject(req.user!, id))) return res.status(403).json({ message: "Only an Admin or project manager can manage members" });
  const users = await prisma.user.findMany({
    where: { isActive: true, role: { not: "ADMIN" }, memberships: { none: { projectId: id } } },
    orderBy: { name: "asc" }, select: { id: true, name: true, email: true, role: true, isActive: true },
  });
  res.json({ users });
});

// GET /projects/:id/members
router.get("/:id/members", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: "Invalid project id" });
  if (!(await canViewProject(req.user!, id))) return res.status(404).json({ message: "Project not found" });
  const members = await prisma.projectMember.findMany({
    where: { projectId: id }, orderBy: { addedAt: "asc" },
    select: { id: true, role: true, addedAt: true, user: { select: { id: true, name: true, email: true, role: true, isActive: true } } },
  });
  res.json({ members });
});

// POST /projects/:id/members - Admin or project manager
router.post("/:id/members", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: "Invalid project id" });
  if (!(await canViewProject(req.user!, id))) return res.status(404).json({ message: "Project not found" });
  if (!(await canManageProject(req.user!, id))) return res.status(403).json({ message: "Only an Admin or project manager can manage members" });
  const projectState = await prisma.project.findUnique({ where: { id }, select: { status: true } });
  if (projectState?.status === "ARCHIVED") return res.status(400).json({ message: "Archived projects are read-only" });
  const parsed = addMemberSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error);
  const target = await prisma.user.findUnique({ where: { id: parsed.data.userId } });
  if (!target || !target.isActive) return res.status(404).json({ message: "Active user not found" });
  if (target.role === "ADMIN") return res.status(400).json({ message: "Admins already have access to every project" });
  if (target.role === "VIEWER" && parsed.data.role !== "VIEWER") return res.status(400).json({ message: "Viewer accounts must have read-only project access" });
  const member = await prisma.projectMember.upsert({
    where: { projectId_userId: { projectId: id, userId: target.id } },
    update: { role: parsed.data.role },
    create: { projectId: id, userId: target.id, role: parsed.data.role },
    include: { user: { select: { id: true, name: true, email: true, role: true, isActive: true } } },
  });
  res.status(201).json({ message: "Team member saved", member });
});

// PATCH /projects/:id/members/:userId
router.patch("/:id/members/:userId", async (req, res) => {
  const id = parseId(req.params.id); const userId = parseId(req.params.userId);
  if (!id || !userId) return res.status(400).json({ message: "Invalid project or user id" });
  if (!(await canViewProject(req.user!, id))) return res.status(404).json({ message: "Project not found" });
  if (!(await canManageProject(req.user!, id))) return res.status(403).json({ message: "Only an Admin or project manager can manage members" });
  const projectState = await prisma.project.findUnique({ where: { id }, select: { status: true } });
  if (projectState?.status === "ARCHIVED") return res.status(400).json({ message: "Archived projects are read-only" });
  const parsed = updateMemberSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error);
  const targetUser = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, isActive: true } });
  if (!targetUser || !targetUser.isActive) return res.status(404).json({ message: "Active project member not found" });
  if (targetUser.role === "VIEWER" && parsed.data.role !== "VIEWER") return res.status(400).json({ message: "Viewer accounts must have read-only project access" });
  const member = await prisma.projectMember.update({ where: { projectId_userId: { projectId: id, userId } }, data: { role: parsed.data.role }, include: { user: { select: { id: true, name: true, email: true, role: true } } } }).catch(() => null);
  if (!member) return res.status(404).json({ message: "Project member not found" });
  res.json({ message: "Member role updated", member });
});

// DELETE /projects/:id/members/:userId
router.delete("/:id/members/:userId", async (req, res) => {
  const id = parseId(req.params.id); const userId = parseId(req.params.userId);
  if (!id || !userId) return res.status(400).json({ message: "Invalid project or user id" });
  if (!(await canViewProject(req.user!, id))) return res.status(404).json({ message: "Project not found" });
  if (!(await canManageProject(req.user!, id))) return res.status(403).json({ message: "Only an Admin or project manager can manage members" });
  const projectState = await prisma.project.findUnique({ where: { id }, select: { status: true } });
  if (projectState?.status === "ARCHIVED") return res.status(400).json({ message: "Archived projects are read-only" });
  const member = await prisma.projectMember.findUnique({ where: { projectId_userId: { projectId: id, userId } } });
  if (!member) return res.status(404).json({ message: "Project member not found" });
  if (member.role === "MANAGER") return res.status(400).json({ message: "Assign another manager before removing the current manager" });
  await prisma.projectMember.delete({ where: { projectId_userId: { projectId: id, userId } } });
  res.json({ message: "Member removed" });
});

// POST /projects  -> ADMIN only
router.post("/", requireRole("ADMIN"), async (req, res) => {
  const parsed = createProjectSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error);

  const project = await prisma.project.create({
    data: { ...parsed.data, createdById: req.user!.id },
  });
  res.status(201).json({ message: "Project created", project });
});

// PATCH /projects/:id  -> Admin or that project's Manager
router.patch("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: "Invalid project id" });

  if (!(await canViewProject(req.user!, id))) {
    return res.status(404).json({ message: "Project not found" });
  }
  if (!(await canManageProject(req.user!, id))) {
    return res.status(403).json({ message: "Only an Admin or the project manager can edit this project" });
  }

  const existingProject = await prisma.project.findUnique({ where: { id }, select: { status: true } });
  if (existingProject?.status === "ARCHIVED") return res.status(400).json({ message: "Archived projects are read-only" });
  const parsed = updateProjectSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error);

  const project = await prisma.project.update({ where: { id }, data: parsed.data });
  res.json({ message: "Project updated", project });
});

// PATCH /projects/:id/archive  -> Admin or that project's Manager
router.patch("/:id/archive", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: "Invalid project id" });

  if (!(await canViewProject(req.user!, id))) {
    return res.status(404).json({ message: "Project not found" });
  }
  if (!(await canManageProject(req.user!, id))) {
    return res.status(403).json({ message: "Only an Admin or the project manager can archive this project" });
  }

  const project = await prisma.project.update({ where: { id }, data: { status: "ARCHIVED" } });
  res.json({ message: "Project archived", project });
});

// PATCH /projects/:id/restore -> Admin or that project's Manager
router.patch("/:id/restore", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: "Invalid project id" });
  if (!(await canViewProject(req.user!, id))) return res.status(404).json({ message: "Project not found" });
  if (!(await canManageProject(req.user!, id))) return res.status(403).json({ message: "Only an Admin or the project manager can restore this project" });
  const project = await prisma.project.update({ where: { id }, data: { status: "ACTIVE" } });
  return res.json({ message: "Project restored", project });
});

// DELETE /projects/:id  -> ADMIN only
router.delete("/:id", requireRole("ADMIN"), async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: "Invalid project id" });

  const exists = await prisma.project.findUnique({ where: { id }, select: { id: true } });
  if (!exists) return res.status(404).json({ message: "Project not found" });

  await prisma.project.delete({ where: { id } }); // cascade removes its members, tasks, comments
  res.json({ message: "Project deleted" });
});

// PATCH /projects/:id/manager  -> ADMIN only. Body: { "userId": 2 }
router.patch("/:id/manager", requireRole("ADMIN"), async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: "Invalid project id" });

  const parsed = assignManagerSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error);

  const project = await prisma.project.findUnique({ where: { id }, select: { id: true } });
  if (!project) return res.status(404).json({ message: "Project not found" });

  const target = await prisma.user.findUnique({ where: { id: parsed.data.userId } });
  if (!target || !target.isActive) return res.status(404).json({ message: "User not found" });
  if (target.role !== "PROJECT_MANAGER") {
    return res.status(400).json({ message: "Only an active Project Manager account can be assigned as project manager" });
  }

  // Keep one project manager at a time. Demote a previous manager before assigning the new one.
  const member = await prisma.$transaction(async (tx) => {
    await tx.projectMember.updateMany({
      where: { projectId: id, role: "MANAGER", userId: { not: target.id } },
      data: { role: "MEMBER" },
    });
    return tx.projectMember.upsert({
      where: { projectId_userId: { projectId: id, userId: target.id } },
      update: { role: "MANAGER" },
      create: { projectId: id, userId: target.id, role: "MANAGER" },
    });
  });

  res.json({ message: "Manager assigned", member });
});

export default router;
