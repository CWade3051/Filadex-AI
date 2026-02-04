import {
  filaments, type Filament, type InsertFilament,
  manufacturers, type Manufacturer, type InsertManufacturer,
  materials, type Material, type InsertMaterial,
  colors, type Color, type InsertColor,
  diameters, type Diameter, type InsertDiameter,
  storageLocations, type StorageLocation, type InsertStorageLocation,
  printers, type Printer, type InsertPrinter,
  slicers, type Slicer, type InsertSlicer,
  printJobs, type PrintJob, type InsertPrintJob,
  filamentHistory, type FilamentHistory, type InsertFilamentHistory,
  slicerProfiles, type SlicerProfile, type InsertSlicerProfile,
  filamentSlicerProfiles, type FilamentSlicerProfile, type InsertFilamentSlicerProfile
} from "@shared/schema";
import { users, type User, type InsertUser } from "@shared/schema";
import { db } from "./db";
import { eq, sql, and, inArray } from "drizzle-orm";
import { logger } from "./utils/logger";

// Modify the interface with any CRUD methods
// you might need
export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUserApiKey(userId: number, encryptedKey: string | null): Promise<void>;
  updateUserModel(userId: number, model: string): Promise<void>;

  // Filament operations
  getFilaments(userId: number): Promise<Filament[]>;
  getPublicFilamentsWithUser(userId: number, filterFn?: (filament: Filament) => boolean): Promise<{filaments: Filament[], user: {id: number, username: string}}>;
  getFilament(id: number, userId: number): Promise<Filament | undefined>;
  createFilament(filament: InsertFilament): Promise<Filament>;
  updateFilament(id: number, filament: Partial<InsertFilament>, userId: number): Promise<Filament | undefined>;
  deleteFilament(id: number, userId: number): Promise<boolean>;

  // Batch filament operations
  batchDeleteFilaments(ids: number[], userId: number): Promise<number>;
  batchUpdateFilaments(ids: number[], updates: Partial<InsertFilament>, userId: number): Promise<number>;

  // Manufacturer operations
  getManufacturers(): Promise<Manufacturer[]>;
  createManufacturer(manufacturer: InsertManufacturer): Promise<Manufacturer>;
  deleteManufacturer(id: number): Promise<boolean>;
  updateManufacturerOrder(id: number, newOrder: number): Promise<Manufacturer | undefined>;

  // Material operations
  getMaterials(): Promise<Material[]>;
  createMaterial(material: InsertMaterial): Promise<Material>;
  deleteMaterial(id: number): Promise<boolean>;
  updateMaterialOrder(id: number, newOrder: number): Promise<Material | undefined>;

  // Color operations
  getColors(): Promise<Color[]>;
  createColor(color: InsertColor): Promise<Color>;
  deleteColor(id: number): Promise<boolean>;

  // Diameter operations
  getDiameters(): Promise<Diameter[]>;
  createDiameter(diameter: InsertDiameter): Promise<Diameter>;
  deleteDiameter(id: number): Promise<boolean>;

  // Storage Location operations
  getStorageLocations(): Promise<StorageLocation[]>;
  createStorageLocation(location: InsertStorageLocation): Promise<StorageLocation>;
  deleteStorageLocation(id: number): Promise<boolean>;
  updateStorageLocationOrder(id: number, newOrder: number): Promise<StorageLocation | undefined>;

  // Printer operations
  getPrinters(): Promise<Printer[]>;
  createPrinter(printer: InsertPrinter): Promise<Printer>;
  deletePrinter(id: number): Promise<boolean>;
  updatePrinterOrder(id: number, newOrder: number): Promise<Printer | undefined>;

  // Slicer (software) operations
  getSlicers(): Promise<Slicer[]>;
  createSlicer(slicer: InsertSlicer): Promise<Slicer>;
  deleteSlicer(id: number): Promise<boolean>;
  updateSlicerOrder(id: number, newOrder: number): Promise<Slicer | undefined>;

  // Slicer Profile operations
  getSlicerProfiles(userId: number): Promise<SlicerProfile[]>;
  getSlicerProfile(id: number, userId: number): Promise<SlicerProfile | undefined>;
  getPublicSlicerProfiles(manufacturer?: string, material?: string): Promise<SlicerProfile[]>;
  getSuggestedProfiles(userId: number, manufacturer?: string | null, material?: string | null): Promise<SlicerProfile[]>;
  createSlicerProfile(profile: InsertSlicerProfile): Promise<SlicerProfile>;
  updateSlicerProfile(id: number, userId: number, updates: Partial<InsertSlicerProfile>): Promise<SlicerProfile | undefined>;
  deleteSlicerProfile(id: number, userId: number): Promise<boolean>;

  // Filament <-> Slicer Profile associations
  getSlicerProfilesForFilament(userId: number, filamentId: number): Promise<SlicerProfile[]>;
  setFilamentSlicerProfiles(filamentId: number, profileIds: number[]): Promise<void>;
  getFilamentsForSlicerProfile(userId: number, profileId: number): Promise<Filament[]>;
  setSlicerProfileFilaments(profileId: number, filamentIds: number[]): Promise<void>;
}

