import type { Express } from "express";
import { storage } from "../storage";
import { authenticate } from "../auth";
import { InsertFilament } from "@shared/schema";
import { logger as appLogger } from "../utils/logger";
import { validateBatchIds } from "../utils/batch-operations";
import fs from "fs";
import path from "path";

export function registerBatchRoutes(app: Express): void {
  // Helper function to delete filament image file
  const deleteFilamentImage = (imageUrl: string | null | undefined) => {
    if (!imageUrl) return;
    try {
      const relativePath = imageUrl.replace(/^\//, "");
      const filePath = path.join(process.cwd(), "public", relativePath);
      
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        appLogger.info(`Deleted image file: ${filePath}`);
      }
    } catch (err) {
      appLogger.warn(`Failed to delete image file for ${imageUrl}:`, err);
    }
  };

  // BATCH DELETE multiple filaments
  app.delete("/api/filaments/batch", authenticate, async (req, res) => {
    try {
      appLogger.debug("Batch delete request", { ids: req.body.ids });
      const { ids } = req.body;

      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: "Invalid request: ids must be a non-empty array" });
      }

      const validIds = validateBatchIds(ids);

      if (validIds.length === 0) {
        return res.status(400).json({ message: "No valid filament IDs provided" });
      }

      // Delete each filament individually to avoid SQL issues
      let deletedCount = 0;
      for (const id of validIds) {
        try {
          // Get filament first to retrieve imageUrl for cleanup
          const filament = await storage.getFilament(id, req.userId);
          const success = await storage.deleteFilament(id, req.userId);
          if (success) {
            deletedCount++;
            // Clean up the image file
            if (filament) {
              deleteFilamentImage(filament.imageUrl);
            }
          }
        } catch (err) {
          appLogger.error(`Error deleting filament with ID ${id}:`, err);
        }
      }

      appLogger.info(`Batch delete completed: ${deletedCount} out of ${validIds.length} filaments deleted`);

      res.json({
        message: `Successfully deleted ${deletedCount} filaments`,
        deletedCount
      });
    } catch (error) {
      appLogger.error("Error batch deleting filaments:", error);
      res.status(500).json({ message: "Failed to delete filaments" });
    }
  });

  // BATCH UPDATE multiple filaments (original endpoint)
  app.patch("/api/filaments/batch", authenticate, async (req, res) => {
    try {
      appLogger.debug("Batch update request", { userId: req.userId });
      const { ids, updates } = req.body;

      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: "Invalid request: ids must be a non-empty array" });
      }

      if (!updates || typeof updates !== 'object') {
        return res.status(400).json({ message: "Invalid request: updates must be an object" });
      }

      const validIds = validateBatchIds(ids);

      if (validIds.length === 0) {
        return res.status(400).json({ message: "No valid filament IDs provided" });
      }

      // Prepare update data
      const updateData: Partial<InsertFilament> = {};

      // Process each field, ensuring proper type conversion
      if (updates.name !== undefined) updateData.name = String(updates.name);
      if (updates.manufacturer !== undefined) updateData.manufacturer = String(updates.manufacturer);
      if (updates.material !== undefined) updateData.material = String(updates.material);
      if (updates.colorName !== undefined) updateData.colorName = String(updates.colorName);
      if (updates.colorCode !== undefined) updateData.colorCode = String(updates.colorCode);
      if (updates.printTemp !== undefined) updateData.printTemp = String(updates.printTemp);

      // Numeric values stored as strings
      if (updates.diameter !== undefined) updateData.diameter = String(updates.diameter);
      if (updates.totalWeight !== undefined) updateData.totalWeight = String(updates.totalWeight);
      if (updates.remainingPercentage !== undefined) updateData.remainingPercentage = String(updates.remainingPercentage);

      // Additional fields
      if (updates.purchaseDate !== undefined) updateData.purchaseDate = updates.purchaseDate;
      if (updates.purchasePrice !== undefined) updateData.purchasePrice = String(updates.purchasePrice);
      if (updates.status !== undefined) updateData.status = String(updates.status);
      if (updates.spoolType !== undefined) updateData.spoolType = String(updates.spoolType);
      if (updates.dryerCount !== undefined) updateData.dryerCount = Number(updates.dryerCount);
      if (updates.lastDryingDate !== undefined) updateData.lastDryingDate = updates.lastDryingDate;
      if (updates.storageLocation !== undefined) updateData.storageLocation = String(updates.storageLocation);

      // Update each filament individually to avoid SQL issues
      let updatedCount = 0;
      for (const id of validIds) {
        try {
          const filament = await storage.getFilament(id, req.userId);
          if (filament) {
            await storage.updateFilament(id, updateData, req.userId);
            updatedCount++;
          }
        } catch (err) {
          appLogger.error(`Error updating filament with ID ${id}:`, err);
        }
      }

      appLogger.info(`Batch update completed: ${updatedCount} out of ${validIds.length} filaments updated`);

      res.json({
        message: `Successfully updated ${updatedCount} filaments`,
        updatedCount
      });
    } catch (error) {
      appLogger.error("Error batch updating filaments:", error);
      res.status(500).json({ message: "Failed to update filaments" });
    }
  });

  // NEW BATCH UPDATE endpoint with simplified implementation
  app.patch("/api/filaments/batch-update", authenticate, async (req, res) => {
    try {
      appLogger.debug("Batch update request", { userId: req.userId });

      // Check if the request body is properly parsed
      if (!req.body) {
        return res.status(400).json({ message: "Empty request body" });
      }

      // Handle case where body might be a string
      let data = req.body;
      if (typeof data === 'string') {
        try {
          data = JSON.parse(data);
        } catch (e) {
          appLogger.error("Error parsing request body:", e);
          return res.status(400).json({ message: "Invalid request format" });
        }
      }

      // Handle case where the body might be nested in a 'body' property
      if (data.body && typeof data.body === 'string') {
        try {
          data = JSON.parse(data.body);
        } catch (e) {
          appLogger.error("Error parsing nested body:", e);
          // Continue with the original data
        }
      }

      // Extract ids and updates from the data
      const { ids, updates } = data;

      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: "Invalid request: ids must be a non-empty array" });
      }

      if (!updates || typeof updates !== 'object') {
        return res.status(400).json({ message: "Invalid request: updates must be an object" });
      }

      const validIds = validateBatchIds(ids);

      if (validIds.length === 0) {
        return res.status(400).json({ message: "No valid filament IDs provided" });
      }

      // Update each filament individually to avoid SQL issues
      let updatedCount = 0;
      for (const id of validIds) {
        try {
          // Check if the user ID is valid
          if (!req.userId || isNaN(Number(req.userId))) {
            return res.status(401).json({ message: "Invalid user ID" });
          }

          // Try to get the filament
          const filament = await storage.getFilament(id, req.userId);

          if (filament) {
            // Create a simple update object with just the fields we need
            const updateData: Partial<InsertFilament> = {};

            // Only copy the fields that are present in the updates object
            if (updates.status !== undefined) {
              updateData.status = String(updates.status);
            }
            if (updates.storageLocation !== undefined) {
              updateData.storageLocation = String(updates.storageLocation);
            }
            if (updates.remainingPercentage !== undefined) {
              updateData.remainingPercentage = String(updates.remainingPercentage);
            }

            try {
              const updated = await storage.updateFilament(id, updateData, req.userId);

              if (updated) {
                updatedCount++;
              }
            } catch (updateErr) {
              appLogger.error(`Error during updateFilament call for ID ${id}:`, updateErr);
            }
          }
        } catch (err) {
          appLogger.error(`Error updating filament with ID ${id}:`, err);
        }
      }

      appLogger.info(`Batch update completed: ${updatedCount} out of ${validIds.length} filaments updated`);

      res.json({
        message: `Successfully updated ${updatedCount} filaments`,
        updatedCount
      });
    } catch (error) {
      appLogger.error("Error batch updating filaments:", error);
      res.status(500).json({ message: "Failed to update filaments" });
    }
  });

  // SUPER SIMPLE BATCH UPDATE endpoint - last resort
  app.post("/api/filaments/simple-batch-update", authenticate, async (req, res) => {
    try {
      appLogger.debug("Simple batch update request", { userId: req.userId });

      const { id, field, value } = req.body;

      if (!id || !field || value === undefined) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      // Convert ID to number
      const numId = Number(id);
      if (isNaN(numId)) {
        return res.status(400).json({ message: "Invalid ID" });
      }

      // Check if the user ID is valid
      if (!req.userId || isNaN(Number(req.userId))) {
        return res.status(401).json({ message: "Invalid user ID" });
      }

      // Get the filament
      const filament = await storage.getFilament(numId, req.userId);

      if (!filament) {
        return res.status(404).json({ message: "Filament not found" });
      }

      // Create update object with just the one field
      const updateData: Partial<InsertFilament> = {};

      // Only support a few specific fields
      if (field === "status") {
        updateData.status = String(value);
      } else if (field === "storageLocation") {
        updateData.storageLocation = String(value);
      } else if (field === "remainingPercentage") {
        updateData.remainingPercentage = String(value);
      } else {
        return res.status(400).json({ message: "Unsupported field" });
      }

      appLogger.debug("Simple batch update", { id: numId, field, value });

      // Update the filament
      const updated = await storage.updateFilament(numId, updateData, req.userId);

      if (!updated) {
        return res.status(500).json({ message: "Failed to update filament" });
      }

      res.json({
        message: "Successfully updated filament",
        filament: updated
      });
    } catch (error) {
      appLogger.error("Simple batch update error:", error);
      res.status(500).json({ message: "Failed to update filament" });
    }
  });
}

