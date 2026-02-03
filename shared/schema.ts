import { pgTable, text, serial, integer, boolean, numeric, date, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  isAdmin: boolean("is_admin").default(false),
  forceChangePassword: boolean("force_change_password").default(true),
  language: text("language").default("en"),
  currency: text("currency").default("EUR"),
  temperatureUnit: text("temperature_unit").default("C"),
  // Encrypted OpenAI API key for AI features
  openaiApiKey: text("openai_api_key"),
  // Preferred OpenAI model for image analysis
  openaiModel: text("openai_model").default("gpt-4o"),
  lastLogin: timestamp("last_login"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const filaments = pgTable("filaments", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  manufacturer: text("manufacturer"),
  material: text("material").notNull(),
  colorName: text("color_name").notNull(),
  colorCode: text("color_code"),
  diameter: numeric("diameter"),
  printTemp: text("print_temp"),
  printSpeed: text("print_speed"), // Print speed range (e.g., '30-100mm/s')
  totalWeight: numeric("total_weight").notNull(),
  remainingPercentage: numeric("remaining_percentage").notNull(),
  purchaseDate: date("purchase_date"),
  purchasePrice: numeric("purchase_price"), // Kaufpreis in EUR
  status: text("status"),  // 'sealed', 'opened'
  spoolType: text("spool_type"), // 'spooled', 'spoolless'
  dryerCount: integer("dryer_count").default(0), // Anzahl der Trocknungen
  lastDryingDate: date("last_drying_date"), // Datum der letzten Trocknung
  storageLocation: text("storage_location"), // Main storage location (e.g., "A - Bedroom Shelf")
  locationDetails: text("location_details"), // Sub-location details (e.g., "Top, Row 2, Slot 3")
  imageUrl: text("image_url"), // URL/path to spool image
  notes: text("notes"), // User notes about the filament
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
  isAdmin: true,
  forceChangePassword: true,
  language: true,
  currency: true,
  temperatureUnit: true,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(6, "Password must be at least 6 characters"),
});

// Bearbeiten Sie das Schema, um sicherzustellen, dass numerische Felder korrekt konvertiert werden
// Schema für das Einfügen von Filaments ohne Transformation
const baseInsertFilamentSchema = createInsertSchema(filaments).omit({
  id: true,
});

// Schema mit Transformation für die Formvalidierung
export const insertFilamentSchema = baseInsertFilamentSchema.transform((data) => {
  // Konvertiert numerische Werte zu Strings für die Datenbank
  return {
    ...data,
    diameter: data.diameter?.toString(),
    totalWeight: data.totalWeight.toString(),
    remainingPercentage: data.remainingPercentage.toString(),
    purchasePrice: data.purchasePrice?.toString(),
    dryerCount: data.dryerCount !== undefined ? data.dryerCount : 0
  };
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Wichtiger Typ ohne Transformation für die Datenbankoperationen
export type InsertFilament = z.infer<typeof baseInsertFilamentSchema>;
export type Filament = typeof filaments.$inferSelect;

// Neue Listen für die Einstellungen
export const manufacturers = pgTable("manufacturers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  sortOrder: integer("sort_order").default(999),
  createdAt: timestamp("created_at").defaultNow()
});

export const materials = pgTable("materials", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  sortOrder: integer("sort_order").default(999),
  createdAt: timestamp("created_at").defaultNow()
});

export const colors = pgTable("colors", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  code: text("code").notNull(),
  createdAt: timestamp("created_at").defaultNow()
});

export const diameters = pgTable("diameters", {
  id: serial("id").primaryKey(),
  value: numeric("value").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow()
});

export const storageLocations = pgTable("storage_locations", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"), // Optional description of the location
  capacity: integer("capacity"), // How many spools it can hold
  sortOrder: integer("sort_order").default(999),
  createdAt: timestamp("created_at").defaultNow()
});

// Insert-Schemas für die neuen Listen
export const insertManufacturerSchema = createInsertSchema(manufacturers).omit({
  id: true,
  createdAt: true,
  sortOrder: true,
});

export const insertMaterialSchema = createInsertSchema(materials).omit({
  id: true,
  createdAt: true,
  sortOrder: true,
});

export const insertColorSchema = createInsertSchema(colors).omit({
  id: true,
  createdAt: true,
});

export const insertDiameterSchema = createInsertSchema(diameters).omit({
  id: true,
  createdAt: true,
}).transform((data) => {
  return {
    ...data,
    value: data.value.toString()
  };
});

export const insertStorageLocationSchema = createInsertSchema(storageLocations).omit({
  id: true,
  createdAt: true,
  sortOrder: true,
});

// Typen für die neuen Listen
export type InsertManufacturer = z.infer<typeof insertManufacturerSchema>;
export type Manufacturer = typeof manufacturers.$inferSelect;

export type InsertMaterial = z.infer<typeof insertMaterialSchema>;
export type Material = typeof materials.$inferSelect;

export type InsertColor = z.infer<typeof insertColorSchema>;
export type Color = typeof colors.$inferSelect;

export type InsertDiameter = z.infer<typeof insertDiameterSchema>;
export type Diameter = typeof diameters.$inferSelect;

export type InsertStorageLocation = z.infer<typeof insertStorageLocationSchema>;
export type StorageLocation = typeof storageLocations.$inferSelect;

// User sharing settings
export const userSharing = pgTable("user_sharing", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  materialId: integer("material_id").references(() => materials.id, { onDelete: "cascade" }),
  isPublic: boolean("is_public").default(false),
  createdAt: timestamp("created_at").defaultNow()
});

export const insertUserSharingSchema = createInsertSchema(userSharing).omit({
  id: true,
  createdAt: true,
});

export type InsertUserSharing = z.infer<typeof insertUserSharingSchema>;
export type UserSharing = typeof userSharing.$inferSelect;

// Upload sessions for mobile QR code uploads
export const uploadSessions = pgTable("upload_sessions", {
  id: serial("id").primaryKey(),
  sessionToken: text("session_token").notNull().unique(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  status: text("status").default("pending"), // 'pending', 'uploading', 'processing', 'completed', 'expired'
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertUploadSessionSchema = createInsertSchema(uploadSessions).omit({
  id: true,
  createdAt: true,
});

export type InsertUploadSession = z.infer<typeof insertUploadSessionSchema>;
export type UploadSession = typeof uploadSessions.$inferSelect;

// Temporary storage for images uploaded via mobile before processing
export const pendingUploads = pgTable("pending_uploads", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull().references(() => uploadSessions.id, { onDelete: "cascade" }),
  imageUrl: text("image_url").notNull(),
  extractedData: text("extracted_data"), // JSON string of extracted filament data
  status: text("status").default("pending"), // 'pending', 'processing', 'ready', 'imported', 'error'
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPendingUploadSchema = createInsertSchema(pendingUploads).omit({
  id: true,
  createdAt: true,
});

export type InsertPendingUpload = z.infer<typeof insertPendingUploadSchema>;
export type PendingUpload = typeof pendingUploads.$inferSelect;
