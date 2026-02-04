import type { Express } from "express";
import { storage } from "../storage";
import { authenticate } from "../auth";
import { InsertFilament } from "@shared/schema";
import { ZodError } from "zod";
import { fromZodError } from "zod-validation-error";
import { logger as appLogger } from "../utils/logger";
import { validateId } from "../utils/validation";
import { parseCSVLine, detectCSVFormat, escapeCsvField } from "../utils/csv-parser";
import { validateBatchIds } from "../utils/batch-operations";
import fs from "fs";
import path from "path";

const parseIdList = (value: unknown): number[] => {
  if (Array.isArray(value)) {
    return value.map((entry) => parseInt(String(entry), 10)).filter((id) => !isNaN(id));
  }
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.map((entry) => parseInt(String(entry), 10)).filter((id) => !isNaN(id));
      }
    } catch {
      return value
        .split(",")
        .map((entry) => parseInt(entry.trim(), 10))
        .filter((id) => !isNaN(id));
    }
  }
  return [];
};

export function registerFilamentRoutes(app: Express): void {
  // GET all filaments with optional export
  app.get("/api/filaments", authenticate, async (req, res) => {
    try {
      const filaments = await storage.getFilaments(req.userId);

      // Check if export parameter is set
      if (req.query.export === 'csv') {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="filaments.csv"');

        // Create CSV header and content
        let csvContent = 'name,manufacturer,material,colorName,colorCode,diameter,printTemp,totalWeight,remainingPercentage,purchaseDate,purchasePrice,status,spoolType,dryerCount,lastDryingDate,storageLocation\n';

        filaments.forEach(filament => {
          // Format date fields
          const purchaseDate = filament.purchaseDate ? new Date(filament.purchaseDate).toISOString().split('T')[0] : '';
          const lastDryingDate = filament.lastDryingDate ? new Date(filament.lastDryingDate).toISOString().split('T')[0] : '';

          csvContent += `${escapeCsvField(filament.name)},`;
          csvContent += `${escapeCsvField(filament.manufacturer)},`;
          csvContent += `${escapeCsvField(filament.material)},`;
          csvContent += `${escapeCsvField(filament.colorName)},`;
          csvContent += `${escapeCsvField(filament.colorCode)},`;
          csvContent += `${escapeCsvField(filament.diameter)},`;
          csvContent += `${escapeCsvField(filament.printTemp)},`;
          csvContent += `${escapeCsvField(filament.totalWeight)},`;
          csvContent += `${escapeCsvField(filament.remainingPercentage)},`;
          csvContent += `${escapeCsvField(purchaseDate)},`;
          csvContent += `${escapeCsvField(filament.purchasePrice)},`;
          csvContent += `${escapeCsvField(filament.status)},`;
          csvContent += `${escapeCsvField(filament.spoolType)},`;
          csvContent += `${escapeCsvField(filament.dryerCount)},`;
          csvContent += `${escapeCsvField(lastDryingDate)},`;
          csvContent += `${escapeCsvField(filament.storageLocation)}\n`;
        });

        return res.send(csvContent);
      } else if (req.query.export === 'json') {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', 'attachment; filename="filaments.json"');

        return res.send(JSON.stringify(filaments, null, 2));
      }

      res.json(filaments);
    } catch (error) {
      appLogger.error("Error fetching filaments:", error);
      res.status(500).json({ message: "Failed to fetch filaments" });
    }
  });

  // GET a single filament by ID
  app.get("/api/filaments/:id", authenticate, async (req, res) => {
    try {
      const id = validateId(req.params.id);
      if (id === null) {
        return res.status(400).json({ message: "Invalid filament ID" });
      }

      const filament = await storage.getFilament(id, req.userId);
      if (!filament) {
        return res.status(404).json({ message: "Filament not found" });
      }

      res.json(filament);
    } catch (error) {
      appLogger.error("Error fetching filament:", error);
      res.status(500).json({ message: "Failed to fetch filament" });
    }
  });

  // POST create a new filament (with CSV/JSON import support)
  app.post("/api/filaments", authenticate, async (req, res) => {
    try {
      // Check if this is a CSV import
      if (req.query.import === 'csv' && req.body.csvData) {
        const results = {
          created: 0,
          duplicates: 0,
          errors: 0
        };

        // Parse CSV data
        const csvLines = req.body.csvData.split('\n').filter((line: string) => line.trim().length > 0);

        // Expected columns in the CSV
        const expectedColumns = [
          'name', 'manufacturer', 'material', 'colorname', 'colorcode',
          'diameter', 'printtemp', 'totalweight', 'remainingpercentage',
          'purchasedate', 'purchaseprice', 'status', 'spooltype',
          'dryercount', 'lastdryingdate', 'storagelocation'
        ];

        // Detect CSV format
        const { startIndex, columnMap } = detectCSVFormat(csvLines, expectedColumns);

        // Get existing filaments to check for duplicates
        const existingFilaments = await storage.getFilaments(req.userId);

        // Process each line
        for (let i = startIndex; i < csvLines.length; i++) {
          const line = csvLines[i].trim();
          if (!line) continue;

          try {
            const values = parseCSVLine(line);

            // Extract values based on column mapping or default order
            const getValue = (columnName: string, defaultIndex: number): string => {
              if (startIndex === 1 && columnMap[columnName] !== undefined) {
                return values[columnMap[columnName]] || '';
              }
              return values[defaultIndex] || '';
            };

            const name = getValue('name', 0);
            const manufacturer = getValue('manufacturer', 1);
            const material = getValue('material', 2);
            const colorName = getValue('colorname', 3);
            const colorCode = getValue('colorcode', 4);
            const diameter = getValue('diameter', 5);
            const printTemp = getValue('printtemp', 6);
            const totalWeight = getValue('totalweight', 7);
            const remainingPercentage = getValue('remainingpercentage', 8);
            const purchaseDate = getValue('purchasedate', 9);
            const purchasePrice = getValue('purchaseprice', 10);
            const status = getValue('status', 11);
            const spoolType = getValue('spooltype', 12);
            const dryerCount = getValue('dryercount', 13);
            const lastDryingDate = getValue('lastdryingdate', 14);
            const storageLocation = getValue('storagelocation', 15);

            // Validate required fields
            if (!name || !material || !colorName) {
              appLogger.warn(`Missing required fields at line ${i + 1}, skipping...`);
              results.errors++;
              continue;
            }

            // Check for duplicates by name
            const isDuplicate = existingFilaments.some(f =>
              f.name.toLowerCase() === name.toLowerCase()
            );

            if (isDuplicate) {
              appLogger.debug(`Duplicate filament: "${name}" at line ${i + 1}, skipping...`);
              results.duplicates++;
              continue;
            }

            // Prepare data for insertion
            const insertData: InsertFilament = {
              userId: req.userId,
              name,
              manufacturer,
              material,
              colorName,
              colorCode,
              printTemp,
              diameter: diameter ? diameter.toString() : undefined,
              totalWeight: totalWeight ? totalWeight.toString() : "1",
              remainingPercentage: remainingPercentage ? remainingPercentage.toString() : "100",
              purchaseDate: purchaseDate ? purchaseDate : undefined,
              purchasePrice: purchasePrice ? purchasePrice.toString() : undefined,
              status: status || undefined,
              spoolType: spoolType || undefined,
              dryerCount: dryerCount ? parseInt(dryerCount) : 0,
              lastDryingDate: lastDryingDate ? lastDryingDate : undefined,
              storageLocation
            };

            // Create the filament
            await storage.createFilament(insertData);
            results.created++;
            appLogger.debug(`Created filament: "${name}" at line ${i + 1}`);
          } catch (err) {
            appLogger.error(`Error importing filament at line ${i + 1}:`, err);
            results.errors++;
          }
        }

        return res.status(201).json(results);
      } else if (req.query.import === 'json' && req.body.jsonData) {
        const results = {
          created: 0,
          duplicates: 0,
          errors: 0
        };

        try {
          // Parse JSON data
          const filaments = JSON.parse(req.body.jsonData);

          if (!Array.isArray(filaments)) {
            return res.status(400).json({ message: "Invalid JSON format. Expected an array of filaments." });
          }

          // Get existing filaments to check for duplicates
          const existingFilaments = await storage.getFilaments(req.userId);

          // Process each filament
          for (const filament of filaments) {
            try {
              // Check required fields
              if (!filament.name || !filament.material || !filament.colorName) {
                appLogger.warn(`Missing required fields in filament, skipping...`);
                results.errors++;
                continue;
              }

              // Check for duplicates by name
              const isDuplicate = existingFilaments.some(f =>
                f.name.toLowerCase() === filament.name.toLowerCase()
              );

              if (isDuplicate) {
                appLogger.debug(`Duplicate filament: "${filament.name}", skipping...`);
                results.duplicates++;
                continue;
              }

              // Prepare data for insertion
              const insertData: InsertFilament = {
                userId: req.userId,
                name: filament.name,
                manufacturer: filament.manufacturer,
                material: filament.material,
                colorName: filament.colorName,
                colorCode: filament.colorCode,
                printTemp: filament.printTemp,
                diameter: filament.diameter ? filament.diameter.toString() : undefined,
                totalWeight: filament.totalWeight ? filament.totalWeight.toString() : "1",
                remainingPercentage: filament.remainingPercentage ? filament.remainingPercentage.toString() : "100",
                purchaseDate: filament.purchaseDate || undefined,
                purchasePrice: filament.purchasePrice ? filament.purchasePrice.toString() : undefined,
                status: filament.status || undefined,
                spoolType: filament.spoolType || undefined,
                dryerCount: filament.dryerCount || 0,
                lastDryingDate: filament.lastDryingDate || undefined,
                storageLocation: filament.storageLocation
              };

              // Create the filament
              await storage.createFilament(insertData);
              results.created++;
              appLogger.debug(`Created filament: "${filament.name}"`);
            } catch (err) {
              appLogger.error(`Error importing filament:`, err);
              results.errors++;
            }
          }

          return res.status(201).json(results);
        } catch (err) {
          appLogger.error("Error parsing JSON data:", err);
          return res.status(400).json({ message: "Invalid JSON format" });
        }
      }

      // Regular single filament creation
      appLogger.debug("Creating filament", { userId: req.userId });

      const data = req.body;
      
      // Default purchase date to today if not provided
      const purchaseDate = data.purchaseDate || new Date().toISOString().split('T')[0];
      
      // Auto-create manufacturer if it doesn't exist
      if (data.manufacturer && data.manufacturer.trim()) {
        const existingManufacturers = await storage.getManufacturers();
        const manufacturerExists = existingManufacturers.some(
          m => m.name.toLowerCase() === data.manufacturer.toLowerCase()
        );
        if (!manufacturerExists) {
          appLogger.debug(`Auto-creating manufacturer: ${data.manufacturer}`);
          await storage.createManufacturer({ name: data.manufacturer.trim() });
        }
      }
      
      // Auto-create material if it doesn't exist
      if (data.material && data.material.trim()) {
        const existingMaterials = await storage.getMaterials();
        const materialExists = existingMaterials.some(
          m => m.name.toLowerCase() === data.material.toLowerCase()
        );
        if (!materialExists) {
          appLogger.debug(`Auto-creating material: ${data.material}`);
          await storage.createMaterial({ name: data.material.trim() });
        }
      }
      
      // Auto-create diameter if it doesn't exist
      if (data.diameter) {
        const diameterStr = data.diameter.toString();
        const existingDiameters = await storage.getDiameters();
        const diameterExists = existingDiameters.some(
          d => d.value === diameterStr
        );
        if (!diameterExists) {
          appLogger.debug(`Auto-creating diameter: ${diameterStr}`);
          await storage.createDiameter({ value: diameterStr });
        }
      }
      
      // Auto-create color if it doesn't exist
      if (data.colorName && data.colorName.trim()) {
        const existingColors = await storage.getColors();
        const colorExists = existingColors.some(
          c => c.name.toLowerCase() === data.colorName.toLowerCase()
        );
        if (!colorExists) {
          appLogger.debug(`Auto-creating color: ${data.colorName}`);
          await storage.createColor({ 
            name: data.colorName.trim(),
            code: data.colorCode || '#808080'
          });
        }
      }
      
      const insertData: InsertFilament = {
        userId: req.userId,
        name: data.name,
        manufacturer: data.manufacturer,
        material: data.material,
        colorName: data.colorName,
        colorCode: data.colorCode,
        printTemp: data.printTemp,
        printSpeed: data.printSpeed,
        diameter: data.diameter ? data.diameter.toString() : undefined,
        totalWeight: data.totalWeight.toString(),
        remainingPercentage: data.remainingPercentage.toString(),
        purchaseDate: purchaseDate,
        purchasePrice: data.purchasePrice ? data.purchasePrice.toString() : undefined,
        status: data.status,
        spoolType: data.spoolType,
        dryerCount: data.dryerCount,
        lastDryingDate: data.lastDryingDate,
        storageLocation: data.storageLocation,
        locationDetails: data.locationDetails,
        notes: data.notes,
        imageUrl: data.imageUrl,
      };

      const newFilament = await storage.createFilament(insertData);
      const slicerProfileIds = parseIdList(data.slicerProfileIds);
      if (slicerProfileIds.length > 0) {
        const userProfiles = await storage.getSlicerProfiles(req.userId);
        const publicProfiles = await storage.getPublicSlicerProfiles();
        const allowedProfileIds = new Set([
          ...userProfiles.map((profile) => profile.id),
          ...publicProfiles.map((profile) => profile.id),
        ]);
        const validProfileIds = slicerProfileIds.filter((id) => allowedProfileIds.has(id));
        await storage.setFilamentSlicerProfiles(newFilament.id, validProfileIds);
      }
      res.status(201).json(newFilament);
    } catch (error) {
      if (error instanceof ZodError) {
        const validationError = fromZodError(error);
        appLogger.error("Validation error:", validationError.message);
        return res.status(400).json({ message: validationError.message });
      }
      appLogger.error("Error creating filament:", error);
      res.status(500).json({ message: "Failed to create filament" });
    }
  });

  // PATCH update an existing filament
  app.patch("/api/filaments/:id", authenticate, async (req, res) => {
    try {
      const id = validateId(req.params.id);
      if (id === null) {
        return res.status(400).json({ message: "Invalid filament ID" });
      }

      appLogger.debug("Updating filament", { id, userId: req.userId });

      const data = req.body;
      const updateData: Partial<InsertFilament> = {};

      if (data.name !== undefined) updateData.name = data.name;
      if (data.manufacturer !== undefined) updateData.manufacturer = data.manufacturer;
      if (data.material !== undefined) updateData.material = data.material;
      if (data.colorName !== undefined) updateData.colorName = data.colorName;
      if (data.colorCode !== undefined) updateData.colorCode = data.colorCode;
      if (data.printTemp !== undefined) updateData.printTemp = data.printTemp;

      // Numeric values stored as strings
      if (data.diameter !== undefined) updateData.diameter = data.diameter.toString();
      if (data.totalWeight !== undefined) updateData.totalWeight = data.totalWeight.toString();
      if (data.remainingPercentage !== undefined) updateData.remainingPercentage = data.remainingPercentage.toString();

      // Additional fields
      if (data.purchaseDate !== undefined) updateData.purchaseDate = data.purchaseDate;
      if (data.purchasePrice !== undefined) updateData.purchasePrice = data.purchasePrice.toString();
      if (data.status !== undefined) updateData.status = data.status;
      if (data.spoolType !== undefined) updateData.spoolType = data.spoolType;
      if (data.dryerCount !== undefined) updateData.dryerCount = data.dryerCount;
      if (data.lastDryingDate !== undefined) updateData.lastDryingDate = data.lastDryingDate;
      if (data.storageLocation !== undefined) updateData.storageLocation = data.storageLocation;
      if (data.locationDetails !== undefined) updateData.locationDetails = data.locationDetails;

      const updatedFilament = await storage.updateFilament(id, updateData, req.userId);
      if (!updatedFilament) {
        return res.status(404).json({ message: "Filament not found" });
      }

      if (data.slicerProfileIds !== undefined) {
        const slicerProfileIds = parseIdList(data.slicerProfileIds);
        const userProfiles = await storage.getSlicerProfiles(req.userId);
        const publicProfiles = await storage.getPublicSlicerProfiles();
        const allowedProfileIds = new Set([
          ...userProfiles.map((profile) => profile.id),
          ...publicProfiles.map((profile) => profile.id),
        ]);
        const validProfileIds = slicerProfileIds.filter((profileId) => allowedProfileIds.has(profileId));
        await storage.setFilamentSlicerProfiles(id, validProfileIds);
      }

      res.json(updatedFilament);
    } catch (error) {
      if (error instanceof ZodError) {
        const validationError = fromZodError(error);
        appLogger.error("Validation error:", validationError.message);
        return res.status(400).json({ message: validationError.message });
      }
      appLogger.error("Error updating filament:", error);
      res.status(500).json({ message: "Failed to update filament" });
    }
  });

  // GET slicer profiles linked to a filament
  app.get("/api/filaments/:id/slicer-profiles", authenticate, async (req, res) => {
    try {
      const id = validateId(req.params.id);
      if (id === null) {
        return res.status(400).json({ message: "Invalid filament ID" });
      }

      const filament = await storage.getFilament(id, req.userId);
      if (!filament) {
        return res.status(404).json({ message: "Filament not found" });
      }

      const profiles = await storage.getSlicerProfilesForFilament(req.userId, id);
      res.json(profiles);
    } catch (error) {
      appLogger.error("Error fetching filament slicer profiles:", error);
      res.status(500).json({ message: "Failed to fetch filament slicer profiles" });
    }
  });

  // Update slicer profiles linked to a filament
  app.put("/api/filaments/:id/slicer-profiles", authenticate, async (req, res) => {
    try {
      const id = validateId(req.params.id);
      if (id === null) {
        return res.status(400).json({ message: "Invalid filament ID" });
      }

      const filament = await storage.getFilament(id, req.userId);
      if (!filament) {
        return res.status(404).json({ message: "Filament not found" });
      }

      const slicerProfileIds = parseIdList(req.body.slicerProfileIds);
      await storage.setFilamentSlicerProfiles(id, slicerProfileIds);
      res.json({ success: true });
    } catch (error) {
      appLogger.error("Error updating filament slicer profiles:", error);
      res.status(500).json({ message: "Failed to update filament slicer profiles" });
    }
  });

  // Helper function to delete filament image file
  const deleteFilamentImage = (imageUrl: string | null | undefined) => {
    if (!imageUrl) return;
    try {
      // imageUrl is like "/uploads/filaments/filament-xxx.jpg"
      // Need to resolve to actual file path
      const relativePath = imageUrl.replace(/^\//, ""); // Remove leading slash
      const filePath = path.join(process.cwd(), "public", relativePath);
      
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        appLogger.info(`Deleted image file: ${filePath}`);
      }
    } catch (err) {
      appLogger.warn(`Failed to delete image file for ${imageUrl}:`, err);
      // Don't throw - image cleanup failure shouldn't prevent filament deletion
    }
  };

  // DELETE a filament
  app.delete("/api/filaments/:id", authenticate, async (req, res) => {
    try {
      const id = validateId(req.params.id);
      if (id === null) {
        return res.status(400).json({ message: "Invalid filament ID" });
      }

      // Get filament first to retrieve imageUrl for cleanup
      const filament = await storage.getFilament(id, req.userId);
      if (!filament) {
        return res.status(404).json({ message: "Filament not found" });
      }

      const success = await storage.deleteFilament(id, req.userId);
      if (!success) {
        return res.status(404).json({ message: "Filament not found" });
      }

      // Clean up the image file
      deleteFilamentImage(filament.imageUrl);

      res.status(200).json({ success: true, message: "Filament deleted" });
    } catch (error) {
      appLogger.error("Error deleting filament:", error);
      res.status(500).json({ message: "Failed to delete filament" });
    }
  });

  // PATCH update spool weight and auto-calculate remaining percentage
  app.patch("/api/filaments/:id/weight", authenticate, async (req, res) => {
    try {
      const id = validateId(req.params.id);
      if (id === null) {
        return res.status(400).json({ message: "Invalid filament ID" });
      }

      const { currentWeight, emptySpoolWeight } = req.body;

      // Validate inputs
      if (currentWeight === undefined || currentWeight === null) {
        return res.status(400).json({ message: "Current weight is required" });
      }

      const filament = await storage.getFilament(id, req.userId);
      if (!filament) {
        return res.status(404).json({ message: "Filament not found" });
      }

      // Use provided empty spool weight or existing or default (200g)
      const emptyWeight = emptySpoolWeight !== undefined 
        ? parseFloat(emptySpoolWeight) 
        : (filament.emptySpoolWeight ? parseFloat(filament.emptySpoolWeight) : 200);
      
      const totalWeight = parseFloat(filament.totalWeight);
      const current = parseFloat(currentWeight);

      // Calculate remaining percentage: ((currentWeight - emptySpoolWeight) / totalWeight) * 100
      const filamentWeight = current - emptyWeight;
      let remainingPercentage = Math.round((filamentWeight / totalWeight) * 100);
      
      // Clamp to 0-100
      remainingPercentage = Math.max(0, Math.min(100, remainingPercentage));

      const updateData: any = {
        currentWeight: current.toString(),
        emptySpoolWeight: emptyWeight.toString(),
        lastWeighedAt: new Date(),
        remainingPercentage: remainingPercentage.toString(),
      };

      // Auto-archive if remaining is 0%
      if (remainingPercentage === 0 && !filament.isArchived) {
        updateData.isArchived = true;
        updateData.archivedAt = new Date();
        updateData.archiveReason = 'empty';
      }

      const updatedFilament = await storage.updateFilament(id, updateData, req.userId);
      
      res.json({
        ...updatedFilament,
        calculatedRemaining: remainingPercentage,
        filamentWeight: filamentWeight,
      });
    } catch (error) {
      appLogger.error("Error updating filament weight:", error);
      res.status(500).json({ message: "Failed to update filament weight" });
    }
  });

  // PATCH archive a spool
  app.patch("/api/filaments/:id/archive", authenticate, async (req, res) => {
    try {
      const id = validateId(req.params.id);
      if (id === null) {
        return res.status(400).json({ message: "Invalid filament ID" });
      }

      const { reason } = req.body;

      const filament = await storage.getFilament(id, req.userId);
      if (!filament) {
        return res.status(404).json({ message: "Filament not found" });
      }

      const updateData = {
        isArchived: true,
        archivedAt: new Date(),
        archiveReason: reason || 'manual',
      };

      const updatedFilament = await storage.updateFilament(id, updateData, req.userId);
      res.json(updatedFilament);
    } catch (error) {
      appLogger.error("Error archiving filament:", error);
      res.status(500).json({ message: "Failed to archive filament" });
    }
  });

  // PATCH unarchive a spool
  app.patch("/api/filaments/:id/unarchive", authenticate, async (req, res) => {
    try {
      const id = validateId(req.params.id);
      if (id === null) {
        return res.status(400).json({ message: "Invalid filament ID" });
      }

      const filament = await storage.getFilament(id, req.userId);
      if (!filament) {
        return res.status(404).json({ message: "Filament not found" });
      }

      const updateData = {
        isArchived: false,
        archivedAt: null,
        archiveReason: null,
      };

      const updatedFilament = await storage.updateFilament(id, updateData, req.userId);
      res.json(updatedFilament);
    } catch (error) {
      appLogger.error("Error unarchiving filament:", error);
      res.status(500).json({ message: "Failed to unarchive filament" });
    }
  });

  // GET find filaments with similar colors
  app.get("/api/filaments/similar-colors", authenticate, async (req, res) => {
    try {
      const { hex, tolerance = '30' } = req.query;

      if (!hex || typeof hex !== 'string') {
        return res.status(400).json({ message: "Hex color parameter is required" });
      }

      // Remove # if present
      const cleanHex = hex.replace(/^#/, '').toUpperCase();
      if (!/^[0-9A-F]{6}$/.test(cleanHex)) {
        return res.status(400).json({ message: "Invalid hex color format" });
      }

      const toleranceNum = parseInt(tolerance as string) || 30;

      // Get all filaments
      const filaments = await storage.getFilaments(req.userId);

      // Convert hex to RGB
      const hexToRgb = (h: string) => ({
        r: parseInt(h.slice(0, 2), 16),
        g: parseInt(h.slice(2, 4), 16),
        b: parseInt(h.slice(4, 6), 16),
      });

      // Convert RGB to LAB for better perceptual color matching
      const rgbToLab = (rgb: { r: number; g: number; b: number }) => {
        // First convert to XYZ
        let r = rgb.r / 255;
        let g = rgb.g / 255;
        let b = rgb.b / 255;

        r = r > 0.04045 ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92;
        g = g > 0.04045 ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92;
        b = b > 0.04045 ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92;

        const x = (r * 0.4124564 + g * 0.3575761 + b * 0.1804375) / 0.95047;
        const y = (r * 0.2126729 + g * 0.7151522 + b * 0.0721750);
        const z = (r * 0.0193339 + g * 0.1191920 + b * 0.9503041) / 1.08883;

        const f = (t: number) => t > 0.008856 ? Math.pow(t, 1/3) : (7.787 * t) + (16/116);

        return {
          l: (116 * f(y)) - 16,
          a: 500 * (f(x) - f(y)),
          b: 200 * (f(y) - f(z)),
        };
      };

      // Calculate Delta E (CIE76 - simpler but good enough)
      const deltaE = (lab1: { l: number; a: number; b: number }, lab2: { l: number; a: number; b: number }) => {
        return Math.sqrt(
          Math.pow(lab1.l - lab2.l, 2) +
          Math.pow(lab1.a - lab2.a, 2) +
          Math.pow(lab1.b - lab2.b, 2)
        );
      };

      const targetRgb = hexToRgb(cleanHex);
      const targetLab = rgbToLab(targetRgb);

      // Calculate distance for each filament
      const results = filaments
        .filter(f => f.colorCode && /^#?[0-9A-Fa-f]{6}$/.test(f.colorCode))
        .map(f => {
          const fHex = f.colorCode!.replace(/^#/, '').toUpperCase();
          const fRgb = hexToRgb(fHex);
          const fLab = rgbToLab(fRgb);
          const distance = deltaE(targetLab, fLab);
          return {
            ...f,
            colorDistance: Math.round(distance * 10) / 10,
          };
        })
        .filter(f => f.colorDistance <= toleranceNum)
        .sort((a, b) => a.colorDistance - b.colorDistance);

      res.json(results);
    } catch (error) {
      appLogger.error("Error finding similar colors:", error);
      res.status(500).json({ message: "Failed to find similar colors" });
    }
  });

  // POST cleanup orphaned images (admin only)
  app.post("/api/filaments/cleanup-images", authenticate, async (req, res) => {
    try {
      // Get all filaments to find valid imageUrls
      const filaments = await storage.getFilaments(req.userId);
      const validImageUrls = new Set(
        filaments
          .filter(f => f.imageUrl)
          .map(f => f.imageUrl!.replace(/^\/uploads\/filaments\//, ""))
      );

      const uploadsDir = path.join(process.cwd(), "public", "uploads", "filaments");
      
      if (!fs.existsSync(uploadsDir)) {
        return res.json({ deleted: 0, message: "No uploads directory found" });
      }

      const files = fs.readdirSync(uploadsDir);
      const orphanedFiles: string[] = [];

      for (const file of files) {
        if (!validImageUrls.has(file)) {
          orphanedFiles.push(file);
          const filePath = path.join(uploadsDir, file);
          try {
            fs.unlinkSync(filePath);
            appLogger.info(`Deleted orphaned image: ${file}`);
          } catch (err) {
            appLogger.warn(`Failed to delete orphaned image ${file}:`, err);
          }
        }
      }

      res.json({ 
        deleted: orphanedFiles.length, 
        files: orphanedFiles,
        message: `Cleaned up ${orphanedFiles.length} orphaned image(s)` 
      });
    } catch (error) {
      appLogger.error("Error cleaning up images:", error);
      res.status(500).json({ message: "Failed to cleanup images" });
    }
  });
}

