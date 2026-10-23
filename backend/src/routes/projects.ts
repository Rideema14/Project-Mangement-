import { Router } from "express";
import { prisma } from "../prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { canViewProject, canManageProject } from "../utils/access";
import { createProjectSchema, updateProjectSchema, assignManagerSchema } from "../schemas/project";

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
  const where = user.role === "ADMIN" ? {} : { members: { some: { userId: user.id } } };

  const projects = await prisma.project.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { tasks: true, members: true } },
      members: {
        where: { role: "MANAGER" },
        select: { user: { select: { id: true, name: true } } },
      },
    },
  });

  res.json({ projects });
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
  if (target.role !== "PROJECT_MANAGER" && target.role !== "ADMIN") {
    return res.status(400).json({ message: "Only users with the Project Manager role can be assigned as manager" });
  }

  // Add the user as MANAGER, or upgrade them if they are already a member
  const member = await prisma.projectMember.upsert({
    where: { projectId_userId: { projectId: id, userId: target.id } },
    update: { role: "MANAGER" },
    create: { projectId: id, userId: target.id, role: "MANAGER" },
  });

  res.json({ message: "Manager assigned", member });
});

export default router;
