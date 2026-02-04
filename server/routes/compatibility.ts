import type { Express } from "express";
import { authenticate } from "../auth";
import { logger as appLogger } from "../utils/logger";
import { db } from "../db";
import { materialCompatibility, InsertMaterialCompatibility } from "@shared/schema";
import { eq, or, and } from "drizzle-orm";

// Pre-defined material compatibility data based on common knowledge
const DEFAULT_COMPATIBILITY_DATA: InsertMaterialCompatibility[] = [
  // PLA combinations
  { material1: "PLA", material2: "PLA", compatibilityLevel: "excellent", interfaceStrength: "strong", notes: "Same material, perfect bonding", source: "bambulab" },
  { material1: "PLA", material2: "PLA+", compatibilityLevel: "excellent", interfaceStrength: "strong", notes: "PLA variants bond well", source: "bambulab" },
  { material1: "PLA", material2: "PLA Support", compatibilityLevel: "excellent", interfaceStrength: "medium", notes: "Designed for easy removal from PLA", source: "bambulab" },
  { material1: "PLA", material2: "PLA-CF", compatibilityLevel: "good", interfaceStrength: "medium", notes: "May need temperature adjustment", source: "user" },
  { material1: "PLA", material2: "PETG", compatibilityLevel: "poor", interfaceStrength: "weak", notes: "Different temps, poor adhesion", source: "prusa" },
  { material1: "PLA", material2: "ABS", compatibilityLevel: "incompatible", interfaceStrength: "weak", notes: "Temperature incompatible, warping issues", source: "prusa" },
  { material1: "PLA", material2: "TPU", compatibilityLevel: "poor", interfaceStrength: "weak", notes: "TPU flexibility prevents good bonding", source: "user" },
  
  // PETG combinations
  { material1: "PETG", material2: "PETG", compatibilityLevel: "excellent", interfaceStrength: "strong", notes: "Same material, perfect bonding", source: "bambulab" },
  { material1: "PETG", material2: "PETG-HF", compatibilityLevel: "excellent", interfaceStrength: "strong", notes: "PETG variants bond well", source: "bambulab" },
  { material1: "PETG", material2: "PETG-CF", compatibilityLevel: "good", interfaceStrength: "medium", notes: "Carbon fiber may affect bonding slightly", source: "user" },
  { material1: "PETG", material2: "Support For PLA/PETG", compatibilityLevel: "excellent", interfaceStrength: "medium", notes: "Designed for easy removal", source: "bambulab" },
  { material1: "PETG", material2: "ABS", compatibilityLevel: "poor", interfaceStrength: "weak", notes: "Different shrinkage rates", source: "prusa" },
  { material1: "PETG", material2: "TPU", compatibilityLevel: "poor", interfaceStrength: "weak", notes: "Limited adhesion", source: "user" },
  
  // ABS combinations
  { material1: "ABS", material2: "ABS", compatibilityLevel: "excellent", interfaceStrength: "strong", notes: "Same material, excellent bonding", source: "prusa" },
  { material1: "ABS", material2: "ASA", compatibilityLevel: "good", interfaceStrength: "medium", notes: "Similar properties, good compatibility", source: "prusa" },
  { material1: "ABS", material2: "PC", compatibilityLevel: "good", interfaceStrength: "medium", notes: "Both high-temp materials", source: "prusa" },
  { material1: "ABS", material2: "TPU", compatibilityLevel: "poor", interfaceStrength: "weak", notes: "Temperature and flexibility mismatch", source: "user" },
  
  // ASA combinations
  { material1: "ASA", material2: "ASA", compatibilityLevel: "excellent", interfaceStrength: "strong", notes: "Same material, excellent bonding", source: "prusa" },
  { material1: "ASA", material2: "ABS", compatibilityLevel: "good", interfaceStrength: "medium", notes: "Similar properties", source: "prusa" },
  
  // TPU combinations
  { material1: "TPU", material2: "TPU", compatibilityLevel: "excellent", interfaceStrength: "strong", notes: "Same material, excellent bonding", source: "bambulab" },
  { material1: "TPU", material2: "TPU 95A", compatibilityLevel: "excellent", interfaceStrength: "strong", notes: "TPU variants compatible", source: "user" },
  { material1: "TPU", material2: "TPU 80A", compatibilityLevel: "good", interfaceStrength: "medium", notes: "Different hardness may affect bonding", source: "user" },
  
  // PA (Nylon) combinations
  { material1: "PA", material2: "PA", compatibilityLevel: "excellent", interfaceStrength: "strong", notes: "Same material, excellent bonding", source: "prusa" },
  { material1: "PA", material2: "PA-CF", compatibilityLevel: "good", interfaceStrength: "medium", notes: "Carbon fiber variant", source: "user" },
  { material1: "PA", material2: "Support For PA", compatibilityLevel: "excellent", interfaceStrength: "medium", notes: "Designed for PA support", source: "bambulab" },
  
  // PC (Polycarbonate) combinations
  { material1: "PC", material2: "PC", compatibilityLevel: "excellent", interfaceStrength: "strong", notes: "Same material, excellent bonding", source: "prusa" },
  { material1: "PC", material2: "ABS", compatibilityLevel: "good", interfaceStrength: "medium", notes: "Both high-temp engineering plastics", source: "prusa" },
  
  // Support materials
  { material1: "PLA Support", material2: "PLA", compatibilityLevel: "excellent", interfaceStrength: "medium", notes: "Breakaway support for PLA", source: "bambulab" },
  { material1: "Support For PLA/PETG", material2: "PETG", compatibilityLevel: "excellent", interfaceStrength: "medium", notes: "Soluble or breakaway support", source: "bambulab" },
];

