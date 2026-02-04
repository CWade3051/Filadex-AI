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
  // Weight tracking fields (Phase 1.1)
  emptySpoolWeight: numeric("empty_spool_weight"), // Weight of empty spool in grams (typically 200-250g)
  currentWeight: numeric("current_weight"), // Current weight of spool in grams (last weighed)
  lastWeighedAt: timestamp("last_weighed_at"), // When the spool was last weighed
  // Archive fields (Phase 1.2)
  isArchived: boolean("is_archived").default(false), // Whether spool is archived
  archivedAt: timestamp("archived_at"), // When spool was archived
  archiveReason: text("archive_reason"), // Reason for archiving: 'empty', 'damaged', 'manual'
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

// Printers list for print job logging
export const printers = pgTable("printers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  manufacturer: text("manufacturer"), // e.g., "Bambu Lab", "Creality", "Prusa"
  model: text("model"), // e.g., "X1 Carbon", "Ender 3", "MK4"
  sortOrder: integer("sort_order").default(999),
  createdAt: timestamp("created_at").defaultNow()
});

// Slicers list for print job logging
export const slicers = pgTable("slicers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
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

export const insertPrinterSchema = createInsertSchema(printers).omit({
  id: true,
  createdAt: true,
  sortOrder: true,
});

export const insertSlicerSchema = createInsertSchema(slicers).omit({
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

export type InsertPrinter = z.infer<typeof insertPrinterSchema>;
export type Printer = typeof printers.$inferSelect;

export type InsertSlicer = z.infer<typeof insertSlicerSchema>;
export type Slicer = typeof slicers.$inferSelect;

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

// Phase 2: Print job logging
export const printJobs = pgTable("print_jobs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }),
  
  // Print identification
  name: text("name").notNull(),
  description: text("description"),
  
  // Filament usage - stored as JSON array: [{filamentId, gramsUsed, metersUsed}]
  filamentUsages: text("filament_usages"), // JSON string
  
  // Time tracking
  printStartedAt: timestamp("print_started_at"),
  printCompletedAt: timestamp("print_completed_at"),
  estimatedDuration: integer("estimated_duration"), // minutes
  actualDuration: integer("actual_duration"), // minutes
  
  // Weight estimates vs actuals
  estimatedWeight: numeric("estimated_weight"), // grams (from slicer/gcode)
  actualWeight: numeric("actual_weight"), // grams (if weighed)
  
  // Status
  status: text("status").default("completed"), // completed, failed, cancelled
  failureReason: text("failure_reason"),
  
  // Source info
  gcodeFilename: text("gcode_filename"),
  slicerUsed: text("slicer_used"), // OrcaSlicer, BambuStudio, PrusaSlicer, Cura
  printerUsed: text("printer_used"),
  
  // Metadata
  thumbnailUrl: text("thumbnail_url"), // G-code thumbnail if extracted
  notes: text("notes"),
  
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPrintJobSchema = createInsertSchema(printJobs).omit({
  id: true,
  createdAt: true,
});

export type InsertPrintJob = z.infer<typeof insertPrintJobSchema>;
export type PrintJob = typeof printJobs.$inferSelect;

// Filament usage history for tracking consumption over time
export const filamentHistory = pgTable("filament_history", {
  id: serial("id").primaryKey(),
  filamentId: integer("filament_id").references(() => filaments.id, { onDelete: "cascade" }),
  
  // Snapshot data at this point in time
  remainingPercentage: numeric("remaining_percentage"),
  currentWeight: numeric("current_weight"),
  
  // Change info
  changeType: text("change_type"), // 'print', 'adjustment', 'weigh', 'import'
  changeAmount: numeric("change_amount"), // grams (negative = used, positive = added)
  printJobId: integer("print_job_id").references(() => printJobs.id, { onDelete: "set null" }),
  
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertFilamentHistorySchema = createInsertSchema(filamentHistory).omit({
  id: true,
  createdAt: true,
});

export type InsertFilamentHistory = z.infer<typeof insertFilamentHistorySchema>;
export type FilamentHistory = typeof filamentHistory.$inferSelect;

// Phase 3: Material Compatibility Matrix
export const materialCompatibility = pgTable("material_compatibility", {
  id: serial("id").primaryKey(),
  material1: text("material1").notNull(),
  material2: text("material2").notNull(),
  
  // Compatibility level: excellent, good, poor, incompatible
  compatibilityLevel: text("compatibility_level").notNull(),
  
  // Details
  notes: text("notes"),
  interfaceStrength: text("interface_strength"), // strong, medium, weak
  recommendedSettings: text("recommended_settings"), // JSON string for custom settings
  
  // Source of information
  source: text("source"), // bambulab, prusa, user, etc.
  
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertMaterialCompatibilitySchema = createInsertSchema(materialCompatibility).omit({
  id: true,
  createdAt: true,
});

export type InsertMaterialCompatibility = z.infer<typeof insertMaterialCompatibilitySchema>;
export type MaterialCompatibility = typeof materialCompatibility.$inferSelect;

// Phase 3: Slicer Profiles
export const slicerProfiles = pgTable("slicer_profiles", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }),
  
  // Profile identification
  name: text("name").notNull(),
  manufacturer: text("manufacturer"),
  material: text("material"),
  
  // File storage
  fileUrl: text("file_url"),
  originalFilename: text("original_filename"),
  fileType: text("file_type"), // orcaslicer, bambu, prusaslicer, cura
  
  // Parsed settings (JSON string)
  parsedSettings: text("parsed_settings"),
  rawProfile: text("raw_profile"),
  
  // Metadata
  slicerVersion: text("slicer_version"),
  printerModel: text("printer_model"),
  notes: text("notes"),
  isPublic: boolean("is_public").default(false),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertSlicerProfileSchema = createInsertSchema(slicerProfiles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertSlicerProfile = z.infer<typeof insertSlicerProfileSchema>;
export type SlicerProfile = typeof slicerProfiles.$inferSelect;

export const filamentSlicerProfiles = pgTable("filament_slicer_profiles", {
  id: serial("id").primaryKey(),
  filamentId: integer("filament_id").references(() => filaments.id, { onDelete: "cascade" }),
  slicerProfileId: integer("slicer_profile_id").references(() => slicerProfiles.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertFilamentSlicerProfileSchema = createInsertSchema(filamentSlicerProfiles).omit({
  id: true,
  createdAt: true,
});

export type InsertFilamentSlicerProfile = z.infer<typeof insertFilamentSlicerProfileSchema>;
export type FilamentSlicerProfile = typeof filamentSlicerProfiles.$inferSelect;

// Phase 3: Cloud Backup Configuration
export const cloudBackupConfigs = pgTable("cloud_backup_configs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }),
  
  provider: text("provider").notNull(), // google, dropbox, onedrive, s3, webdav
  
  // OAuth tokens (for Google, Dropbox, OneDrive)
  accessToken: text("access_token"), // encrypted
  refreshToken: text("refresh_token"), // encrypted
  tokenExpiresAt: timestamp("token_expires_at"),
  
  // S3-compatible storage settings
  s3Endpoint: text("s3_endpoint"), // e.g., https://s3.amazonaws.com or https://s3.us-west-001.backblazeb2.com
  s3Bucket: text("s3_bucket"),
  s3Region: text("s3_region"),
  s3AccessKeyId: text("s3_access_key_id"), // encrypted
  s3SecretAccessKey: text("s3_secret_access_key"), // encrypted
  
  // WebDAV settings
  webdavUrl: text("webdav_url"), // e.g., https://nextcloud.example.com/remote.php/dav/files/user/
  webdavUsername: text("webdav_username"),
  webdavPassword: text("webdav_password"), // encrypted
  
  // Settings
  isEnabled: boolean("is_enabled").default(false),
  backupFrequency: text("backup_frequency"), // daily, weekly, manual
  lastBackupAt: timestamp("last_backup_at"),
  folderPath: text("folder_path"),
  
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCloudBackupConfigSchema = createInsertSchema(cloudBackupConfigs).omit({
  id: true,
  createdAt: true,
});

export type InsertCloudBackupConfig = z.infer<typeof insertCloudBackupConfigSchema>;
export type CloudBackupConfig = typeof cloudBackupConfigs.$inferSelect;

// Backup History
export const backupHistory = pgTable("backup_history", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }),
  
  provider: text("provider"),
  status: text("status"), // success, failed, in_progress
  fileSize: integer("file_size"), // bytes
  cloudFileId: text("cloud_file_id"),
  errorMessage: text("error_message"),
  
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
});

export const insertBackupHistorySchema = createInsertSchema(backupHistory).omit({
  id: true,
});

export type InsertBackupHistory = z.infer<typeof insertBackupHistorySchema>;
export type BackupHistory = typeof backupHistory.$inferSelect;
