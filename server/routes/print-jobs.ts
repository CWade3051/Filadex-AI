import type { Express } from "express";
import { storage } from "../storage";
import { authenticate } from "../auth";
import { InsertPrintJob, InsertFilamentHistory } from "@shared/schema";
import { ZodError } from "zod";
import { fromZodError } from "zod-validation-error";
import { logger as appLogger } from "../utils/logger";
import { validateId } from "../utils/validation";
import { parseGcode, gramsToMeters } from "../utils/gcode-parser";
import multer from "multer";
import path from "path";
import fs from "fs";

// Configure multer for G-code uploads
const gcodeStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadsDir = path.join(process.cwd(), "public", "uploads", "gcode");
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, `gcode-${uniqueSuffix}${path.extname(file.originalname)}`);
  },
});

const uploadGcode = multer({
  storage: gcodeStorage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit for G-code files
  fileFilter: (req, file, cb) => {
    const allowedExtensions = [".gcode", ".gco", ".g", ".nc"];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error("Only G-code files are allowed"));
    }
  },
});

// Interface for filament usage in print jobs
interface FilamentUsage {
  filamentId: number;
  gramsUsed: number;
  metersUsed?: number;
}

export function registerPrintJobRoutes(app: Express): void {
  // GET all print jobs
  app.get("/api/print-jobs", authenticate, async (req, res) => {
    try {
      const printJobs = await storage.getPrintJobs(req.userId);
      
      // Parse filamentUsages JSON for each job and calculate costs
      const jobsWithDetails = await Promise.all(
        printJobs.map(async (job) => {
          let filamentUsages: FilamentUsage[] = [];
          let totalCost = 0;
          
          if (job.filamentUsages) {
            try {
              filamentUsages = JSON.parse(job.filamentUsages);
              
              // Calculate cost for each filament
              for (const usage of filamentUsages) {
                const filament = await storage.getFilament(usage.filamentId, req.userId);
                if (filament && filament.purchasePrice && filament.totalWeight) {
                  const costPerGram = parseFloat(filament.purchasePrice) / parseFloat(filament.totalWeight);
                  totalCost += usage.gramsUsed * costPerGram;
                }
              }
            } catch (e) {
              appLogger.warn("Failed to parse filament usages:", e);
            }
          }
          
          return {
            ...job,
            parsedFilamentUsages: filamentUsages,
            estimatedCost: Math.round(totalCost * 100) / 100,
          };
        })
      );
      
      res.json(jobsWithDetails);
    } catch (error) {
      appLogger.error("Error fetching print jobs:", error);
      res.status(500).json({ message: "Failed to fetch print jobs" });
    }
  });

  // GET a single print job by ID
  app.get("/api/print-jobs/:id", authenticate, async (req, res) => {
    try {
      const id = validateId(req.params.id);
      if (id === null) {
        return res.status(400).json({ message: "Invalid print job ID" });
      }

      const job = await storage.getPrintJob(id, req.userId);
      if (!job) {
        return res.status(404).json({ message: "Print job not found" });
      }

      // Parse filament usages and calculate details
      let filamentUsages: FilamentUsage[] = [];
      let filamentDetails: any[] = [];
      let totalCost = 0;

      if (job.filamentUsages) {
        try {
          filamentUsages = JSON.parse(job.filamentUsages);
          
          for (const usage of filamentUsages) {
            const filament = await storage.getFilament(usage.filamentId, req.userId);
            if (filament) {
              const costPerGram = filament.purchasePrice && filament.totalWeight
                ? parseFloat(filament.purchasePrice) / parseFloat(filament.totalWeight)
                : 0;
              const usageCost = usage.gramsUsed * costPerGram;
              totalCost += usageCost;
              
              filamentDetails.push({
                ...usage,
                filament: {
                  id: filament.id,
                  name: filament.name,
                  material: filament.material,
                  colorName: filament.colorName,
                  colorCode: filament.colorCode,
                },
                cost: Math.round(usageCost * 100) / 100,
              });
            }
          }
        } catch (e) {
          appLogger.warn("Failed to parse filament usages:", e);
        }
      }

      res.json({
        ...job,
        parsedFilamentUsages: filamentDetails,
        estimatedCost: Math.round(totalCost * 100) / 100,
      });
    } catch (error) {
      appLogger.error("Error fetching print job:", error);
      res.status(500).json({ message: "Failed to fetch print job" });
    }
  });

  // POST create a new print job manually
  app.post("/api/print-jobs", authenticate, async (req, res) => {
    try {
      const data = req.body;
      
      // Prepare filament usages
      let filamentUsagesJson = null;
      if (data.filamentUsages && Array.isArray(data.filamentUsages)) {
        filamentUsagesJson = JSON.stringify(data.filamentUsages);
      }

      const insertData: InsertPrintJob = {
        userId: req.userId,
        name: data.name,
        description: data.description,
        filamentUsages: filamentUsagesJson,
        printStartedAt: data.printStartedAt ? new Date(data.printStartedAt) : null,
        printCompletedAt: data.printCompletedAt ? new Date(data.printCompletedAt) : new Date(),
        estimatedDuration: data.estimatedDuration,
        actualDuration: data.actualDuration,
        estimatedWeight: data.estimatedWeight?.toString(),
        actualWeight: data.actualWeight?.toString(),
        status: data.status || "completed",
        failureReason: data.failureReason,
        gcodeFilename: data.gcodeFilename,
        slicerUsed: data.slicerUsed,
        printerUsed: data.printerUsed,
        thumbnailUrl: data.thumbnailUrl,
        notes: data.notes,
      };

      const newJob = await storage.createPrintJob(insertData);

      // Update filament remaining percentages and log history
      if (data.filamentUsages && Array.isArray(data.filamentUsages)) {
        for (const usage of data.filamentUsages) {
          const filament = await storage.getFilament(usage.filamentId, req.userId);
          if (filament) {
            // Calculate new remaining percentage
            const totalWeight = parseFloat(filament.totalWeight);
            const currentRemaining = (parseFloat(filament.remainingPercentage) / 100) * totalWeight;
            const newRemaining = Math.max(0, currentRemaining - usage.gramsUsed);
            const newPercentage = Math.round((newRemaining / totalWeight) * 100);

            // Update filament
            await storage.updateFilament(usage.filamentId, {
              remainingPercentage: newPercentage.toString(),
            }, req.userId);

            // Log history
            const historyEntry: InsertFilamentHistory = {
              filamentId: usage.filamentId,
              remainingPercentage: newPercentage.toString(),
              changeType: "print",
              changeAmount: (-usage.gramsUsed).toString(),
              printJobId: newJob.id,
              notes: `Used in print: ${data.name}`,
            };
            await storage.createFilamentHistory(historyEntry);

            // Auto-archive if empty
            if (newPercentage === 0) {
              await storage.updateFilament(usage.filamentId, {
                isArchived: true,
                archivedAt: new Date(),
                archiveReason: "empty",
              }, req.userId);
            }
          }
        }
      }

      res.status(201).json(newJob);
    } catch (error) {
      if (error instanceof ZodError) {
        const validationError = fromZodError(error);
        return res.status(400).json({ message: validationError.message });
      }
      appLogger.error("Error creating print job:", error);
      res.status(500).json({ message: "Failed to create print job" });
    }
  });

  // POST create print job from G-code upload
  app.post(
    "/api/print-jobs/from-gcode",
    authenticate,
    uploadGcode.single("gcode"),
    async (req, res) => {
      try {
        if (!req.file) {
          return res.status(400).json({ message: "No G-code file uploaded" });
        }

        // Read and parse the G-code file
        const gcodeContent = fs.readFileSync(req.file.path, "utf-8");
        const gcodeInfo = parseGcode(gcodeContent, req.file.originalname);

        // Save thumbnail if present
        let thumbnailUrl = null;
        if (gcodeInfo.thumbnail) {
          const thumbnailDir = path.join(process.cwd(), "public", "uploads", "thumbnails");
          if (!fs.existsSync(thumbnailDir)) {
            fs.mkdirSync(thumbnailDir, { recursive: true });
          }
          const thumbnailFilename = `thumb-${Date.now()}.${gcodeInfo.thumbnailFormat || "png"}`;
          const thumbnailPath = path.join(thumbnailDir, thumbnailFilename);
          fs.writeFileSync(thumbnailPath, Buffer.from(gcodeInfo.thumbnail, "base64"));
          thumbnailUrl = `/uploads/thumbnails/${thumbnailFilename}`;
        }

        // Parse additional data from request body
        const additionalData = req.body;
        let filamentUsages: FilamentUsage[] = [];
        
        if (additionalData.filamentUsages) {
          try {
            filamentUsages = JSON.parse(additionalData.filamentUsages);
          } catch (e) {
            // If parsing fails, try to use gcode info
          }
        }

        // If no filament usages provided but we have weight from G-code
        if (filamentUsages.length === 0 && gcodeInfo.filamentUsedGrams && additionalData.defaultFilamentId) {
          filamentUsages = [{
            filamentId: parseInt(additionalData.defaultFilamentId),
            gramsUsed: gcodeInfo.filamentUsedGrams,
            metersUsed: gcodeInfo.filamentUsedMeters || gramsToMeters(gcodeInfo.filamentUsedGrams),
          }];
        }

        const insertData: InsertPrintJob = {
          userId: req.userId,
          name: gcodeInfo.printName || gcodeInfo.objectName || req.file.originalname,
          description: additionalData.description,
          filamentUsages: filamentUsages.length > 0 ? JSON.stringify(filamentUsages) : null,
          printStartedAt: additionalData.printStartedAt ? new Date(additionalData.printStartedAt) : null,
          printCompletedAt: additionalData.printCompletedAt ? new Date(additionalData.printCompletedAt) : new Date(),
          estimatedDuration: gcodeInfo.estimatedTimeMinutes,
          actualDuration: additionalData.actualDuration ? parseInt(additionalData.actualDuration) : undefined,
          estimatedWeight: gcodeInfo.filamentUsedGrams?.toString(),
          actualWeight: additionalData.actualWeight?.toString(),
          status: additionalData.status || "completed",
          failureReason: additionalData.failureReason,
          gcodeFilename: req.file.originalname,
          slicerUsed: gcodeInfo.slicerName,
          printerUsed: additionalData.printerUsed,
          thumbnailUrl,
          notes: additionalData.notes,
        };

        const newJob = await storage.createPrintJob(insertData);

        // Update filament remaining and log history (same as manual creation)
        for (const usage of filamentUsages) {
          const filament = await storage.getFilament(usage.filamentId, req.userId);
          if (filament) {
            const totalWeight = parseFloat(filament.totalWeight);
            const currentRemaining = (parseFloat(filament.remainingPercentage) / 100) * totalWeight;
            const newRemaining = Math.max(0, currentRemaining - usage.gramsUsed);
            const newPercentage = Math.round((newRemaining / totalWeight) * 100);

            await storage.updateFilament(usage.filamentId, {
              remainingPercentage: newPercentage.toString(),
            }, req.userId);

            const historyEntry: InsertFilamentHistory = {
              filamentId: usage.filamentId,
              remainingPercentage: newPercentage.toString(),
              changeType: "print",
              changeAmount: (-usage.gramsUsed).toString(),
              printJobId: newJob.id,
              notes: `Used in print: ${insertData.name}`,
            };
            await storage.createFilamentHistory(historyEntry);

            if (newPercentage === 0) {
              await storage.updateFilament(usage.filamentId, {
                isArchived: true,
                archivedAt: new Date(),
                archiveReason: "empty",
              }, req.userId);
            }
          }
        }

        // Optionally delete the uploaded G-code file (or keep it based on settings)
        // For now, delete to save space
        fs.unlinkSync(req.file.path);

        res.status(201).json({
          ...newJob,
          gcodeInfo,
          parsedFilamentUsages: filamentUsages,
        });
      } catch (error) {
        appLogger.error("Error creating print job from G-code:", error);
        // Clean up uploaded file on error
        if (req.file && fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
        res.status(500).json({ message: "Failed to create print job from G-code" });
      }
    }
  );

  // PATCH update a print job
  app.patch("/api/print-jobs/:id", authenticate, async (req, res) => {
    try {
      const id = validateId(req.params.id);
      if (id === null) {
        return res.status(400).json({ message: "Invalid print job ID" });
      }

      const data = req.body;
      const updateData: Partial<InsertPrintJob> = {};

      if (data.name !== undefined) updateData.name = data.name;
      if (data.description !== undefined) updateData.description = data.description;
      if (data.status !== undefined) updateData.status = data.status;
      if (data.failureReason !== undefined) updateData.failureReason = data.failureReason;
      if (data.actualWeight !== undefined) updateData.actualWeight = data.actualWeight?.toString();
      if (data.actualDuration !== undefined) updateData.actualDuration = data.actualDuration;
      if (data.printerUsed !== undefined) updateData.printerUsed = data.printerUsed;
      if (data.notes !== undefined) updateData.notes = data.notes;
      if (data.printStartedAt !== undefined) updateData.printStartedAt = data.printStartedAt ? new Date(data.printStartedAt) : null;
      if (data.printCompletedAt !== undefined) updateData.printCompletedAt = data.printCompletedAt ? new Date(data.printCompletedAt) : null;

      const updatedJob = await storage.updatePrintJob(id, updateData, req.userId);
      if (!updatedJob) {
        return res.status(404).json({ message: "Print job not found" });
      }

      res.json(updatedJob);
    } catch (error) {
      appLogger.error("Error updating print job:", error);
      res.status(500).json({ message: "Failed to update print job" });
    }
  });

  // DELETE a print job
  app.delete("/api/print-jobs/:id", authenticate, async (req, res) => {
    try {
      const id = validateId(req.params.id);
      if (id === null) {
        return res.status(400).json({ message: "Invalid print job ID" });
      }

      // Get job to check thumbnail
      const job = await storage.getPrintJob(id, req.userId);
      if (!job) {
        return res.status(404).json({ message: "Print job not found" });
      }

      // Delete thumbnail if exists
      if (job.thumbnailUrl) {
        const thumbnailPath = path.join(process.cwd(), "public", job.thumbnailUrl);
        if (fs.existsSync(thumbnailPath)) {
          fs.unlinkSync(thumbnailPath);
        }
      }

      const success = await storage.deletePrintJob(id, req.userId);
      if (!success) {
        return res.status(404).json({ message: "Print job not found" });
      }

      res.json({ success: true, message: "Print job deleted" });
    } catch (error) {
      appLogger.error("Error deleting print job:", error);
      res.status(500).json({ message: "Failed to delete print job" });
    }
  });

  // GET filament history for a specific filament
  app.get("/api/filaments/:id/history", authenticate, async (req, res) => {
    try {
      const id = validateId(req.params.id);
      if (id === null) {
        return res.status(400).json({ message: "Invalid filament ID" });
      }

      // Verify filament belongs to user
      const filament = await storage.getFilament(id, req.userId);
      if (!filament) {
        return res.status(404).json({ message: "Filament not found" });
      }

      const history = await storage.getFilamentHistory(id);
      
      // Enhance with print job details
      const enhancedHistory = await Promise.all(
        history.map(async (entry) => {
          if (entry.printJobId) {
            const job = await storage.getPrintJob(entry.printJobId, req.userId);
            return {
              ...entry,
              printJob: job ? { id: job.id, name: job.name } : null,
            };
          }
          return entry;
        })
      );

      res.json(enhancedHistory);
    } catch (error) {
      appLogger.error("Error fetching filament history:", error);
      res.status(500).json({ message: "Failed to fetch filament history" });
    }
  });

  // GET usage statistics
  app.get("/api/statistics/usage", authenticate, async (req, res) => {
    try {
      const { period = "30d" } = req.query;
      
      // Calculate date range
      let startDate = new Date();
      switch (period) {
        case "7d":
          startDate.setDate(startDate.getDate() - 7);
          break;
        case "30d":
          startDate.setDate(startDate.getDate() - 30);
          break;
        case "90d":
          startDate.setDate(startDate.getDate() - 90);
          break;
        case "all":
          startDate = new Date(0);
          break;
        default:
          startDate.setDate(startDate.getDate() - 30);
      }

      const printJobs = await storage.getPrintJobs(req.userId);
      const filaments = await storage.getFilaments(req.userId);

      // Filter by date
      const filteredJobs = printJobs.filter(job => {
        const jobDate = job.printCompletedAt || job.createdAt;
        return jobDate && new Date(jobDate) >= startDate;
      });

      // Calculate statistics
      let totalGramsUsed = 0;
      let totalCost = 0;
      let totalPrintTime = 0;
      const materialUsage: Record<string, number> = {};

      for (const job of filteredJobs) {
        if (job.filamentUsages) {
          try {
            const usages: FilamentUsage[] = JSON.parse(job.filamentUsages);
            for (const usage of usages) {
              totalGramsUsed += usage.gramsUsed;
              
              const filament = filaments.find(f => f.id === usage.filamentId);
              if (filament) {
                // Track by material
                if (!materialUsage[filament.material]) {
                  materialUsage[filament.material] = 0;
                }
                materialUsage[filament.material] += usage.gramsUsed;

                // Calculate cost
                if (filament.purchasePrice && filament.totalWeight) {
                  const costPerGram = parseFloat(filament.purchasePrice) / parseFloat(filament.totalWeight);
                  totalCost += usage.gramsUsed * costPerGram;
                }
              }
            }
          } catch (e) {
            // Skip malformed data
          }
        }
        
        if (job.actualDuration) {
          totalPrintTime += job.actualDuration;
        } else if (job.estimatedDuration) {
          totalPrintTime += job.estimatedDuration;
        }
      }

      res.json({
        period,
        totalPrintJobs: filteredJobs.length,
        totalGramsUsed: Math.round(totalGramsUsed),
        totalCost: Math.round(totalCost * 100) / 100,
        totalPrintTimeMinutes: totalPrintTime,
        totalPrintTimeHours: Math.round(totalPrintTime / 60 * 10) / 10,
        materialUsage,
        averageGramsPerPrint: filteredJobs.length > 0 
          ? Math.round(totalGramsUsed / filteredJobs.length)
          : 0,
        averageCostPerPrint: filteredJobs.length > 0
          ? Math.round(totalCost / filteredJobs.length * 100) / 100
          : 0,
      });
    } catch (error) {
      appLogger.error("Error fetching usage statistics:", error);
      res.status(500).json({ message: "Failed to fetch usage statistics" });
    }
  });
}
