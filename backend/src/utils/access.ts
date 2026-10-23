import { ProjectRole } from "@prisma/client";
import { prisma } from "../prisma";

type CurrentUser = { id: number; role: string };

// Returns the user's role inside a project, or null if they are not a member.
export async function getProjectRole(userId: number, projectId: number): Promise<ProjectRole | null> {
  const membership = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
    select: { role: true },
  });
  return membership ? membership.role : null;
}

// Can this user SEE the project?  Admin: always. Others: only if they are a member.
export async function canViewProject(user: CurrentUser, projectId: number): Promise<boolean> {
  if (user.role === "ADMIN") return true;
  const role = await getProjectRole(user.id, projectId);
  return role !== null;
}

// Can this user MANAGE the project (edit, archive)?  Admin, or MANAGER of that project.
export async function canManageProject(user: CurrentUser, projectId: number): Promise<boolean> {
  if (user.role === "ADMIN") return true;
  const role = await getProjectRole(user.id, projectId);
  return role === "MANAGER";
}