export function registerCompatibilityRoutes(app: Express): void {
  // GET all material compatibility entries
  app.get("/api/material-compatibility", authenticate, async (req, res) => {
    try {
      const entries = await db.select().from(materialCompatibility);
      res.json(entries);
    } catch (error) {
      appLogger.error("Error fetching material compatibility:", error);
      res.status(500).json({ message: "Failed to fetch material compatibility" });
    }
  });

  // GET compatibility for a specific material
  app.get("/api/material-compatibility/:material", authenticate, async (req, res) => {
    try {
      const { material } = req.params;
      
      const entries = await db
        .select()
        .from(materialCompatibility)
        .where(
          or(
            eq(materialCompatibility.material1, material),
            eq(materialCompatibility.material2, material)
          )
        );
      
      // Normalize results so the queried material is always "material1"
      const normalized = entries.map(entry => {
        if (entry.material2 === material) {
          return {
            ...entry,
            material1: entry.material2,
            material2: entry.material1,
          };
        }
        return entry;
      });
      
      res.json(normalized);
    } catch (error) {
      appLogger.error("Error fetching material compatibility:", error);
      res.status(500).json({ message: "Failed to fetch material compatibility" });
    }
  });

  // GET compatibility between two specific materials
  app.get("/api/material-compatibility/:material1/:material2", authenticate, async (req, res) => {
    try {
      const { material1, material2 } = req.params;
      
      const [entry] = await db
        .select()
        .from(materialCompatibility)
        .where(
          or(
            and(
              eq(materialCompatibility.material1, material1),
              eq(materialCompatibility.material2, material2)
            ),
            and(
              eq(materialCompatibility.material1, material2),
              eq(materialCompatibility.material2, material1)
            )
          )
        );
      
      if (!entry) {
        return res.status(404).json({ message: "No compatibility data found for these materials" });
      }
      
      res.json(entry);
    } catch (error) {
      appLogger.error("Error fetching material compatibility:", error);
      res.status(500).json({ message: "Failed to fetch material compatibility" });
    }
  });

  // POST create a new compatibility entry
  app.post("/api/material-compatibility", authenticate, async (req, res) => {
    try {
      const data = req.body;
      
      // Check if entry already exists
      const existing = await db
        .select()
        .from(materialCompatibility)
        .where(
          or(
            and(
              eq(materialCompatibility.material1, data.material1),
              eq(materialCompatibility.material2, data.material2)
            ),
            and(
              eq(materialCompatibility.material1, data.material2),
              eq(materialCompatibility.material2, data.material1)
            )
          )
        );
      
      if (existing.length > 0) {
        return res.status(400).json({ message: "Compatibility entry already exists for these materials" });
      }
      
      const [entry] = await db
        .insert(materialCompatibility)
        .values({
          material1: data.material1,
          material2: data.material2,
          compatibilityLevel: data.compatibilityLevel,
          notes: data.notes,
          interfaceStrength: data.interfaceStrength,
          recommendedSettings: data.recommendedSettings ? JSON.stringify(data.recommendedSettings) : null,
          source: data.source || "user",
        })
        .returning();
      
      res.status(201).json(entry);
    } catch (error) {
      appLogger.error("Error creating material compatibility:", error);
      res.status(500).json({ message: "Failed to create material compatibility entry" });
    }
  });

  // DELETE a compatibility entry
  app.delete("/api/material-compatibility/:id", authenticate, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid ID" });
      }
      
      const [deleted] = await db
        .delete(materialCompatibility)
        .where(eq(materialCompatibility.id, id))
        .returning();
      
      if (!deleted) {
        return res.status(404).json({ message: "Entry not found" });
      }
      
      res.json({ success: true, message: "Entry deleted" });
    } catch (error) {
      appLogger.error("Error deleting material compatibility:", error);
      res.status(500).json({ message: "Failed to delete entry" });
    }
  });

  // POST seed default compatibility data
  app.post("/api/material-compatibility/seed", authenticate, async (req, res) => {
    try {
      let added = 0;
      let skipped = 0;
      
      for (const entry of DEFAULT_COMPATIBILITY_DATA) {
        // Check if already exists
        const existing = await db
          .select()
          .from(materialCompatibility)
          .where(
            or(
              and(
                eq(materialCompatibility.material1, entry.material1),
                eq(materialCompatibility.material2, entry.material2)
              ),
              and(
                eq(materialCompatibility.material1, entry.material2),
                eq(materialCompatibility.material2, entry.material1)
              )
            )
          );
        
        if (existing.length === 0) {
          await db.insert(materialCompatibility).values(entry);
          added++;
        } else {
          skipped++;
        }
      }
      
      res.json({ 
        success: true, 
        message: `Added ${added} entries, skipped ${skipped} existing entries`,
        added,
        skipped
      });
    } catch (error) {
      appLogger.error("Error seeding material compatibility:", error);
      res.status(500).json({ message: "Failed to seed compatibility data" });
    }
  });
}
