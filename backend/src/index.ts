import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { prisma } from "./prisma";
import authRoutes from "./routes/auth";
import projectRoutes from "./routes/projects";
import { projectTasksRouter, taskRouter } from "./routes/tasks";
import userRoutes from "./routes/users";
if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET is missing in .env");
}

const app = express();
const PORT = Number(process.env.PORT) || 4000;

// ---------- Middleware ----------
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

// ---------- Routes ----------
app.get("/api/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    const users = await prisma.user.count();
    res.json({ status: "ok", database: "connected", users });
  } catch (error) {
    console.error(error);
    res.status(500).json({ status: "error", database: "not connected" });
  }
});

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/projects/:id/tasks", projectTasksRouter);
app.use("/api/tasks", taskRouter);

// ---------- Unknown route -> 404 ----------
app.use((_req, res) => {
  res.status(404).json({ message: "Route not found" });
});

// ---------- Any unexpected error -> 500 ----------
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ message: "Something went wrong on the server" });
});

const server = app.listen(PORT, () => {
  console.log(`Backend running at http://localhost:${PORT}`);
});

process.on("SIGINT", async () => {
  server.close();
  await prisma.$disconnect();
  process.exit(0);
});
process.on("SIGTERM", async () => {
  server.close();
  await prisma.$disconnect();
  process.exit(0);
});