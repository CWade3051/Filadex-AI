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

  // DELETE a filament
  app.delete("/api/filaments/:id", authenticate, async (req, res) => {
    try {
      const id = validateId(req.params.id);
      if (id === null) {
        return res.status(400).json({ message: "Invalid filament ID" });
      }

      const success = await storage.deleteFilament(id, req.userId);
      if (!success) {
        return res.status(404).json({ message: "Filament not found" });
      }

      res.status(200).json({ success: true, message: "Filament deleted" });
    } catch (error) {
      appLogger.error("Error deleting filament:", error);
      res.status(500).json({ message: "Failed to delete filament" });
    }
  });
}

