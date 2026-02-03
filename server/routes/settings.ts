import type { Express } from "express";
import { storage } from "../storage";
import { authenticate } from "../auth";
import {
  insertManufacturerSchema,
  insertMaterialSchema,
  insertColorSchema,
  insertDiameterSchema,
  insertStorageLocationSchema
} from "@shared/schema";
import { ZodError } from "zod";
import { fromZodError } from "zod-validation-error";
import { logger as appLogger } from "../utils/logger";
import { validateId } from "../utils/validation";
import { parseCSVLine, escapeCsvField } from "../utils/csv-parser";

export function registerSettingsRoutes(app: Express): void {
  // ===== MANUFACTURERS =====
  
  app.get("/api/manufacturers", authenticate, async (req, res) => {
    try {
      const manufacturers = await storage.getManufacturers();

      if (req.query.export === 'csv') {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="manufacturers.csv"');
        let csvContent = 'name\n';
        manufacturers.forEach(manufacturer => {
          csvContent += `${escapeCsvField(manufacturer.name)}\n`;
        });
        return res.send(csvContent);
      }

      res.json(manufacturers);
    } catch (error) {
      appLogger.error("Error fetching manufacturers:", error);
      res.status(500).json({ message: "Failed to fetch manufacturers" });
    }
  });

  app.post("/api/manufacturers", authenticate, async (req, res) => {
    try {
      if (req.query.import === 'csv' && req.body.csvData) {
        const results = { created: 0, duplicates: 0, errors: 0 };
        const csvLines = req.body.csvData.split('\n');
        let headerRow = csvLines[0].toLowerCase();
        let startIndex = 0;
        let nameColumnIndex = 0;

        if (headerRow.includes('name') || headerRow.includes('hersteller') || headerRow.includes('vendor')) {
          startIndex = 1;
          if (headerRow.includes(',')) {
            const headers = headerRow.split(',');
            for (let i = 0; i < headers.length; i++) {
              if (headers[i].includes('name') || headers[i].includes('hersteller') || headers[i].includes('vendor')) {
                nameColumnIndex = i;
                break;
              }
            }
          }
        }

        for (let i = startIndex; i < csvLines.length; i++) {
          const line = csvLines[i].trim();
          if (!line) continue;

          try {
            let name = line.includes(',') 
              ? line.split(',')[nameColumnIndex].trim() 
              : line.trim();

            if (!name || name.trim() === '') {
              continue;
            }

            const existingManufacturers = await storage.getManufacturers();
            if (existingManufacturers.find(m => m.name.toLowerCase() === name.toLowerCase())) {
              results.duplicates++;
              continue;
            }

            const validatedData = insertManufacturerSchema.parse({ name });
            await storage.createManufacturer(validatedData);
            results.created++;
          } catch (err) {
            appLogger.error(`Error importing manufacturer at line ${i + 1}:`, err);
            results.errors++;
          }
        }

        return res.status(201).json(results);
      }

      const data = req.body;
      const validatedData = insertManufacturerSchema.parse(data);
      const newManufacturer = await storage.createManufacturer(validatedData);
      res.status(201).json(newManufacturer);
    } catch (error) {
      if (error instanceof ZodError) {
        const validationError = fromZodError(error);
        return res.status(400).json({ message: validationError.message });
      }
      appLogger.error("Error creating manufacturer:", error);
      res.status(500).json({ message: "Failed to create manufacturer" });
    }
  });

  app.delete("/api/manufacturers/:id", authenticate, async (req, res) => {
    try {
      const id = validateId(req.params.id);
      if (id === null) {
        return res.status(400).json({ message: "Invalid manufacturer ID" });
      }

      const manufacturers = await storage.getManufacturers();
      const manufacturer = manufacturers.find(m => m.id === id);

      if (!manufacturer) {
        return res.status(404).json({ message: "Manufacturer not found" });
      }

      const filaments = await storage.getFilaments(req.userId);
      if (filaments.some(f => f.manufacturer === manufacturer.name)) {
        return res.status(400).json({
          message: "Cannot delete manufacturer that is in use by filaments",
          detail: "Diese Hersteller wird von einem oder mehreren Filamenten verwendet"
        });
      }

      const success = await storage.deleteManufacturer(id);
      if (!success) {
        return res.status(404).json({ message: "Manufacturer not found" });
      }

      res.status(200).json({ success: true, message: "Manufacturer deleted" });
    } catch (error) {
      appLogger.error("Error deleting manufacturer:", error);
      res.status(500).json({ message: "Failed to delete manufacturer" });
    }
  });

  app.patch("/api/manufacturers/:id/order", authenticate, async (req, res) => {
    try {
      const id = validateId(req.params.id);
      if (id === null) {
        return res.status(400).json({ message: "Invalid manufacturer ID" });
      }

      const { newOrder } = req.body;
      if (typeof newOrder !== 'number') {
        return res.status(400).json({ message: "newOrder must be a number" });
      }

      const updatedManufacturer = await storage.updateManufacturerOrder(id, newOrder);
      if (!updatedManufacturer) {
        return res.status(404).json({ message: "Manufacturer not found" });
      }

      res.json(updatedManufacturer);
    } catch (error) {
      appLogger.error("Error updating manufacturer order:", error);
      res.status(500).json({ message: "Failed to update manufacturer order" });
    }
  });

  // ===== MATERIALS =====

  app.get("/api/materials", authenticate, async (req, res) => {
    try {
      const materials = await storage.getMaterials();

      if (req.query.export === 'csv') {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="materials.csv"');
        let csvContent = 'name\n';
        materials.forEach(material => {
          csvContent += `${escapeCsvField(material.name)}\n`;
        });
        return res.send(csvContent);
      }

      res.json(materials);
    } catch (error) {
      appLogger.error("Error fetching materials:", error);
      res.status(500).json({ message: "Failed to fetch materials" });
    }
  });

  app.post("/api/materials", authenticate, async (req, res) => {
    try {
      if (req.query.import === 'csv' && req.body.csvData) {
        const results = { created: 0, duplicates: 0, errors: 0 };
        const csvLines = req.body.csvData.split('\n');
        let headerRow = csvLines[0].toLowerCase();
        let startIndex = 0;
        let nameColumnIndex = 0;

        if (headerRow.includes('name') || headerRow.includes('material') || headerRow.includes('type')) {
          startIndex = 1;
          if (headerRow.includes(',')) {
            const headers = headerRow.split(',');
            for (let i = 0; i < headers.length; i++) {
              if (headers[i].includes('name') || headers[i].includes('material') || headers[i].includes('type')) {
                nameColumnIndex = i;
                break;
              }
            }
          }
        }

        for (let i = startIndex; i < csvLines.length; i++) {
          const line = csvLines[i].trim();
          if (!line) continue;

          try {
            let name = line.includes(',') 
              ? line.split(',')[nameColumnIndex].trim() 
              : line.trim();

            if (!name || name.trim() === '') {
              continue;
            }

            const existingMaterials = await storage.getMaterials();
            if (existingMaterials.find(m => m.name.toLowerCase() === name.toLowerCase())) {
              results.duplicates++;
              continue;
            }

            const validatedData = insertMaterialSchema.parse({ name });
            await storage.createMaterial(validatedData);
            results.created++;
          } catch (err) {
            appLogger.error(`Error importing material at line ${i + 1}:`, err);
            results.errors++;
          }
        }

        return res.status(201).json(results);
      }

      const data = req.body;
      const validatedData = insertMaterialSchema.parse(data);
      const newMaterial = await storage.createMaterial(validatedData);
      res.status(201).json(newMaterial);
    } catch (error) {
      if (error instanceof ZodError) {
        const validationError = fromZodError(error);
        return res.status(400).json({ message: validationError.message });
      }
      appLogger.error("Error creating material:", error);
      res.status(500).json({ message: "Failed to create material" });
    }
  });

  app.delete("/api/materials/:id", authenticate, async (req, res) => {
    try {
      const id = validateId(req.params.id);
      if (id === null) {
        return res.status(400).json({ message: "Invalid material ID" });
      }

      const materials = await storage.getMaterials();
      const material = materials.find(m => m.id === id);

      if (!material) {
        return res.status(404).json({ message: "Material not found" });
      }

      const filaments = await storage.getFilaments(req.userId);
      if (filaments.some(f => f.material === material.name)) {
        return res.status(400).json({
          message: "Cannot delete material that is in use by filaments",
          detail: "Dieses Material wird von einem oder mehreren Filamenten verwendet"
        });
      }

      const success = await storage.deleteMaterial(id);
      if (!success) {
        return res.status(404).json({ message: "Material not found" });
      }

      res.status(200).json({ success: true, message: "Material deleted" });
    } catch (error) {
      appLogger.error("Error deleting material:", error);
      res.status(500).json({ message: "Failed to delete material" });
    }
  });

  app.patch("/api/materials/:id/order", authenticate, async (req, res) => {
    try {
      const id = validateId(req.params.id);
      if (id === null) {
        return res.status(400).json({ message: "Invalid material ID" });
      }

      const { newOrder } = req.body;
      if (typeof newOrder !== 'number') {
        return res.status(400).json({ message: "newOrder must be a number" });
      }

      const updatedMaterial = await storage.updateMaterialOrder(id, newOrder);
      if (!updatedMaterial) {
        return res.status(404).json({ message: "Material not found" });
      }

      res.json(updatedMaterial);
    } catch (error) {
      appLogger.error("Error updating material order:", error);
      res.status(500).json({ message: "Failed to update material order" });
    }
  });

  // ===== COLORS =====

  app.get("/api/colors", authenticate, async (req, res) => {
    try {
      const colors = await storage.getColors();

      if (req.query.export === 'csv') {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="colors.csv"');
        let csvContent = 'name,code\n';
        colors.forEach(color => {
          csvContent += `${escapeCsvField(color.name)},${escapeCsvField(color.code)}\n`;
        });
        return res.send(csvContent);
      }

      res.json(colors);
    } catch (error) {
      appLogger.error("Error fetching colors:", error);
      res.status(500).json({ message: "Failed to fetch colors" });
    }
  });

  app.post("/api/colors", authenticate, async (req, res) => {
    try {
      if (req.query.import === 'csv' && req.body.csvData) {
        const results = { created: 0, duplicates: 0, errors: 0 };
        const csvLines = req.body.csvData.split('\n');
        const startIndex = csvLines[0].toLowerCase().includes('name') || csvLines[0].toLowerCase().includes('brand') ? 1 : 0;
        const existingColors = await storage.getColors();

        for (let i = startIndex; i < csvLines.length; i++) {
          const line = csvLines[i].trim();
          if (!line) continue;

          try {
            const values = parseCSVLine(line);
            let name: string;
            let code: string;

            if (values.length >= 3) {
              // Format: Brand,Color Name,Hex Code
              const brand = values[0].trim().replace(/"/g, '');
              const colorName = values[1].trim().replace(/"/g, '');
              name = `${colorName} (${brand})`;
              code = values[2].trim().replace(/"/g, '');
            } else if (values.length >= 2) {
              // Format: Name,Code
              name = values[0].trim().replace(/"/g, '');
              code = values[1].trim().replace(/"/g, '');
            } else {
              results.errors++;
              continue;
            }

            if (!name || !code) {
              results.errors++;
              continue;
            }

            if (!code.startsWith('#')) {
              code = '#' + code;
            }

            if (existingColors.some(c =>
              c.name.toLowerCase() === name.toLowerCase() &&
              c.code.toLowerCase() === code.toLowerCase()
            )) {
              results.duplicates++;
              continue;
            }

            const validatedData = insertColorSchema.parse({ name, code });
            await storage.createColor(validatedData);
            results.created++;
          } catch (err) {
            appLogger.error(`Error importing color at line ${i + 1}:`, err);
            results.errors++;
          }
        }

        return res.status(201).json(results);
      }

      const data = req.body;
      const validatedData = insertColorSchema.parse(data);
      const newColor = await storage.createColor(validatedData);
      res.status(201).json(newColor);
    } catch (error) {
      if (error instanceof ZodError) {
        const validationError = fromZodError(error);
        return res.status(400).json({ message: validationError.message });
      }
      appLogger.error("Error creating color:", error);
      res.status(500).json({ message: "Failed to create color" });
    }
  });

  app.delete("/api/colors/:id", authenticate, async (req, res) => {
    try {
      const id = validateId(req.params.id);
      if (id === null) {
        return res.status(400).json({ message: "Invalid color ID" });
      }

      const colors = await storage.getColors();
      const color = colors.find(c => c.id === id);

      if (!color) {
        return res.status(404).json({ message: "Color not found" });
      }

      const filaments = await storage.getFilaments(req.userId);
      if (filaments.some(f => f.colorName === color.name || f.colorCode === color.code)) {
        return res.status(400).json({
          message: "Cannot delete color that is in use by filaments",
          detail: "Diese Farbe wird von einem oder mehreren Filamenten verwendet"
        });
      }

      const success = await storage.deleteColor(id);
      if (!success) {
        return res.status(404).json({ message: "Color not found" });
      }

      res.status(200).json({ success: true, message: "Color deleted" });
    } catch (error) {
      appLogger.error("Error deleting color:", error);
      res.status(500).json({ message: "Failed to delete color" });
    }
  });

  // ===== DIAMETERS =====

  app.get("/api/diameters", authenticate, async (req, res) => {
    try {
      const diameters = await storage.getDiameters();

      if (req.query.export === 'csv') {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="diameters.csv"');
        let csvContent = 'value\n';
        diameters.forEach(diameter => {
          csvContent += `${escapeCsvField(diameter.value)}\n`;
        });
        return res.send(csvContent);
      }

      res.json(diameters);
    } catch (error) {
      appLogger.error("Error fetching diameters:", error);
      res.status(500).json({ message: "Failed to fetch diameters" });
    }
  });

  app.post("/api/diameters", authenticate, async (req, res) => {
    try {
      if (req.query.import === 'csv' && req.body.csvData) {
        const results = { created: 0, duplicates: 0, errors: 0 };
        const csvLines = req.body.csvData.split('\n');
        const startIndex = csvLines[0].toLowerCase().includes('value') ? 1 : 0;

        for (let i = startIndex; i < csvLines.length; i++) {
          const line = csvLines[i].trim();
          if (!line) continue;

          try {
            const value = line;
            const existingDiameters = await storage.getDiameters();
            if (existingDiameters.some(d => d.value.toLowerCase() === value.toLowerCase())) {
              results.duplicates++;
              continue;
            }

            const validatedData = insertDiameterSchema.parse({ value });
            await storage.createDiameter(validatedData);
            results.created++;
          } catch (err) {
            appLogger.error(`Error importing diameter at line ${i + 1}:`, err);
            results.errors++;
          }
        }

        return res.status(201).json(results);
      }

      const data = req.body;
      const validatedData = insertDiameterSchema.parse(data);
      const newDiameter = await storage.createDiameter(validatedData);
      res.status(201).json(newDiameter);
    } catch (error) {
      if (error instanceof ZodError) {
        const validationError = fromZodError(error);
        return res.status(400).json({ message: validationError.message });
      }
      appLogger.error("Error creating diameter:", error);
      res.status(500).json({ message: "Failed to create diameter" });
    }
  });

  app.delete("/api/diameters/:id", authenticate, async (req, res) => {
    try {
      const id = validateId(req.params.id);
      if (id === null) {
        return res.status(400).json({ message: "Invalid diameter ID" });
      }

      const diameters = await storage.getDiameters();
      const diameter = diameters.find(d => d.id === id);

      if (!diameter) {
        return res.status(404).json({ message: "Diameter not found" });
      }

      const filaments = await storage.getFilaments(req.userId);
      if (filaments.some(f => f.diameter === diameter.value.toString())) {
        return res.status(400).json({
          message: "Cannot delete diameter that is in use by filaments",
          detail: "Dieser Durchmesser wird von einem oder mehreren Filamenten verwendet"
        });
      }

      const success = await storage.deleteDiameter(id);
      if (!success) {
        return res.status(404).json({ message: "Diameter not found" });
      }

      res.status(200).json({ success: true, message: "Diameter deleted" });
    } catch (error) {
      appLogger.error("Error deleting diameter:", error);
      res.status(500).json({ message: "Failed to delete diameter" });
    }
  });

  // ===== STORAGE LOCATIONS =====

  app.get("/api/storage-locations", authenticate, async (req, res) => {
    try {
      const locations = await storage.getStorageLocations();

      if (req.query.export === 'csv') {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="storage-locations.csv"');
        let csvContent = 'name\n';
        locations.forEach(location => {
          csvContent += `${escapeCsvField(location.name)}\n`;
        });
        return res.send(csvContent);
      }

      res.json(locations);
    } catch (error) {
      appLogger.error("Error fetching storage locations:", error);
      res.status(500).json({ message: "Failed to fetch storage locations" });
    }
  });

  // Populate default storage locations
  app.post("/api/storage-locations/populate-defaults", authenticate, async (req, res) => {
    try {
      const defaultLocations = [
        { name: "A - Bedroom Shelf", sortOrder: 1 },
        { name: "B - Sealed Storage Small", sortOrder: 2 },
        { name: "C - Sealed Storage Large #1", sortOrder: 3 },
        { name: "D - Sealed Storage Large #2", sortOrder: 4 },
        { name: "E - Above Printer Rod", sortOrder: 5 },
        { name: "F - 9-Level Rack", sortOrder: 6 },
        { name: "AMS HT #1 (H2C)", sortOrder: 7 },
        { name: "AMS HT #2 (H2C)", sortOrder: 8 },
        { name: "AMS HT #3 (P2S)", sortOrder: 9 },
        { name: "AMS Pro #1 (H2C)", sortOrder: 10 },
        { name: "AMS Pro #2 (H2C)", sortOrder: 11 },
        { name: "AMS Pro #3 (P2S)", sortOrder: 12 },
        { name: "FLSUN S1 Pro", sortOrder: 13 },
        { name: "Creality Dryer", sortOrder: 14 },
        { name: "PolyMaker Dryer", sortOrder: 15 },
      ];

      const existingLocations = await storage.getStorageLocations();
      const existingNames = new Set(existingLocations.map(l => l.name.toLowerCase()));
      
      let added = 0;
      let skipped = 0;

      for (const location of defaultLocations) {
        if (existingNames.has(location.name.toLowerCase())) {
          skipped++;
          continue;
        }
        
        await storage.createStorageLocation({ name: location.name });
        // Update sort order
        const newLocations = await storage.getStorageLocations();
        const newLoc = newLocations.find(l => l.name === location.name);
        if (newLoc) {
          await storage.updateStorageLocationOrder(newLoc.id, location.sortOrder);
        }
        added++;
      }

      res.status(200).json({ 
        success: true, 
        message: `Added ${added} storage locations, skipped ${skipped} existing`,
        added,
        skipped
      });
    } catch (error) {
      appLogger.error("Error populating default storage locations:", error);
      res.status(500).json({ message: "Failed to populate default storage locations" });
    }
  });

  app.post("/api/storage-locations", authenticate, async (req, res) => {
    try {
      if (req.query.import === 'csv' && req.body.csvData) {
        const results = { created: 0, duplicates: 0, errors: 0 };
        const csvLines = req.body.csvData.split('\n');
        const startIndex = csvLines[0].toLowerCase().includes('name') ? 1 : 0;

        for (let i = startIndex; i < csvLines.length; i++) {
          const line = csvLines[i].trim();
          if (!line) continue;

          try {
            const name = line;
            if (!name || name.trim() === '') {
              continue;
            }

            const existingLocations = await storage.getStorageLocations();
            if (existingLocations.find(l => l.name.toLowerCase() === name.toLowerCase())) {
              results.duplicates++;
              continue;
            }

            const validatedData = insertStorageLocationSchema.parse({ name });
            await storage.createStorageLocation(validatedData);
            results.created++;
          } catch (err) {
            appLogger.error(`Error importing storage location at line ${i + 1}:`, err);
            results.errors++;
          }
        }

        return res.status(201).json(results);
      }

      const data = req.body;
      const validatedData = insertStorageLocationSchema.parse(data);
      const newLocation = await storage.createStorageLocation(validatedData);
      res.status(201).json(newLocation);
    } catch (error) {
      if (error instanceof ZodError) {
        const validationError = fromZodError(error);
        return res.status(400).json({ message: validationError.message });
      }
      appLogger.error("Error creating storage location:", error);
      res.status(500).json({ message: "Failed to create storage location" });
    }
  });

  app.delete("/api/storage-locations/:id", authenticate, async (req, res) => {
    try {
      const id = validateId(req.params.id);
      if (id === null) {
        return res.status(400).json({ message: "Invalid storage location ID" });
      }

      const locations = await storage.getStorageLocations();
      const location = locations.find(l => l.id === id);

      if (!location) {
        return res.status(404).json({ message: "Storage location not found" });
      }

      const filaments = await storage.getFilaments(req.userId);
      if (filaments.some(f => f.storageLocation === location.name)) {
        return res.status(400).json({
          message: "Cannot delete storage location that is in use by filaments",
          detail: "Dieser Lagerort wird von einem oder mehreren Filamenten verwendet"
        });
      }

      const success = await storage.deleteStorageLocation(id);
      if (!success) {
        return res.status(404).json({ message: "Storage location not found" });
      }

      res.status(200).json({ success: true, message: "Storage location deleted" });
    } catch (error) {
      appLogger.error("Error deleting storage location:", error);
      res.status(500).json({ message: "Failed to delete storage location" });
    }
  });

  app.patch("/api/storage-locations/:id/order", authenticate, async (req, res) => {
    try {
      const id = validateId(req.params.id);
      if (id === null) {
        return res.status(400).json({ message: "Invalid storage location ID" });
      }

      const { newOrder } = req.body;
      if (typeof newOrder !== 'number') {
        return res.status(400).json({ message: "newOrder must be a number" });
      }

      const updatedLocation = await storage.updateStorageLocationOrder(id, newOrder);
      if (!updatedLocation) {
        return res.status(404).json({ message: "Storage location not found" });
      }

      res.json(updatedLocation);
    } catch (error) {
      appLogger.error("Error updating storage location order:", error);
      res.status(500).json({ message: "Failed to update storage location order" });
    }
  });
}

