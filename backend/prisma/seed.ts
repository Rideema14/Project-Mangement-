import { PrismaClient, GlobalRole, ProjectRole, TaskStatus, TaskPriority } from "@prisma/client";
import bcrypt from "bcryptjs";



const prisma = new PrismaClient();

// One shared password for all sample accounts (LOCAL TESTING ONLY)
const SAMPLE_PASSWORD = "Password@123";

async function main() {
  console.log("Clearing old data...");
  // Order matters: delete children before parents
  await prisma.comment.deleteMany();
  await prisma.task.deleteMany();
  await prisma.projectMember.deleteMany();
  await prisma.project.deleteMany();
  await prisma.user.deleteMany();

  console.log("Creating users...");
  const passwordHash = await bcrypt.hash(SAMPLE_PASSWORD, 10);

  const admin = await prisma.user.create({
    data: { name: "Aarav Admin", email: "admin@neostats.com", passwordHash, role: GlobalRole.ADMIN },
  });
  const manager = await prisma.user.create({
    data: { name: "Priya Manager", email: "manager@neostats.com", passwordHash, role: GlobalRole.PROJECT_MANAGER },
  });
  const manager2 = await prisma.user.create({
    data: { name: "Karan Manager", email: "manager2@neostats.com", passwordHash, role: GlobalRole.PROJECT_MANAGER },
  });
  const member = await prisma.user.create({
    data: { name: "Rahul Member", email: "member@neostats.com", passwordHash, role: GlobalRole.TEAM_MEMBER },
  });
  const member2 = await prisma.user.create({
    data: { name: "Sneha Member", email: "member2@neostats.com", passwordHash, role: GlobalRole.TEAM_MEMBER },
  });
  const viewer = await prisma.user.create({
    data: { name: "Anita Viewer", email: "viewer@neostats.com", passwordHash, role: GlobalRole.VIEWER },
  });

  console.log("Creating projects...");
  const website = await prisma.project.create({
    data: {
      name: "Website Redesign",
      description: "Redesign the company website with a modern look.",
      createdById: admin.id,
    },
  });
  const mobile = await prisma.project.create({
    data: {
      name: "Mobile App Launch",
      description: "Build and launch the first version of our mobile app.",
      createdById: admin.id,
    },
  });

  console.log("Adding project members...");
  await prisma.projectMember.createMany({
    data: [
      // Website Redesign: Priya manages it
      { projectId: website.id, userId: manager.id, role: ProjectRole.MANAGER },
      { projectId: website.id, userId: member.id, role: ProjectRole.MEMBER },
      { projectId: website.id, userId: member2.id, role: ProjectRole.MEMBER },
      { projectId: website.id, userId: viewer.id, role: ProjectRole.VIEWER },
      // Mobile App Launch: Karan manages it
      { projectId: mobile.id, userId: manager2.id, role: ProjectRole.MANAGER },
      { projectId: mobile.id, userId: member2.id, role: ProjectRole.MEMBER },
    ],
  });

  console.log("Creating tasks...");
  const task1 = await prisma.task.create({
    data: {
      title: "Design homepage",
      description: "Create the homepage layout in Figma.",
      status: TaskStatus.IN_PROGRESS,
      priority: TaskPriority.HIGH,
      dueDate: new Date("2026-11-05"),
      projectId: website.id,
      assigneeId: member.id,
      createdById: manager.id,
    },
  });
  const task2 = await prisma.task.create({
    data: {
      title: "Write About Us page content",
      status: TaskStatus.TODO,
      priority: TaskPriority.MEDIUM,
      dueDate: new Date("2026-11-10"),
      projectId: website.id,
      assigneeId: member2.id,
      createdById: manager.id,
    },
  });
  await prisma.task.create({
    data: {
      title: "Set up hosting",
      status: TaskStatus.DONE,
      priority: TaskPriority.LOW,
      projectId: website.id,
      assigneeId: member.id,
      createdById: manager.id,
    },
  });
  await prisma.task.create({
    data: {
      title: "Create app login screen",
      description: "Design and build the login screen.",
      status: TaskStatus.TODO,
      priority: TaskPriority.HIGH,
      dueDate: new Date("2026-11-15"),
      projectId: mobile.id,
      assigneeId: member2.id,
      createdById: manager2.id,
    },
  });
  await prisma.task.create({
    data: {
      title: "Plan app release checklist",
      status: TaskStatus.IN_PROGRESS,
      priority: TaskPriority.MEDIUM,
      projectId: mobile.id,
      createdById: manager2.id, // no assignee on purpose
    },
  });

  console.log("Creating comments...");
  await prisma.comment.createMany({
    data: [
      { taskId: task1.id, authorId: manager.id, content: "Please follow the new brand colors." },
      { taskId: task1.id, authorId: member.id, content: "Started work. First draft ready tomorrow." },
      { taskId: task2.id, authorId: member2.id, content: "Do we have the final text from marketing?" },
    ],
  });

  console.log("\nSeed finished successfully!");
  console.log("Login password for ALL sample users: " + SAMPLE_PASSWORD);
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });