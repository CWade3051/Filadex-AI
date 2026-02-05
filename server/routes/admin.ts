import type { Express, Request, Response } from "express";
import { count } from "drizzle-orm";
import { db } from "../db";
import {
  users,
  filaments,
  manufacturers,
  materials,
  colors,
  diameters,
  storageLocations,
  printers,
  slicers,
  userSharing,
  printJobs,
  filamentHistory,
  materialCompatibility,
  slicerProfiles,
  filamentSlicerProfiles,
  cloudBackupConfigs,
  backupHistory,
  uploadSessions,
  pendingUploads,
} from "../../shared/schema";
import { authenticate, isAdmin, hashPassword } from "../auth";
import { logger as appLogger } from "../utils/logger";
import { encrypt, isValidOpenAIKeyFormat } from "../utils/encryption";
import fs from "fs";
import path from "path";

export function registerAdminRoutes(app: Express): void {
  // Factory reset endpoint (admin only)
  app.post("/api/admin/factory-reset", authenticate, isAdmin, async (req: Request, res: Response) => {
    try {
      const { confirmation } = req.body;

      // Require exact confirmation text
      if (confirmation !== "RESET ALL DATA") {
        return res.status(400).json({ 
          message: "Invalid confirmation. You must type 'RESET ALL DATA' exactly to proceed." 
        });
      }

      appLogger.warn(`Factory reset initiated by user ID: ${req.userId}`);

      // Step 1: Delete all data from tables (order matters due to foreign keys)
      appLogger.info("Deleting all data from tables...");
      
      // Delete dependent tables first
      await db.delete(filamentHistory);
      await db.delete(printJobs);
      await db.delete(pendingUploads);
      await db.delete(uploadSessions);
      await db.delete(filamentSlicerProfiles);
      await db.delete(slicerProfiles);
      await db.delete(userSharing);
      await db.delete(cloudBackupConfigs);
      await db.delete(backupHistory);
      await db.delete(materialCompatibility);
      await db.delete(filaments);
      await db.delete(users);
      
      // Delete reference tables
      await db.delete(manufacturers);
      await db.delete(materials);
      await db.delete(colors);
      await db.delete(diameters);
      await db.delete(storageLocations);
      await db.delete(printers);
      await db.delete(slicers);

      appLogger.info("All database tables cleared.");

      // Step 2: Delete uploaded files
      appLogger.info("Deleting uploaded files...");
      
      const filamentsImagesDir = path.join(process.cwd(), "public", "uploads", "filaments");
      const slicerProfilesDir = path.join(process.cwd(), "uploads", "profiles");

      // Delete filament images
      if (fs.existsSync(filamentsImagesDir)) {
        const files = fs.readdirSync(filamentsImagesDir);
        for (const file of files) {
          fs.unlinkSync(path.join(filamentsImagesDir, file));
        }
        appLogger.info(`Deleted ${files.length} filament images.`);
      }

      // Delete slicer profiles
      if (fs.existsSync(slicerProfilesDir)) {
        const files = fs.readdirSync(slicerProfilesDir);
        for (const file of files) {
          fs.unlinkSync(path.join(slicerProfilesDir, file));
        }
        appLogger.info(`Deleted ${files.length} slicer profiles.`);
      }

      // Step 3: Re-seed default data
      appLogger.info("Seeding default data...");

      // Create default admin user
      const hashedPassword = await hashPassword("admin123");
      const envApiKey = process.env.OPENAI_API_KEY;
      const encryptedEnvKey = envApiKey && isValidOpenAIKeyFormat(envApiKey)
        ? encrypt(envApiKey)
        : undefined;

      await db.insert(users).values({
        username: "admin",
        password: hashedPassword,
        isAdmin: true,
        forceChangePassword: true,
        ...(encryptedEnvKey ? { openaiApiKey: encryptedEnvKey } : {}),
      });

      // Seed manufacturers
      const defaultManufacturers = [
        "Bambu Lab", "Sunlu", "Polymaker", "Hatchbox", "eSUN", 
        "Prusament", "Overture", "Inland", "Amazon Basics", "3D Solutech",
        "MatterHackers", "ColorFabb", "Fillamentum", "Proto-pasta", "Ninjatek"
      ];
      for (const name of defaultManufacturers) {
        await db.insert(manufacturers).values({ name }).onConflictDoNothing();
      }

      // Seed materials
      const defaultMaterials = [
        "PLA", "PLA Basic", "PLA+", "PLA Support", "PLA Silk", "PLA Matte",
        "PLA-CF", "PLA Marble", "PLA Metal", "PLA Sparkle", "PLA Galaxy",
        "PLA Glow", "PLA Wood", "PLA Translucent",
        "PETG", "PETG Basic", "PETG-HF", "PETG-CF", "PETG Translucent",
        "ABS", "ASA", "TPU", "TPU 95A", "TPU 80A", "TPU for AMS",
        "PA", "PC", "Support For PLA/PETG"
      ];
      for (const name of defaultMaterials) {
        await db.insert(materials).values({ name }).onConflictDoNothing();
      }

      // Seed diameters
      await db.insert(diameters).values({ value: "1.75" }).onConflictDoNothing();
      await db.insert(diameters).values({ value: "2.85" }).onConflictDoNothing();

      // Seed colors
      const defaultColors = [
        { name: "Black", code: "#000000" },
        { name: "White", code: "#FFFFFF" },
        { name: "Red", code: "#FF0000" },
        { name: "Blue", code: "#0000FF" },
        { name: "Green", code: "#00FF00" },
        { name: "Yellow", code: "#FFFF00" },
        { name: "Orange", code: "#FFA500" },
        { name: "Purple", code: "#800080" },
        { name: "Pink", code: "#FFC0CB" },
        { name: "Gray", code: "#808080" },
        { name: "Silver", code: "#C0C0C0" },
        { name: "Gold", code: "#FFD700" },
        { name: "Brown", code: "#8B4513" },
        { name: "Transparent", code: "#FFFFFF" },
        { name: "Natural", code: "#F5F5DC" },
        { name: "Cyan", code: "#00FFFF" },
      ];
      for (const color of defaultColors) {
        await db.insert(colors).values(color).onConflictDoNothing();
      }

      // Seed storage locations
      const defaultStorageLocations = [
        { name: "A - Bedroom Shelf", description: "2 shelves: top has 3 rows x 5 high, bottom has 2 rows x 10", capacity: 45, sortOrder: 1 },
        { name: "B - Sealable Zip Up Small", description: "1 row deep, 2 high, 4 spools each", capacity: 8, sortOrder: 2 },
        { name: "C - Sealable Zip Up Large 1", description: "2 rows deep, 2 high, 6 spools each", capacity: 24, sortOrder: 3 },
        { name: "D - Sealable Zip Up Large 2", description: "2 rows deep, 2 high, 6 spools each", capacity: 24, sortOrder: 4 },
        { name: "E - Rod Above Printer", description: "1 row, 8 spools", capacity: 8, sortOrder: 5 },
        { name: "F - 9-Level Rack", description: "9 rows high, 6 spools each (1 row for mini spools)", capacity: 81, sortOrder: 6 },
        { name: "AMS Pro 2 - H2C 1", description: "AMS Pro 2 unit connected to H2C, acts as dryer", capacity: 4, sortOrder: 7 },
        { name: "AMS Pro 2 - H2C 2", description: "AMS Pro 2 unit connected to H2C, acts as dryer", capacity: 4, sortOrder: 8 },
        { name: "AMS Pro 2 - P2S", description: "AMS Pro 2 unit connected to P2S, acts as dryer", capacity: 4, sortOrder: 9 },
        { name: "AMS HT - H2C 1", description: "AMS HT unit connected to H2C, acts as dryer", capacity: 1, sortOrder: 10 },
        { name: "AMS HT - H2C 2", description: "AMS HT unit connected to H2C, acts as dryer", capacity: 1, sortOrder: 11 },
        { name: "AMS HT - P2S", description: "AMS HT unit connected to P2S, acts as dryer", capacity: 1, sortOrder: 12 },
        { name: "FLSUN S1 Pro", description: "Spool attached to FLSUN S1 Pro printer, acts as dryer", capacity: 1, sortOrder: 14 },
        { name: "Creality Dryer", description: "Creality dryer unit, holds up to 2 spools", capacity: 2, sortOrder: 15 },
        { name: "Polymaker Dryer", description: "Polymaker dryer unit, holds 1 spool", capacity: 1, sortOrder: 16 },
      ];
      for (const location of defaultStorageLocations) {
        await db.insert(storageLocations).values(location).onConflictDoNothing();
      }

      // Seed printers
      const defaultPrinters = [
        "Bambu Lab P2S", "Bambu Lab H2C", "FLSun S1 Pro", "SnapMaker U1"
      ];
      for (let i = 0; i < defaultPrinters.length; i++) {
        await db.insert(printers).values({ name: defaultPrinters[i], sortOrder: i + 1 }).onConflictDoNothing();
      }

      // Seed slicers
      const defaultSlicers = [
        "Bambu Studio", "Orca Slicer", "PrusaSlicer", "Cura", "SuperSlicer",
        "Simplify3D", "IdeaMaker", "FlashPrint", "Creality Print", "FLSUN Slicer"
      ];
      for (let i = 0; i < defaultSlicers.length; i++) {
        await db.insert(slicers).values({ name: defaultSlicers[i], sortOrder: i + 1 }).onConflictDoNothing();
      }

      appLogger.info("Default data seeded successfully.");
      appLogger.warn("Factory reset completed successfully.");

      res.json({ 
        success: true,
        message: "Factory reset completed. All data has been deleted and default settings restored.",
        defaultCredentials: {
          username: "admin",
          password: "admin123",
          note: "You will be prompted to change this password on first login."
        }
      });
    } catch (error) {
      appLogger.error("Factory reset error:", error);
      res.status(500).json({ message: "Factory reset failed. Please try again or use the shell scripts." });
    }
  });

  // Get system info (admin only)
  app.get("/api/admin/system-info", authenticate, isAdmin, async (_req: Request, res: Response) => {
    try {
      // Get counts from all tables
      const [userCount] = await db.select({ value: count() }).from(users);
      const [filamentCount] = await db.select({ value: count() }).from(filaments);
      const [printJobCount] = await db.select({ value: count() }).from(printJobs);
      
      // Count uploaded files
      const filamentsImagesDir = path.join(process.cwd(), "public", "uploads", "filaments");
      const slicerProfilesDir = path.join(process.cwd(), "uploads", "profiles");
      
      let imageCount = 0;
      let profileCount = 0;
      
      if (fs.existsSync(filamentsImagesDir)) {
        imageCount = fs.readdirSync(filamentsImagesDir).length;
      }
      
      if (fs.existsSync(slicerProfilesDir)) {
        profileCount = fs.readdirSync(slicerProfilesDir).length;
      }

      res.json({
        database: {
          users: userCount?.value || 0,
          filaments: filamentCount?.value || 0,
          printJobs: printJobCount?.value || 0,
        },
        files: {
          images: imageCount,
          slicerProfiles: profileCount,
        },
        environment: {
          isDocker: fs.existsSync("/.dockerenv"),
          nodeEnv: process.env.NODE_ENV || "development",
        }
      });
    } catch (error) {
      appLogger.error("Get system info error:", error);
      res.status(500).json({ message: "Failed to get system info" });
    }
  });
}
