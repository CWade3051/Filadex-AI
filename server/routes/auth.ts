import type { Express } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { users, changePasswordSchema } from "../../shared/schema";
import { authenticate, hashPassword, verifyPassword, generateToken } from "../auth";
import { logger as appLogger } from "../utils/logger";

export function registerAuthRoutes(app: Express): void {
  // Login
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password } = req.body;

      const [user] = await db.select().from(users).where(eq(users.username, username));

      if (!user || !(await verifyPassword(password, user.password))) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      // Update last login
      await db.update(users)
        .set({ lastLogin: new Date() })
        .where(eq(users.id, user.id));

      // Generate token
      const token = generateToken(user.id);

      // Set cookie
      // Note: secure should only be true with HTTPS. For local/docker HTTP access, keep it false
      const isSecure = process.env.NODE_ENV === "production" && req.secure;
      res.cookie("token", token, {
        httpOnly: true,
        secure: isSecure,
        sameSite: isSecure ? "strict" : "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      });

      // Return user info (without password)
      const { password: _, ...userWithoutPassword } = user;

      res.json({
        user: userWithoutPassword,
        forceChangePassword: user.forceChangePassword
      });
    } catch (error) {
      appLogger.error("Login error:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // Logout
  app.post("/api/auth/logout", (_req, res) => {
    res.clearCookie("token");
    res.json({ message: "Logged out successfully" });
  });

  // Get current user
  app.get("/api/auth/me", authenticate, async (req, res) => {
    try {
      const [user] = await db.select().from(users).where(eq(users.id, req.userId));

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const { password, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error) {
      appLogger.error("Get user error:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // Change password
  app.post("/api/auth/change-password", authenticate, async (req, res) => {
    try {
      const result = changePasswordSchema.safeParse(req.body);

      if (!result.success) {
        return res.status(400).json({ message: "Invalid input", errors: result.error.format() });
      }

      const { currentPassword, newPassword } = result.data;

      const [user] = await db.select().from(users).where(eq(users.id, req.userId));

      if (!user || !(await verifyPassword(currentPassword, user.password))) {
        return res.status(401).json({ message: "Current password is incorrect" });
      }

      const hashedPassword = await hashPassword(newPassword);

      await db.update(users)
        .set({
          password: hashedPassword,
          forceChangePassword: false
        })
        .where(eq(users.id, req.userId));

      res.json({ message: "Password updated successfully" });
    } catch (error) {
      appLogger.error("Change password error:", error);
      res.status(500).json({ message: "Server error" });
    }
  });
}