// Database Storage implementation using PostgreSQL
export class DatabaseStorage implements IStorage {
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    return user;
  }

  async updateUserApiKey(userId: number, encryptedKey: string | null): Promise<void> {
    await db
      .update(users)
      .set({ openaiApiKey: encryptedKey })
      .where(eq(users.id, userId));
  }

  async updateUserModel(userId: number, model: string): Promise<void> {
    await db
      .update(users)
      .set({ openaiModel: model } as any)
      .where(eq(users.id, userId));
  }

  // Filament implementations
  async getFilaments(userId: number): Promise<Filament[]> {
    return await db.select().from(filaments).where(eq(filaments.userId, userId));
  }

  async getPublicFilamentsWithUser(userId: number, filterFn?: (filament: Filament) => boolean): Promise<{filaments: Filament[], user: {id: number, username: string}}> {
    // Get user information
    const [user] = await db.select({
      id: users.id,
      username: users.username
    }).from(users).where(eq(users.id, userId));

    if (!user) {
      throw new Error(`User with ID ${userId} not found`);
    }

    logger.debug(`Getting public filaments for user: ${user.username} (ID: ${userId})`);

    // Get filaments
    const allFilaments = await this.getFilaments(userId);

    // Apply filter if provided
    const filteredFilaments = filterFn ? allFilaments.filter(filterFn) : allFilaments;

    logger.debug(`Found ${filteredFilaments.length} public filaments for user ${user.username}`);

    // Return filaments with user information
    return {
      filaments: filteredFilaments,
      user: {
        id: user.id,
        username: user.username
      }
    };
  }

  async getFilament(id: number, userId: number): Promise<Filament | undefined> {
    try {
      const query = db.select().from(filaments)
        .where(and(eq(filaments.id, id), eq(filaments.userId, userId)));

      const [filament] = await query;

      return filament || undefined;
    } catch (err) {
      logger.error(`Error in getFilament:`, err);
      throw err;
    }
  }

  async createFilament(insertFilament: InsertFilament): Promise<Filament> {
    const [filament] = await db
      .insert(filaments)
      .values(insertFilament)
      .returning();
    return filament;
  }

  async updateFilament(id: number, updateFilament: Partial<InsertFilament>, userId: number): Promise<Filament | undefined> {
    try {
      const query = db
        .update(filaments)
        .set(updateFilament)
        .where(and(eq(filaments.id, id), eq(filaments.userId, userId)))
        .returning();

      const [updated] = await query;

      return updated || undefined;
    } catch (err) {
      logger.error(`Error in updateFilament:`, err);
      throw err;
    }
  }

  async deleteFilament(id: number, userId: number): Promise<boolean> {
    const [deleted] = await db
      .delete(filaments)
      .where(and(eq(filaments.id, id), eq(filaments.userId, userId)))
      .returning();
    return !!deleted;
  }

  // Batch operations
  async batchDeleteFilaments(ids: number[], userId: number): Promise<number> {
    // Convert all IDs to numbers to ensure they're valid
    const validIds = ids.map(id => Number(id));

    // Use the in operator from drizzle instead of raw SQL
    const { count } = await db
      .delete(filaments)
      .where(
        and(
          inArray(filaments.id, validIds),
          eq(filaments.userId, userId)
        )
      )
      .returning();

    logger.info(`Batch deleted ${count} filaments with IDs:`, validIds);
    return count;
  }

  async batchUpdateFilaments(ids: number[], updates: Partial<InsertFilament>, userId: number): Promise<number> {
    // Convert all IDs to numbers to ensure they're valid
    const validIds = ids.map(id => Number(id));

    // Use the in operator from drizzle instead of raw SQL
    const { count } = await db
      .update(filaments)
      .set(updates)
      .where(
        and(
          inArray(filaments.id, validIds),
          eq(filaments.userId, userId)
        )
      )
      .returning();

    logger.info(`Batch updated ${count} filaments with IDs:`, validIds);
    return count;
  }

  // Manufacturer implementations
  async getManufacturers(): Promise<Manufacturer[]> {
    return await db.select().from(manufacturers).orderBy(manufacturers.sortOrder, manufacturers.name);
  }

  async createManufacturer(insertManufacturer: InsertManufacturer): Promise<Manufacturer> {
    const [manufacturer] = await db
      .insert(manufacturers)
      .values(insertManufacturer)
      .returning();
    return manufacturer;
  }

  async deleteManufacturer(id: number): Promise<boolean> {
    const [deleted] = await db
      .delete(manufacturers)
      .where(eq(manufacturers.id, id))
      .returning();
    return !!deleted;
  }

  async updateManufacturerOrder(id: number, newOrder: number): Promise<Manufacturer | undefined> {
    const [updated] = await db
      .update(manufacturers)
      .set({ sortOrder: newOrder })
      .where(eq(manufacturers.id, id))
      .returning();
    return updated || undefined;
  }

  // Material implementations
  async getMaterials(): Promise<Material[]> {
    return await db.select().from(materials).orderBy(materials.sortOrder, materials.name);
  }

  async createMaterial(insertMaterial: InsertMaterial): Promise<Material> {
    const [material] = await db
      .insert(materials)
      .values(insertMaterial)
      .returning();
    return material;
  }

  async deleteMaterial(id: number): Promise<boolean> {
    const [deleted] = await db
      .delete(materials)
      .where(eq(materials.id, id))
      .returning();
    return !!deleted;
  }

  async updateMaterialOrder(id: number, newOrder: number): Promise<Material | undefined> {
    const [updated] = await db
      .update(materials)
      .set({ sortOrder: newOrder })
      .where(eq(materials.id, id))
      .returning();
    return updated || undefined;
  }

  // Color implementations
  async getColors(): Promise<Color[]> {
    return await db.select().from(colors);
  }

  async createColor(insertColor: InsertColor): Promise<Color> {
    const [color] = await db
      .insert(colors)
      .values(insertColor)
      .returning();
    return color;
  }

  async deleteColor(id: number): Promise<boolean> {
    const [deleted] = await db
      .delete(colors)
      .where(eq(colors.id, id))
      .returning();
    return !!deleted;
  }

  // Diameter implementations
  async getDiameters(): Promise<Diameter[]> {
    return await db.select().from(diameters);
  }

  async createDiameter(insertDiameter: InsertDiameter): Promise<Diameter> {
    const [diameter] = await db
      .insert(diameters)
      .values(insertDiameter)
      .returning();
    return diameter;
  }

  async deleteDiameter(id: number): Promise<boolean> {
    const [deleted] = await db
      .delete(diameters)
      .where(eq(diameters.id, id))
      .returning();
    return !!deleted;
  }

  // Storage Location implementations
  async getStorageLocations(): Promise<StorageLocation[]> {
    const orderExpression = sql`
      CASE ${storageLocations.name}
        WHEN 'A - Bedroom Shelf' THEN 1
        WHEN 'B - Sealable Zip Up Small' THEN 2
        WHEN 'C - Sealable Zip Up Large 1' THEN 3
        WHEN 'D - Sealable Zip Up Large 2' THEN 4
        WHEN 'E - Rod Above Printer' THEN 5
        WHEN 'F - 9-Level Rack' THEN 6
        WHEN 'G - 9-Level Rack' THEN 6
        WHEN 'AMS Pro 2 - H2C 1' THEN 7
        WHEN 'AMS Pro 2 - H2C 2' THEN 8
        WHEN 'AMS Pro 2 - P2S' THEN 9
        WHEN 'AMS HT - H2C 1' THEN 10
        WHEN 'AMS HT - H2C 2' THEN 11
        WHEN 'AMS HT - P2S' THEN 12
        WHEN 'FLSUN S1 Pro' THEN 14
        WHEN 'Creality Dryer' THEN 15
        WHEN 'Polymaker Dryer' THEN 16
        ELSE COALESCE(${storageLocations.sortOrder}, 999)
      END
    `;

    return await db
      .select()
      .from(storageLocations)
      .orderBy(orderExpression, storageLocations.name);
  }

  async createStorageLocation(insertLocation: InsertStorageLocation): Promise<StorageLocation> {
    const [location] = await db
      .insert(storageLocations)
      .values(insertLocation)
      .returning();
    return location;
  }

  async deleteStorageLocation(id: number): Promise<boolean> {
    const [deleted] = await db
      .delete(storageLocations)
      .where(eq(storageLocations.id, id))
      .returning();
    return !!deleted;
  }

  async updateStorageLocationOrder(id: number, newOrder: number): Promise<StorageLocation | undefined> {
    const [updated] = await db
      .update(storageLocations)
      .set({ sortOrder: newOrder })
      .where(eq(storageLocations.id, id))
      .returning();
    return updated || undefined;
  }

  // Printer implementations
  async getPrinters(): Promise<Printer[]> {
    return await db.select().from(printers);
  }

  async createPrinter(insertPrinter: InsertPrinter): Promise<Printer> {
    const [printer] = await db
      .insert(printers)
      .values(insertPrinter)
      .returning();
    return printer;
  }

  async deletePrinter(id: number): Promise<boolean> {
    const [deleted] = await db
      .delete(printers)
      .where(eq(printers.id, id))
      .returning();
    return !!deleted;
  }

  async updatePrinterOrder(id: number, newOrder: number): Promise<Printer | undefined> {
    const [updated] = await db
      .update(printers)
      .set({ sortOrder: newOrder })
      .where(eq(printers.id, id))
      .returning();
    return updated || undefined;
  }

  // Slicer (software) implementations
  async getSlicers(): Promise<Slicer[]> {
    return await db.select().from(slicers);
  }

  async createSlicer(insertSlicer: InsertSlicer): Promise<Slicer> {
    const [slicer] = await db
      .insert(slicers)
      .values(insertSlicer)
      .returning();
    return slicer;
  }

  async deleteSlicer(id: number): Promise<boolean> {
    const [deleted] = await db
      .delete(slicers)
      .where(eq(slicers.id, id))
      .returning();
    return !!deleted;
  }

  async updateSlicerOrder(id: number, newOrder: number): Promise<Slicer | undefined> {
    const [updated] = await db
      .update(slicers)
      .set({ sortOrder: newOrder })
      .where(eq(slicers.id, id))
      .returning();
    return updated || undefined;
  }

  // Print Job implementations
  async getPrintJobs(userId: number): Promise<PrintJob[]> {
    return await db.select().from(printJobs).where(eq(printJobs.userId, userId));
  }

  async getPrintJob(id: number, userId: number): Promise<PrintJob | undefined> {
    const [job] = await db
      .select()
      .from(printJobs)
      .where(and(eq(printJobs.id, id), eq(printJobs.userId, userId)));
    return job || undefined;
  }

  async createPrintJob(insertJob: InsertPrintJob): Promise<PrintJob> {
    const [job] = await db
      .insert(printJobs)
      .values(insertJob)
      .returning();
    return job;
  }

  async updatePrintJob(id: number, updates: Partial<InsertPrintJob>, userId: number): Promise<PrintJob | undefined> {
    const [updated] = await db
      .update(printJobs)
      .set(updates)
      .where(and(eq(printJobs.id, id), eq(printJobs.userId, userId)))
      .returning();
    return updated || undefined;
  }

  async deletePrintJob(id: number, userId: number): Promise<boolean> {
    const [deleted] = await db
      .delete(printJobs)
      .where(and(eq(printJobs.id, id), eq(printJobs.userId, userId)))
      .returning();
    return !!deleted;
  }

  // Filament History implementations
  async getFilamentHistory(filamentId: number): Promise<FilamentHistory[]> {
    return await db
      .select()
      .from(filamentHistory)
      .where(eq(filamentHistory.filamentId, filamentId));
  }

  async createFilamentHistory(entry: InsertFilamentHistory): Promise<FilamentHistory> {
    const [history] = await db
      .insert(filamentHistory)
      .values(entry)
      .returning();
    return history;
  }

  // Slicer Profile implementations
  async getSlicerProfiles(userId: number): Promise<SlicerProfile[]> {
    return await db
      .select()
      .from(slicerProfiles)
      .where(eq(slicerProfiles.userId, userId))
      .orderBy(slicerProfiles.createdAt);
  }

  async getSlicerProfile(id: number, userId: number): Promise<SlicerProfile | undefined> {
    const [profile] = await db
      .select()
      .from(slicerProfiles)
      .where(and(eq(slicerProfiles.id, id), eq(slicerProfiles.userId, userId)));
    return profile || undefined;
  }

  async getPublicSlicerProfiles(manufacturer?: string, material?: string): Promise<SlicerProfile[]> {
    let query = db
      .select()
      .from(slicerProfiles)
      .where(eq(slicerProfiles.isPublic, true));

    const results = await query;

    return results.filter((profile) => {
      if (manufacturer && profile.manufacturer?.toLowerCase() !== manufacturer.toLowerCase()) {
        return false;
      }
      if (material && profile.material?.toLowerCase() !== material.toLowerCase()) {
        return false;
      }
      return true;
    });
  }

  async getSuggestedProfiles(
    userId: number,
    manufacturer?: string | null,
    material?: string | null
  ): Promise<SlicerProfile[]> {
    const userProfiles = await this.getSlicerProfiles(userId);
    const publicProfiles = await this.getPublicSlicerProfiles();

    const allProfiles = [...userProfiles];

    for (const profile of publicProfiles) {
      if (profile.userId !== userId) {
        allProfiles.push(profile);
      }
    }

    return allProfiles.filter((profile) => {
      if (manufacturer && profile.manufacturer?.toLowerCase() === manufacturer.toLowerCase()) {
        return true;
      }
      if (material && profile.material?.toLowerCase() === material.toLowerCase()) {
        return true;
      }
      if (
        manufacturer &&
        material &&
        profile.manufacturer?.toLowerCase() === manufacturer.toLowerCase() &&
        profile.material?.toLowerCase() === material.toLowerCase()
      ) {
        return true;
      }
      return false;
    });
  }

  async createSlicerProfile(profile: InsertSlicerProfile): Promise<SlicerProfile> {
    const [created] = await db.insert(slicerProfiles).values(profile).returning();
    return created;
  }

  async updateSlicerProfile(
    id: number,
    userId: number,
    updates: Partial<InsertSlicerProfile>
  ): Promise<SlicerProfile | undefined> {
    const [updated] = await db
      .update(slicerProfiles)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(slicerProfiles.id, id), eq(slicerProfiles.userId, userId)))
      .returning();
    return updated || undefined;
  }

  async deleteSlicerProfile(id: number, userId: number): Promise<boolean> {
    const result = await db
      .delete(slicerProfiles)
      .where(and(eq(slicerProfiles.id, id), eq(slicerProfiles.userId, userId)));
    return (result.rowCount ?? 0) > 0;
  }

  // Filament <-> Slicer Profile associations
  async getSlicerProfilesForFilament(userId: number, filamentId: number): Promise<SlicerProfile[]> {
    const profileIds = await db
      .select({ id: filamentSlicerProfiles.slicerProfileId })
      .from(filamentSlicerProfiles)
      .innerJoin(filaments, eq(filamentSlicerProfiles.filamentId, filaments.id))
      .where(and(eq(filaments.userId, userId), eq(filamentSlicerProfiles.filamentId, filamentId)));

    const ids = profileIds.map((row) => row.id).filter((id): id is number => typeof id === "number");
    if (ids.length === 0) return [];

    return await db.select().from(slicerProfiles).where(inArray(slicerProfiles.id, ids));
  }

  async setFilamentSlicerProfiles(filamentId: number, profileIds: number[]): Promise<void> {
    await db.delete(filamentSlicerProfiles).where(eq(filamentSlicerProfiles.filamentId, filamentId));
    if (profileIds.length === 0) return;
    await db.insert(filamentSlicerProfiles).values(
      profileIds.map((profileId) => ({
        filamentId,
        slicerProfileId: profileId,
      }))
    );
  }

  async getFilamentsForSlicerProfile(userId: number, profileId: number): Promise<Filament[]> {
    const filamentIds = await db
      .select({ id: filamentSlicerProfiles.filamentId })
      .from(filamentSlicerProfiles)
      .innerJoin(filaments, eq(filamentSlicerProfiles.filamentId, filaments.id))
      .where(and(eq(filaments.userId, userId), eq(filamentSlicerProfiles.slicerProfileId, profileId)));

    const ids = filamentIds.map((row) => row.id).filter((id): id is number => typeof id === "number");
    if (ids.length === 0) return [];

    return await db.select().from(filaments).where(inArray(filaments.id, ids));
  }

  async setSlicerProfileFilaments(profileId: number, filamentIds: number[]): Promise<void> {
    await db.delete(filamentSlicerProfiles).where(eq(filamentSlicerProfiles.slicerProfileId, profileId));
    if (filamentIds.length === 0) return;
    await db.insert(filamentSlicerProfiles).values(
      filamentIds.map((filamentId) => ({
        filamentId,
        slicerProfileId: profileId,
      }))
    );
  }
}

