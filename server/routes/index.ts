import type { Express } from "express";
import { createServer, type Server } from "http";
import path from "path";
import express from "express";
import { initializeAdminUser } from "../auth";
import { registerAuthRoutes } from "./auth";
import { registerUserRoutes } from "./users";
import { registerFilamentRoutes } from "./filaments";
import { registerBatchRoutes } from "./batch";
import { registerSettingsRoutes } from "./settings";
import { registerPublicRoutes } from "./public";
import { registerStatisticsRoutes } from "./statistics";
import { registerThemeRoutes } from "./theme";
import { registerAIRoutes } from "./ai";
// All routes have been extracted - routes.ts is now empty or contains only legacy code
// Keeping registerRemainingRoutes import for backward compatibility
import { registerRemainingRoutes } from "../routes";

/**
 * Register all routes for the application
 * This function combines routes from separate files with remaining routes
 * from routes.ts for backward compatibility during migration
 */
export async function registerRoutes(app: Express): Promise<Server> {
  // Initialize admin user
  await initializeAdminUser();

  // Serve static files from uploads directory
  const uploadsPath = path.join(process.cwd(), "public", "uploads");
  app.use("/uploads", express.static(uploadsPath));

  // Register routes from separate files (all routes extracted)
  registerAuthRoutes(app);
  registerUserRoutes(app);
  // IMPORTANT: Batch routes must be registered BEFORE filament routes
  // so /api/filaments/batch doesn't match /api/filaments/:id
  registerBatchRoutes(app);
  registerFilamentRoutes(app);
  registerSettingsRoutes(app);
  registerPublicRoutes(app);
  registerStatisticsRoutes(app);
  registerThemeRoutes(app);
  registerAIRoutes(app);

  // Register any remaining routes from routes.ts (should be empty now)
  registerRemainingRoutes(app);

  const httpServer = createServer(app);
  return httpServer;
}

