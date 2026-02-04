import { Express, Request, Response } from "express";
import { storage } from "../storage";
import { authenticate } from "../auth";
import multer from "multer";
import path from "path";
import fs from "fs";
import { logger as appLogger } from "../utils/logger";

// Configure multer for slicer profile uploads
const profilesDir = path.join(process.cwd(), "uploads", "profiles");

// Ensure profiles directory exists
if (!fs.existsSync(profilesDir)) {
  fs.mkdirSync(profilesDir, { recursive: true });
}

const profileStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, profilesDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `profile-${uniqueSuffix}${ext}`);
  },
});

const uploadProfile = multer({
  storage: profileStorage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
  },
  fileFilter: (req, file, cb) => {
    // Allow common slicer profile extensions
    const allowedExtensions = [
      ".json",
      ".ini",
      ".cfg",
      ".3mf",
      ".curaprofile",
      ".fff",
      ".factory",
      ".slicer",
      ".xml",
      ".zip",
    ];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${ext} not allowed. Allowed types: ${allowedExtensions.join(", ")}`));
    }
  },
});

// Parse slicer profile settings based on file type
function parseProfileSettings(filePath: string, fileType: string): any {
  try {
    const content = fs.readFileSync(filePath, "utf8");

    if (fileType === ".json") {
      // PrusaSlicer/OrcaSlicer JSON profiles
      const parsed = JSON.parse(content);
      return {
        layerHeight: parsed.layer_height || parsed.layerHeight,
        printSpeed: parsed.print_speed || parsed.printSpeed || parsed.speed_print,
        infillDensity: parsed.infill_density || parsed.infillDensity || parsed.fill_density,
        temperature: parsed.temperature || parsed.nozzle_temperature || parsed.hotend_temp,
        bedTemperature: parsed.bed_temperature || parsed.bedTemperature || parsed.bed_temp,
        supportEnabled: parsed.support_material || parsed.supportEnabled || parsed.support_enable,
        retraction: parsed.retraction_length || parsed.retractionLength,
        wallCount: parsed.wall_loops || parsed.perimeters || parsed.wall_line_count,
        raw: parsed,
      };
    } else if (fileType === ".ini" || fileType === ".cfg") {
      // INI-style profiles (PrusaSlicer, Cura)
      const settings: any = { raw: {} };
      const lines = content.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith("#") && !trimmed.startsWith("[")) {
          const [key, ...valueParts] = trimmed.split("=");
          if (key && valueParts.length > 0) {
            const value = valueParts.join("=").trim();
            settings.raw[key.trim()] = value;

            // Map common settings
            const keyLower = key.trim().toLowerCase();
            if (keyLower.includes("layer_height")) settings.layerHeight = parseFloat(value);
            if (keyLower.includes("print_speed") || keyLower.includes("speed_print"))
              settings.printSpeed = parseFloat(value);
            if (keyLower.includes("infill") && keyLower.includes("density"))
              settings.infillDensity = parseFloat(value);
            if (keyLower.includes("temperature") && !keyLower.includes("bed"))
              settings.temperature = parseFloat(value);
            if (keyLower.includes("bed") && keyLower.includes("temp"))
              settings.bedTemperature = parseFloat(value);
          }
        }
      }
      return settings;
    } else if (fileType === ".curaprofile") {
      // Cura profile (usually JSON inside)
      try {
        const parsed = JSON.parse(content);
        return {
          layerHeight: parsed.settings?.layer_height?.default_value,
          printSpeed: parsed.settings?.speed_print?.default_value,
          infillDensity: parsed.settings?.infill_sparse_density?.default_value,
          temperature: parsed.settings?.material_print_temperature?.default_value,
          bedTemperature: parsed.settings?.material_bed_temperature?.default_value,
          raw: parsed,
        };
      } catch {
        return { raw: content };
      }
    }

    // For other file types, just store raw content indicator
    return { raw: "Binary or complex file format - settings not parsed" };
  } catch (error) {
    appLogger.error("Error parsing profile settings:", error);
    return { parseError: "Failed to parse profile settings" };
  }
}

export function registerSlicerProfileRoutes(app: Express) {
  // Get all profiles for the user
  app.get("/api/slicer-profiles", authenticate, async (req: Request, res: Response) => {
    try {
      const profiles = await storage.getSlicerProfiles(req.userId!);
      res.json(profiles);
    } catch (error) {
      appLogger.error("Error fetching slicer profiles:", error);
      res.status(500).json({ message: "Failed to fetch slicer profiles" });
    }
  });

  // Get public profiles (for sharing)
  app.get("/api/slicer-profiles/public", async (req: Request, res: Response) => {
    try {
      const { manufacturer, material } = req.query;
      const profiles = await storage.getPublicSlicerProfiles(
        manufacturer as string | undefined,
        material as string | undefined
      );
      res.json(profiles);
    } catch (error) {
      appLogger.error("Error fetching public slicer profiles:", error);
      res.status(500).json({ message: "Failed to fetch public slicer profiles" });
    }
  });

  // Get a single profile
  app.get("/api/slicer-profiles/:id", authenticate, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid profile ID" });
      }

      const profile = await storage.getSlicerProfile(id, req.userId!);
      if (!profile) {
        return res.status(404).json({ message: "Profile not found" });
      }

      res.json(profile);
    } catch (error) {
      appLogger.error("Error fetching slicer profile:", error);
      res.status(500).json({ message: "Failed to fetch slicer profile" });
    }
  });

  // Upload a new profile
  app.post(
    "/api/slicer-profiles",
    authenticate,
    uploadProfile.single("file"),
    async (req: Request, res: Response) => {
      try {
        if (!req.file) {
          return res.status(400).json({ message: "No file uploaded" });
        }

        const { name, manufacturer, material, printerModel, slicerVersion, notes, isPublic } =
          req.body;

        if (!name) {
          // Clean up uploaded file
          fs.unlinkSync(req.file.path);
          return res.status(400).json({ message: "Profile name is required" });
        }

        const fileType = path.extname(req.file.originalname).toLowerCase();
        const parsedSettings = parseProfileSettings(req.file.path, fileType);

        const profile = await storage.createSlicerProfile({
          userId: req.userId!,
          name,
          manufacturer: manufacturer || null,
          material: material || null,
          fileUrl: `/uploads/profiles/${req.file.filename}`,
          originalFilename: req.file.originalname,
          fileType,
          parsedSettings: JSON.stringify(parsedSettings),
          slicerVersion: slicerVersion || null,
          printerModel: printerModel || null,
          notes: notes || null,
          isPublic: isPublic === "true" || isPublic === true,
        });

        res.status(201).json(profile);
      } catch (error) {
        appLogger.error("Error uploading slicer profile:", error);
        // Clean up uploaded file on error
        if (req.file) {
          try {
            fs.unlinkSync(req.file.path);
          } catch {}
        }
        res.status(500).json({ message: "Failed to upload slicer profile" });
      }
    }
  );

  // Update a profile
  app.patch("/api/slicer-profiles/:id", authenticate, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid profile ID" });
      }

      const profile = await storage.getSlicerProfile(id, req.userId!);
      if (!profile) {
        return res.status(404).json({ message: "Profile not found" });
      }

      const { name, manufacturer, material, printerModel, slicerVersion, notes, isPublic } =
        req.body;

      const updated = await storage.updateSlicerProfile(id, req.userId!, {
        name,
        manufacturer,
        material,
        printerModel,
        slicerVersion,
        notes,
        isPublic,
      });

      res.json(updated);
    } catch (error) {
      appLogger.error("Error updating slicer profile:", error);
      res.status(500).json({ message: "Failed to update slicer profile" });
    }
  });

  // Delete a profile
  app.delete("/api/slicer-profiles/:id", authenticate, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid profile ID" });
      }

      const profile = await storage.getSlicerProfile(id, req.userId!);
      if (!profile) {
        return res.status(404).json({ message: "Profile not found" });
      }

      // Delete the file
      if (profile.fileUrl) {
        const filePath = path.join(process.cwd(), profile.fileUrl);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }

      await storage.deleteSlicerProfile(id, req.userId!);
      res.json({ message: "Profile deleted successfully" });
    } catch (error) {
      appLogger.error("Error deleting slicer profile:", error);
      res.status(500).json({ message: "Failed to delete slicer profile" });
    }
  });

  // Download a profile file
  app.get(
    "/api/slicer-profiles/:id/download",
    authenticate,
    async (req: Request, res: Response) => {
      try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
          return res.status(400).json({ message: "Invalid profile ID" });
        }

        const profile = await storage.getSlicerProfile(id, req.userId!);
        if (!profile) {
          return res.status(404).json({ message: "Profile not found" });
        }

        if (!profile.fileUrl) {
          return res.status(404).json({ message: "Profile file not found" });
        }

        const filePath = path.join(process.cwd(), profile.fileUrl);
        if (!fs.existsSync(filePath)) {
          return res.status(404).json({ message: "Profile file not found on disk" });
        }

        res.download(filePath, profile.originalFilename || `profile${profile.fileType}`);
      } catch (error) {
        appLogger.error("Error downloading slicer profile:", error);
        res.status(500).json({ message: "Failed to download slicer profile" });
      }
    }
  );

  // Get suggested profiles for a filament
  app.get(
    "/api/filaments/:id/suggested-profiles",
    authenticate,
    async (req: Request, res: Response) => {
      try {
        const filamentId = parseInt(req.params.id);
        if (isNaN(filamentId)) {
          return res.status(400).json({ message: "Invalid filament ID" });
        }

        const filament = await storage.getFilament(filamentId, req.userId!);
        if (!filament) {
          return res.status(404).json({ message: "Filament not found" });
        }

        // Find profiles matching the filament's manufacturer and/or material
        const profiles = await storage.getSuggestedProfiles(
          req.userId!,
          filament.manufacturer,
          filament.material
        );

        res.json(profiles);
      } catch (error) {
        appLogger.error("Error fetching suggested profiles:", error);
        res.status(500).json({ message: "Failed to fetch suggested profiles" });
      }
    }
  );
}