// Memory Storage implementation for development and testing
export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private filamentStore: Map<number, Filament>;
  private manufacturerStore: Map<number, Manufacturer>;
  private materialStore: Map<number, Material>;
  private colorStore: Map<number, Color>;
  private diameterStore: Map<number, Diameter>;
  private storageLocationStore: Map<number, StorageLocation>;
  private slicerProfileStore: Map<number, SlicerProfile>;
  private filamentSlicerProfileStore: FilamentSlicerProfile[];

  userCurrentId: number;
  filamentCurrentId: number;
  manufacturerCurrentId: number;
  materialCurrentId: number;
  colorCurrentId: number;
  diameterCurrentId: number;
  storageLocationCurrentId: number;
  slicerProfileCurrentId: number;

  constructor() {
    this.users = new Map();
    this.filamentStore = new Map();
    this.manufacturerStore = new Map();
    this.materialStore = new Map();
    this.colorStore = new Map();
    this.diameterStore = new Map();
    this.storageLocationStore = new Map();
    this.slicerProfileStore = new Map();
    this.filamentSlicerProfileStore = [];

    this.userCurrentId = 1;
    this.filamentCurrentId = 1;
    this.manufacturerCurrentId = 1;
    this.materialCurrentId = 1;
    this.colorCurrentId = 1;
    this.diameterCurrentId = 1;
    this.storageLocationCurrentId = 1;
    this.slicerProfileCurrentId = 1;

    // Add some initial data
    this.createFilament({
      name: "PLA Schwarz Bambu Lab",
      manufacturer: "Bambu Lab",
      material: "PLA",
      colorName: "Schwarz",
      colorCode: "#000000",
      diameter: "1.75",
      printTemp: "200-220°C",
      totalWeight: "1",
      remainingPercentage: "65"
    });

    this.createFilament({
      name: "PETG Transparent",
      manufacturer: "Prusament",
      material: "PETG",
      colorName: "Transparent",
      colorCode: "#FFFFFF",
      diameter: "1.75",
      printTemp: "230-250°C",
      totalWeight: "1",
      remainingPercentage: "15"
    });

    this.createFilament({
      name: "ABS Rot",
      manufacturer: "Filamentworld",
      material: "ABS",
      colorName: "Rot",
      colorCode: "#F44336",
      diameter: "1.75",
      printTemp: "240-260°C",
      totalWeight: "1",
      remainingPercentage: "0"
    });

    this.createFilament({
      name: "TPU Flexibel Grau",
      manufacturer: "Ninjatek",
      material: "TPU",
      colorName: "Grau",
      colorCode: "#9E9E9E",
      diameter: "1.75",
      printTemp: "210-230°C",
      totalWeight: "0.5",
      remainingPercentage: "75"
    });
  }

  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.userCurrentId++;
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  async updateUserApiKey(userId: number, encryptedKey: string | null): Promise<void> {
    const user = this.users.get(userId);
    if (user) {
      user.openaiApiKey = encryptedKey;
      this.users.set(userId, user);
    }
  }

  async updateUserModel(userId: number, model: string): Promise<void> {
    const user = this.users.get(userId);
    if (user) {
      (user as any).openaiModel = model;
      this.users.set(userId, user);
    }
  }

  // Filament implementations
  async getFilaments(userId: number): Promise<Filament[]> {
    return Array.from(this.filamentStore.values())
      .filter(filament => filament.userId === userId);
  }

  async getPublicFilamentsWithUser(userId: number, filterFn?: (filament: Filament) => boolean): Promise<{filaments: Filament[], user: {id: number, username: string}}> {
    // Get user
    const user = await this.getUser(userId);
    if (!user) {
      throw new Error(`User with ID ${userId} not found`);
    }

    // Get filaments
    const allFilaments = await this.getFilaments(userId);

    // Apply filter if provided
    const filteredFilaments = filterFn ? allFilaments.filter(filterFn) : allFilaments;

    // Return filaments with user information
    return {
      filaments: filteredFilaments,
      user: {
        id: user.id,
        username: user.username
      }
    };
  }

  async getFilament(id: number, userId: number): Promise<Filament | undefined> {
    const filament = this.filamentStore.get(id);
    if (filament && filament.userId === userId) {
      return filament;
    }
    return undefined;
  }

  async createFilament(insertFilament: InsertFilament): Promise<Filament> {
    const id = this.filamentCurrentId++;
    const filament: Filament = { ...insertFilament, id };
    this.filamentStore.set(id, filament);
    return filament;
  }

  async updateFilament(id: number, updateFilament: Partial<InsertFilament>, userId: number): Promise<Filament | undefined> {
    const existing = this.filamentStore.get(id);
    if (!existing || existing.userId !== userId) return undefined;

    const updated: Filament = { ...existing, ...updateFilament };
    this.filamentStore.set(id, updated);
    return updated;
  }

  async deleteFilament(id: number, userId: number): Promise<boolean> {
    const filament = this.filamentStore.get(id);
    if (filament && filament.userId === userId) {
      return this.filamentStore.delete(id);
    }
    return false;
  }

  // Batch operations
  async batchDeleteFilaments(ids: number[], userId: number): Promise<number> {
    let deletedCount = 0;
    for (const id of ids) {
      const filament = this.filamentStore.get(id);
      if (filament && filament.userId === userId) {
        this.filamentStore.delete(id);
        deletedCount++;
      }
    }
    return deletedCount;
  }

  async batchUpdateFilaments(ids: number[], updates: Partial<InsertFilament>, userId: number): Promise<number> {
    let updatedCount = 0;
    for (const id of ids) {
      const filament = this.filamentStore.get(id);
      if (filament && filament.userId === userId) {
        const updated = { ...filament, ...updates };
        this.filamentStore.set(id, updated);
        updatedCount++;
      }
    }
    return updatedCount;
  }

  // Manufacturer implementations
  async getManufacturers(): Promise<Manufacturer[]> {
    return Array.from(this.manufacturerStore.values())
      .sort((a, b) => {
        if (a.sortOrder !== null && b.sortOrder !== null) {
          return a.sortOrder - b.sortOrder;
        }
        return a.name.localeCompare(b.name);
      });
  }

  async createManufacturer(insertManufacturer: InsertManufacturer): Promise<Manufacturer> {
    const id = this.manufacturerCurrentId++;
    const manufacturer: Manufacturer = {
      ...insertManufacturer,
      id,
      createdAt: new Date(),
      sortOrder: 999 // Default to end of list
    };
    this.manufacturerStore.set(id, manufacturer);
    return manufacturer;
  }

  async deleteManufacturer(id: number): Promise<boolean> {
    return this.manufacturerStore.delete(id);
  }

  async updateManufacturerOrder(id: number, newOrder: number): Promise<Manufacturer | undefined> {
    const manufacturer = this.manufacturerStore.get(id);
    if (!manufacturer) return undefined;

    const updated = { ...manufacturer, sortOrder: newOrder };
    this.manufacturerStore.set(id, updated);
    return updated;
  }

  // Material implementations
  async getMaterials(): Promise<Material[]> {
    return Array.from(this.materialStore.values())
      .sort((a, b) => {
        if (a.sortOrder !== null && b.sortOrder !== null) {
          return a.sortOrder - b.sortOrder;
        }
        return a.name.localeCompare(b.name);
      });
  }

  async createMaterial(insertMaterial: InsertMaterial): Promise<Material> {
    const id = this.materialCurrentId++;
    const material: Material = {
      ...insertMaterial,
      id,
      createdAt: new Date(),
      sortOrder: 999 // Default to end of list
    };
    this.materialStore.set(id, material);
    return material;
  }

  async deleteMaterial(id: number): Promise<boolean> {
    return this.materialStore.delete(id);
  }

  async updateMaterialOrder(id: number, newOrder: number): Promise<Material | undefined> {
    const material = this.materialStore.get(id);
    if (!material) return undefined;

    const updated = { ...material, sortOrder: newOrder };
    this.materialStore.set(id, updated);
    return updated;
  }

  // Color implementations
  async getColors(): Promise<Color[]> {
    return Array.from(this.colorStore.values());
  }

  async createColor(insertColor: InsertColor): Promise<Color> {
    const id = this.colorCurrentId++;
    const color: Color = { ...insertColor, id, createdAt: new Date() };
    this.colorStore.set(id, color);
    return color;
  }

  async deleteColor(id: number): Promise<boolean> {
    return this.colorStore.delete(id);
  }

  // Diameter implementations
  async getDiameters(): Promise<Diameter[]> {
    return Array.from(this.diameterStore.values());
  }

  async createDiameter(insertDiameter: InsertDiameter): Promise<Diameter> {
    const id = this.diameterCurrentId++;
    const diameter: Diameter = { ...insertDiameter, id, createdAt: new Date() };
    this.diameterStore.set(id, diameter);
    return diameter;
  }

  async deleteDiameter(id: number): Promise<boolean> {
    return this.diameterStore.delete(id);
  }

  // Storage Location implementations
  async getStorageLocations(): Promise<StorageLocation[]> {
    return Array.from(this.storageLocationStore.values())
      .sort((a, b) => {
        if (a.sortOrder !== null && b.sortOrder !== null) {
          return a.sortOrder - b.sortOrder;
        }
        return a.name.localeCompare(b.name);
      });
  }

  async createStorageLocation(insertLocation: InsertStorageLocation): Promise<StorageLocation> {
    const id = this.storageLocationCurrentId++;
    const location: StorageLocation = {
      ...insertLocation,
      id,
      createdAt: new Date(),
      sortOrder: 999 // Default to end of list
    };
    this.storageLocationStore.set(id, location);
    return location;
  }

  async deleteStorageLocation(id: number): Promise<boolean> {
    return this.storageLocationStore.delete(id);
  }

  async updateStorageLocationOrder(id: number, newOrder: number): Promise<StorageLocation | undefined> {
    const location = this.storageLocationStore.get(id);
    if (!location) return undefined;

    const updated = { ...location, sortOrder: newOrder };
    this.storageLocationStore.set(id, updated);
    return updated;
  }

  // Slicer Profile implementations
  async getSlicerProfiles(userId: number): Promise<SlicerProfile[]> {
    return Array.from(this.slicerProfileStore.values())
      .filter((profile) => profile.userId === userId)
      .sort((a, b) => (a.createdAt?.getTime() || 0) - (b.createdAt?.getTime() || 0));
  }

  async getSlicerProfile(id: number, userId: number): Promise<SlicerProfile | undefined> {
    const profile = this.slicerProfileStore.get(id);
    if (!profile || profile.userId !== userId) return undefined;
    return profile;
  }

  async getPublicSlicerProfiles(manufacturer?: string, material?: string): Promise<SlicerProfile[]> {
    return Array.from(this.slicerProfileStore.values()).filter((profile) => {
      if (!profile.isPublic) return false;
      if (manufacturer && profile.manufacturer?.toLowerCase() !== manufacturer.toLowerCase()) {
        return false;
      }
      if (material && profile.material?.toLowerCase() !== material.toLowerCase()) {
        return false;
      }
      return true;
    });
  }

  async getSuggestedProfiles(
    userId: number,
    manufacturer?: string | null,
    material?: string | null
  ): Promise<SlicerProfile[]> {
    const userProfiles = await this.getSlicerProfiles(userId);
    const publicProfiles = await this.getPublicSlicerProfiles();
    const allProfiles = [...userProfiles, ...publicProfiles.filter((p) => p.userId !== userId)];

    return allProfiles.filter((profile) => {
      if (manufacturer && profile.manufacturer?.toLowerCase() === manufacturer.toLowerCase()) {
        return true;
      }
      if (material && profile.material?.toLowerCase() === material.toLowerCase()) {
        return true;
      }
      if (
        manufacturer &&
        material &&
        profile.manufacturer?.toLowerCase() === manufacturer.toLowerCase() &&
        profile.material?.toLowerCase() === material.toLowerCase()
      ) {
        return true;
      }
      return false;
    });
  }

  async createSlicerProfile(profile: InsertSlicerProfile): Promise<SlicerProfile> {
    const id = this.slicerProfileCurrentId++;
    const created: SlicerProfile = {
      ...profile,
      id,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.slicerProfileStore.set(id, created);
    return created;
  }

  async updateSlicerProfile(
    id: number,
    userId: number,
    updates: Partial<InsertSlicerProfile>
  ): Promise<SlicerProfile | undefined> {
    const existing = await this.getSlicerProfile(id, userId);
    if (!existing) return undefined;
    const updated: SlicerProfile = { ...existing, ...updates, updatedAt: new Date() };
    this.slicerProfileStore.set(id, updated);
    return updated;
  }

  async deleteSlicerProfile(id: number, userId: number): Promise<boolean> {
    const existing = await this.getSlicerProfile(id, userId);
    if (!existing) return false;
    this.slicerProfileStore.delete(id);
    this.filamentSlicerProfileStore = this.filamentSlicerProfileStore.filter(
      (link) => link.slicerProfileId !== id
    );
    return true;
  }

  // Filament <-> Slicer Profile associations
  async getSlicerProfilesForFilament(userId: number, filamentId: number): Promise<SlicerProfile[]> {
    const filament = this.filamentStore.get(filamentId);
    if (!filament || filament.userId !== userId) return [];

    const profileIds = this.filamentSlicerProfileStore
      .filter((link) => link.filamentId === filamentId)
      .map((link) => link.slicerProfileId);
    return profileIds
      .map((id) => this.slicerProfileStore.get(id))
      .filter((profile): profile is SlicerProfile => Boolean(profile));
  }

  async setFilamentSlicerProfiles(filamentId: number, profileIds: number[]): Promise<void> {
    this.filamentSlicerProfileStore = this.filamentSlicerProfileStore.filter(
      (link) => link.filamentId !== filamentId
    );
    for (const profileId of profileIds) {
      this.filamentSlicerProfileStore.push({
        id: this.filamentSlicerProfileStore.length + 1,
        filamentId,
        slicerProfileId: profileId,
        createdAt: new Date(),
      });
    }
  }

  async getFilamentsForSlicerProfile(userId: number, profileId: number): Promise<Filament[]> {
    const filamentIds = this.filamentSlicerProfileStore
      .filter((link) => link.slicerProfileId === profileId)
      .map((link) => link.filamentId);
    return filamentIds
      .map((id) => this.filamentStore.get(id))
      .filter((filament): filament is Filament => Boolean(filament))
      .filter((filament) => filament.userId === userId);
  }

  async setSlicerProfileFilaments(profileId: number, filamentIds: number[]): Promise<void> {
    this.filamentSlicerProfileStore = this.filamentSlicerProfileStore.filter(
      (link) => link.slicerProfileId !== profileId
    );
    for (const filamentId of filamentIds) {
      this.filamentSlicerProfileStore.push({
        id: this.filamentSlicerProfileStore.length + 1,
        filamentId,
        slicerProfileId: profileId,
        createdAt: new Date(),
      });
    }
  }
}

// Export database storage for production use
export const storage = new DatabaseStorage();
