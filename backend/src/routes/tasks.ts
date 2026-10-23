import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { requireAuth } from "../middleware/auth";
import { getProjectRole } from "../utils/access";
import { parseId, validationError } from "../utils/http";
import { createTaskSchema, updateTaskSchema, commentSchema } from "../schemas/task";
import "../middleware/auth";

// Returns "ADMIN", "MANAGER", "MEMBER", "VIEWER" or null (no access)
async function roleIn(
  user: { id: number; role: string },
  projectId: number
): Promise<"ADMIN" | "MANAGER" | "MEMBER" | "VIEWER" | null> {
  if (user.role === "ADMIN") return "ADMIN";
  if (user.role === "VIEWER") {
    const membership = await getProjectRole(user.id, projectId);
    return membership ? "VIEWER" : null;
  }
  const projectRole = await getProjectRole(user.id, projectId);
  if (!projectRole) return null;
  if (projectRole === "MANAGER") return user.role === "PROJECT_MANAGER" ? "MANAGER" : "MEMBER";
  if (projectRole === "MEMBER") return "MEMBER";
  return "VIEWER";
}
const canManage = (r: string | null) => r === "ADMIN" || r === "MANAGER";

// Assignee must be a non-viewer member of the project
async function validAssignee(projectId: number, userId: number) {
  const [membership, user] = await Promise.all([
    prisma.projectMember.findUnique({ where: { projectId_userId: { projectId, userId } } }),
    prisma.user.findUnique({ where: { id: userId }, select: { isActive: true, role: true } }),
  ]);
  return !!membership && membership.role !== "VIEWER" && !!user?.isActive && user.role !== "VIEWER";
}

const taskInclude = {
  assignee: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
} as const;

// ===================== /projects/:id/tasks =====================
export const projectTasksRouter = Router({ mergeParams: true });
projectTasksRouter.use(requireAuth);

// GET /projects/:id/tasks?status=TODO&priority=HIGH&assigneeId=4
projectTasksRouter.get("/", async (req, res) => {
  const projectId = parseId((req.params as { id: string }).id);
  if (!projectId) return res.status(400).json({ message: "Invalid project id" });
  if (!(await roleIn(req.user!, projectId))) return res.status(404).json({ message: "Project not found" });

  const { status, priority, assigneeId } = req.query;
  const page = Math.max(1, Number.parseInt(String(req.query.page ?? "1"), 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(String(req.query.limit ?? "50"), 10) || 50));
  const search = typeof req.query.search === "string" ? req.query.search.trim().slice(0, 100) : "";
  const where: Prisma.TaskWhereInput = { projectId };
  if (["TODO", "IN_PROGRESS", "DONE"].includes(String(status))) where.status = status as "TODO" | "IN_PROGRESS" | "DONE";
  if (["LOW", "MEDIUM", "HIGH"].includes(String(priority))) where.priority = priority as "LOW" | "MEDIUM" | "HIGH";
  if (assigneeId === "none") where.assigneeId = null;
  else if (parseId(assigneeId)) where.assigneeId = parseId(assigneeId)!;
  if (search) where.OR = [{ title: { contains: search, mode: "insensitive" } }, { description: { contains: search, mode: "insensitive" } }];

  const [tasks, total] = await prisma.$transaction([
    prisma.task.findMany({ where, skip: (page - 1) * limit, take: limit, orderBy: { createdAt: "desc" }, include: taskInclude }),
    prisma.task.count({ where }),
  ]);
  res.json({ tasks, pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } });
});

// POST /projects/:id/tasks   (Admin or Manager)
projectTasksRouter.post("/", async (req, res) => {
  const projectId = parseId((req.params as { id?: string }).id);
  if (!projectId) return res.status(400).json({ message: "Invalid project id" });
  const role = await roleIn(req.user!, projectId);
  if (!role) return res.status(404).json({ message: "Project not found" });
  if (!canManage(role)) return res.status(403).json({ message: "Only an Admin or the project manager can create tasks" });

  const parsed = createTaskSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error);

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (project?.status === "ARCHIVED") return res.status(400).json({ message: "This project is archived" });

  const { assigneeId } = parsed.data;
  if (assigneeId && !(await validAssignee(projectId, assigneeId))) {
    return res.status(400).json({ message: "Assignee must be a Member or Manager of this project" });
  }

  const task = await prisma.task.create({
    data: { ...parsed.data, projectId, createdById: req.user!.id },
    include: taskInclude,
  });
  res.status(201).json({ message: "Task created", task });
});

// ===================== /tasks/:id =====================
export const taskRouter = Router();
taskRouter.use(requireAuth);

// GET /tasks/:id
taskRouter.get("/:id", async (req, res) => {
  const id = parseId((req.params as { id?: string }).id);
  if (!id) return res.status(400).json({ message: "Invalid task id" });
  const task = await prisma.task.findUnique({ where: { id }, include: { ...taskInclude, project: { select: { id: true, name: true } } } });
  if (!task || !(await roleIn(req.user!, task.projectId))) return res.status(404).json({ message: "Task not found" });
  res.json({ task });
});

