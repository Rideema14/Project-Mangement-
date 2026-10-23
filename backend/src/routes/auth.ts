import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../prisma";
import { loginSchema } from "../schemas/auth";
import { requireAuth } from "../middleware/auth";

const router = Router();

const EIGHT_HOURS = 60 * 60 * 8; // in seconds

const cookieOptions = {
  httpOnly: true, // JavaScript in the browser cannot read it
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production", // https only in production
};

// POST /auth/login
router.post("/login", async (req, res) => {
  // 1. Validate the input
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      message: "Invalid input",
      errors: parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
    });
  }
  const { email, password } = parsed.data;

  // 2. Find the user
  const user = await prisma.user.findUnique({ where: { email } });

  // 3. Check the password. Same message for "no user" and "wrong password",
  //    so attackers cannot find out which emails exist.
  const passwordOk = user ? await bcrypt.compare(password, user.passwordHash) : false;
  if (!user || !passwordOk) {
    return res.status(401).json({ message: "Invalid email or password" });
  }
  if (!user.isActive) {
    return res.status(403).json({ message: "This account has been deactivated" });
  }

  // 4. Create the token and put it in an httpOnly cookie
  const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET as string, {
    expiresIn: EIGHT_HOURS,
  });
  res.cookie("token", token, { ...cookieOptions, maxAge: EIGHT_HOURS * 1000 });

  res.json({
    message: "Login successful",
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
});

// POST /auth/logout
router.post("/logout", (_req, res) => {
  res.clearCookie("token", cookieOptions);
  res.json({ message: "Logged out" });
});

// GET /auth/me  (protected)
router.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

export default router;