// PATCH /tasks/:id   Body must include "version"
taskRouter.patch("/:id", async (req, res) => {
  const id = parseId((req.params as { id?: string }).id);
  if (!id) return res.status(400).json({ message: "Invalid task id" });

  const task = await prisma.task.findUnique({ where: { id }, include: { project: { select: { status: true } } } });
  if (!task) return res.status(404).json({ message: "Task not found" });
  const role = await roleIn(req.user!, task.projectId);
  if (!role) return res.status(404).json({ message: "Task not found" });
  if (role === "VIEWER") return res.status(403).json({ message: "Viewers cannot change tasks" });
  if (task.project.status === "ARCHIVED") return res.status(400).json({ message: "Archived projects are read-only" });

  const parsed = updateTaskSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error);
  const { version, ...changes } = parsed.data;

  if (!canManage(role)) {
    // Member: only own tasks, only status + description
    if (task.assigneeId !== req.user!.id) return res.status(403).json({ message: "You can only update tasks assigned to you" });
    const forbidden = Object.keys(changes).filter((k) => !["status", "description"].includes(k));
    if (forbidden.length) return res.status(403).json({ message: `You are not allowed to change: ${forbidden.join(", ")}` });
  }

  if (changes.assigneeId && !(await validAssignee(task.projectId, changes.assigneeId))) {
    return res.status(400).json({ message: "Assignee must be a Member or Manager of this project" });
  }

  // OPTIMISTIC CONCURRENCY: update only if the version still matches
  const result = await prisma.task.updateMany({
    where: { id, version },
    data: { ...changes, version: { increment: 1 } },
  });

  if (result.count === 0) {
    const current = await prisma.task.findUnique({ where: { id }, include: taskInclude });
    return res.status(409).json({
      message: "This task was changed by someone else. Reload and try again.",
      current,
    });
  }

  const updated = await prisma.task.findUnique({ where: { id }, include: taskInclude });
  res.json({ message: "Task updated", task: updated });
});

// DELETE /tasks/:id   (Admin or Manager)
taskRouter.delete("/:id", async (req, res) => {
  const id = parseId((req.params as { id?: string }).id);
  if (!id) return res.status(400).json({ message: "Invalid task id" });
  const task = await prisma.task.findUnique({ where: { id } });
  if (!task) return res.status(404).json({ message: "Task not found" });
  const role = await roleIn(req.user!, task.projectId);
  if (!role) return res.status(404).json({ message: "Task not found" });
  if (!canManage(role)) return res.status(403).json({ message: "Only an Admin or the project manager can delete tasks" });
  const parentProject = await prisma.project.findUnique({ where: { id: task.projectId }, select: { status: true } });
  if (parentProject?.status === "ARCHIVED") return res.status(400).json({ message: "Archived projects are read-only" });

  await prisma.task.delete({ where: { id } });
  res.json({ message: "Task deleted" });
});

// GET /tasks/:id/comments  (oldest first)
taskRouter.get("/:id/comments", async (req, res) => {
  const id = parseId((req.params as { id?: string }).id);
  if (!id) return res.status(400).json({ message: "Invalid task id" });
  const task = await prisma.task.findUnique({ where: { id } });
  if (!task || !(await roleIn(req.user!, task.projectId))) return res.status(404).json({ message: "Task not found" });

  const comments = await prisma.comment.findMany({
    where: { taskId: id },
    orderBy: { createdAt: "asc" },
    include: { author: { select: { id: true, name: true } } },
  });
  res.json({ comments });
});

// POST /tasks/:id/comments  (not for Viewers)
taskRouter.post("/:id/comments", async (req, res) => {
  const id = parseId((req.params as { id?: string }).id);
  if (!id) return res.status(400).json({ message: "Invalid task id" });
  const task = await prisma.task.findUnique({ where: { id } });
  if (!task) return res.status(404).json({ message: "Task not found" });
  const role = await roleIn(req.user!, task.projectId);
  if (!role) return res.status(404).json({ message: "Task not found" });
  if (role === "VIEWER") return res.status(403).json({ message: "Viewers cannot comment" });
  const parentProject = await prisma.project.findUnique({ where: { id: task.projectId }, select: { status: true } });
  if (parentProject?.status === "ARCHIVED") return res.status(400).json({ message: "Archived projects are read-only" });

  const parsed = commentSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error);

  const comment = await prisma.comment.create({
    data: { content: parsed.data.content, taskId: id, authorId: req.user!.id },
    include: { author: { select: { id: true, name: true } } },
  });
  res.status(201).json({ message: "Comment added", comment });
});

// DELETE /tasks/:id/comments/:commentId  (author, Manager or Admin)
taskRouter.delete("/:id/comments/:commentId", async (req, res) => {
  const id = parseId(req.params.id);
  const commentId = parseId(req.params.commentId);
  if (!id || !commentId) return res.status(400).json({ message: "Invalid id" });
  const comment = await prisma.comment.findUnique({ where: { id: commentId }, include: { task: true } });
  if (!comment || comment.taskId !== id) return res.status(404).json({ message: "Comment not found" });
  const role = await roleIn(req.user!, comment.task.projectId);
  if (!role) return res.status(404).json({ message: "Comment not found" });
  const parentProject = await prisma.project.findUnique({ where: { id: comment.task.projectId }, select: { status: true } });
  if (parentProject?.status === "ARCHIVED") return res.status(400).json({ message: "Archived projects are read-only" });
  if (comment.authorId !== req.user!.id && !canManage(role)) {
    return res.status(403).json({ message: "You can only delete your own comments" });
  }
  await prisma.comment.delete({ where: { id: commentId } });
  res.json({ message: "Comment deleted" });
});