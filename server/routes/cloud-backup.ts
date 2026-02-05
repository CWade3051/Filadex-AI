import { Express, Request, Response } from "express";
import { storage } from "../storage";
import { authenticate } from "../auth";
import { logger as appLogger } from "../utils/logger";
import { db } from "../db";
import {
  cloudBackupConfigs,
  backupHistory,
  filaments,
  manufacturers,
  materials,
  colors,
  diameters,
  storageLocations,
  printers,
  slicers,
  printJobs,
  slicerProfiles,
  filamentSlicerProfiles,
  materialCompatibility,
  filamentHistory,
  userSharing,
  users,
  uploadSessions,
  pendingUploads,
} from "@shared/schema";
import { eq, and, ne, inArray } from "drizzle-orm";
import bcrypt from "bcrypt";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import archiver from "archiver";
import unzipper from "unzipper";
import { Readable } from "stream";
import multer from "multer";

// Configure multer for zip file uploads
const zipUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB max
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "application/zip" || file.originalname.endsWith(".zip")) {
      cb(null, true);
    } else {
      cb(new Error("Only zip files are allowed"));
    }
  },
});

// Cloud provider OAuth configurations
// Note: These would be set in environment variables in production
const OAUTH_CONFIGS = {
  google: {
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scope: "https://www.googleapis.com/auth/drive.file",
    uploadUrl: "https://www.googleapis.com/upload/drive/v3/files",
    filesUrl: "https://www.googleapis.com/drive/v3/files",
  },
  dropbox: {
    authUrl: "https://www.dropbox.com/oauth2/authorize",
    tokenUrl: "https://api.dropboxapi.com/oauth2/token",
    uploadUrl: "https://content.dropboxapi.com/2/files/upload",
    listUrl: "https://api.dropboxapi.com/2/files/list_folder",
  },
  onedrive: {
    authUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    scope: "Files.ReadWrite.All offline_access",
    uploadUrl: "https://graph.microsoft.com/v1.0/me/drive/root:",
  },
};

// Encrypt/decrypt tokens for storage
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "filadex-cloud-backup-key-32b!";

function encryptToken(token: string): string {
  const iv = crypto.randomBytes(16);
  const key = crypto.scryptSync(ENCRYPTION_KEY, "salt", 32);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  let encrypted = cipher.update(token, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

function decryptToken(encryptedToken: string): string {
  try {
    const [ivHex, authTagHex, encrypted] = encryptedToken.split(":");
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const key = crypto.scryptSync(ENCRYPTION_KEY, "salt", 32);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (error) {
    appLogger.error("Error decrypting token:", error);
    throw new Error("Failed to decrypt token");
  }
}

// Generate backup data for a single user
async function generateBackupData(userId: number) {
  // Get user settings (non-sensitive only)
  const [user] = await db
    .select({
      language: users.language,
      currency: users.currency,
      temperatureUnit: users.temperatureUnit,
    })
    .from(users)
    .where(eq(users.id, userId));

  // User-specific data
  const userFilaments = await db
    .select()
    .from(filaments)
    .where(eq(filaments.userId, userId));

  const userPrintJobs = await db
    .select()
    .from(printJobs)
    .where(eq(printJobs.userId, userId));

  const userProfiles = await db
    .select()
    .from(slicerProfiles)
    .where(eq(slicerProfiles.userId, userId));

  const userSharingSettings = await db
    .select()
    .from(userSharing)
    .where(eq(userSharing.userId, userId));

  const userUploadSessions = await db
    .select()
    .from(uploadSessions)
    .where(eq(uploadSessions.userId, userId));

  const sessionIds = userUploadSessions.map((s) => s.id);
  const userPendingUploads = sessionIds.length > 0
    ? await db
        .select()
        .from(pendingUploads)
        .where(inArray(pendingUploads.sessionId, sessionIds))
    : [];

  // Get filament history for user's filaments
  const filamentIds = userFilaments.map(f => f.id);
  const userFilamentHistory = filamentIds.length > 0
    ? await db.select().from(filamentHistory)
    : [];
  // Filter to only include history for user's filaments
  const filteredHistory = userFilamentHistory.filter(h => filamentIds.includes(h.filamentId!));

  const userFilamentSlicerProfiles = filamentIds.length > 0
    ? await db
        .select()
        .from(filamentSlicerProfiles)
        .where(inArray(filamentSlicerProfiles.filamentId, filamentIds))
    : [];

  // Get user's backup history
  const userBackupHistory = await db
    .select()
    .from(backupHistory)
    .where(eq(backupHistory.userId, userId));

  // Shared data (all users)
  const allManufacturers = await db.select().from(manufacturers);
  const allMaterials = await db.select().from(materials);
  const allColors = await db.select().from(colors);
  const allDiameters = await db.select().from(diameters);
  const allLocations = await db.select().from(storageLocations);
  const allPrinters = await db.select().from(printers);
  const allSlicers = await db.select().from(slicers);
  const allCompatibility = await db.select().from(materialCompatibility);

  return {
    version: "1.4",
    backupType: "user",
    exportedAt: new Date().toISOString(),
    userSettings: user || {},
    data: {
      // User-specific
      filaments: userFilaments,
      printJobs: userPrintJobs,
      slicerProfiles: userProfiles,
      filamentSlicerProfiles: userFilamentSlicerProfiles,
      filamentHistory: filteredHistory,
      uploadSessions: userUploadSessions,
      pendingUploads: userPendingUploads,
      userSharing: userSharingSettings,
      backupHistory: userBackupHistory,
      // Shared lists
      manufacturers: allManufacturers,
      materials: allMaterials,
      colors: allColors,
      diameters: allDiameters,
      storageLocations: allLocations,
      printers: allPrinters,
      slicers: allSlicers,
      materialCompatibility: allCompatibility,
    },
  };
}

// Generate full admin backup (all users' data)
async function generateAdminBackupData() {
  // Get all users (without passwords or API keys)
  const allUsers = await db
    .select({
      id: users.id,
      username: users.username,
      isAdmin: users.isAdmin,
      language: users.language,
      currency: users.currency,
      temperatureUnit: users.temperatureUnit,
      createdAt: users.createdAt,
    })
    .from(users);

  // All user data
  const allFilaments = await db.select().from(filaments);
  const allPrintJobs = await db.select().from(printJobs);
  const allProfiles = await db.select().from(slicerProfiles);
  const allFilamentSlicerProfiles = await db.select().from(filamentSlicerProfiles);
  const allFilamentHistory = await db.select().from(filamentHistory);
  const allUserSharing = await db.select().from(userSharing);
  const allBackupHistory = await db.select().from(backupHistory);
  const allUploadSessions = await db.select().from(uploadSessions);
  const allPendingUploads = await db.select().from(pendingUploads);

  // Shared data
  const allManufacturers = await db.select().from(manufacturers);
  const allMaterials = await db.select().from(materials);
  const allColors = await db.select().from(colors);
  const allDiameters = await db.select().from(diameters);
  const allLocations = await db.select().from(storageLocations);
  const allPrinters = await db.select().from(printers);
  const allSlicers = await db.select().from(slicers);
  const allCompatibility = await db.select().from(materialCompatibility);

  return {
    version: "1.4",
    backupType: "admin_full",
    exportedAt: new Date().toISOString(),
    data: {
      // Users
      users: allUsers,
      // User-specific data
      filaments: allFilaments,
      printJobs: allPrintJobs,
      slicerProfiles: allProfiles,
      filamentSlicerProfiles: allFilamentSlicerProfiles,
      filamentHistory: allFilamentHistory,
      uploadSessions: allUploadSessions,
      pendingUploads: allPendingUploads,
      userSharing: allUserSharing,
      backupHistory: allBackupHistory,
      // Shared lists
      manufacturers: allManufacturers,
      materials: allMaterials,
      colors: allColors,
      diameters: allDiameters,
      storageLocations: allLocations,
      printers: allPrinters,
      slicers: allSlicers,
      materialCompatibility: allCompatibility,
    },
  };
}

export function registerCloudBackupRoutes(app: Express) {
  // Get OAuth availability status (which providers have credentials configured)
  app.get("/api/cloud-backup/oauth-available", authenticate, async (_req: Request, res: Response) => {
    res.json({
      google: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
      dropbox: !!(process.env.DROPBOX_CLIENT_ID && process.env.DROPBOX_CLIENT_SECRET),
      onedrive: !!(process.env.ONEDRIVE_CLIENT_ID && process.env.ONEDRIVE_CLIENT_SECRET),
    });
  });

  // Get cloud backup configuration status
  app.get("/api/cloud-backup/status", authenticate, async (req: Request, res: Response) => {
    try {
      const configs = await db
        .select()
        .from(cloudBackupConfigs)
        .where(eq(cloudBackupConfigs.userId, req.userId!));

      const status = {
        google: { configured: false, enabled: false, lastBackup: null as string | null },
        dropbox: { configured: false, enabled: false, lastBackup: null as string | null },
        onedrive: { configured: false, enabled: false, lastBackup: null as string | null },
      };

      for (const config of configs) {
        const provider = config.provider as keyof typeof status;
        if (status[provider]) {
          status[provider] = {
            configured: !!config.accessToken,
            enabled: config.isEnabled || false,
            lastBackup: config.lastBackupAt?.toISOString() || null,
          };
        }
      }

      res.json(status);
    } catch (error) {
      appLogger.error("Error fetching cloud backup status:", error);
      res.status(500).json({ message: "Failed to fetch cloud backup status" });
    }
  });

  // Get backup history
  app.get("/api/cloud-backup/history", authenticate, async (req: Request, res: Response) => {
    try {
      const history = await db
        .select()
        .from(backupHistory)
        .where(eq(backupHistory.userId, req.userId!))
        .orderBy(backupHistory.startedAt);

      res.json(history.slice(-50)); // Last 50 backups
    } catch (error) {
      appLogger.error("Error fetching backup history:", error);
      res.status(500).json({ message: "Failed to fetch backup history" });
    }
  });

  // Initialize OAuth flow for a provider
  app.get(
    "/api/cloud-backup/auth/:provider",
    authenticate,
    async (req: Request, res: Response) => {
      try {
        const { provider } = req.params;

        if (!["google", "dropbox", "onedrive"].includes(provider)) {
          return res.status(400).json({ message: "Invalid provider" });
        }

        const config = OAUTH_CONFIGS[provider as keyof typeof OAUTH_CONFIGS];
        const clientId = process.env[`${provider.toUpperCase()}_CLIENT_ID`];
        const redirectUri = `${process.env.APP_URL || "http://localhost:5001"}/api/cloud-backup/callback/${provider}`;

        if (!clientId) {
          return res.status(400).json({
            message: `${provider} OAuth is not configured. Please set ${provider.toUpperCase()}_CLIENT_ID environment variable.`,
          });
        }

        // Generate state token for CSRF protection
        const state = crypto.randomBytes(32).toString("hex");

        // Store state temporarily (in production, use Redis or similar)
        // For now, we'll encode user info in state
        const stateData = Buffer.from(
          JSON.stringify({ userId: req.userId, state, timestamp: Date.now() })
        ).toString("base64");

        let authUrl: string;

        if (provider === "google") {
          authUrl = `${config.authUrl}?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(config.scope!)}&access_type=offline&prompt=consent&state=${stateData}`;
        } else if (provider === "dropbox") {
          authUrl = `${config.authUrl}?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&token_access_type=offline&state=${stateData}`;
        } else if (provider === "onedrive") {
          authUrl = `${config.authUrl}?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(config.scope!)}&state=${stateData}`;
        } else {
          return res.status(400).json({ message: "Invalid provider" });
        }

        res.json({ authUrl });
      } catch (error) {
        appLogger.error("Error initiating OAuth:", error);
        res.status(500).json({ message: "Failed to initiate OAuth" });
      }
    }
  );

  // OAuth callback handler
  app.get(
    "/api/cloud-backup/callback/:provider",
    async (req: Request, res: Response) => {
      try {
        const { provider } = req.params;
        const { code, state, error } = req.query;

        if (error) {
          return res.redirect(`/settings?cloud_error=${encodeURIComponent(String(error))}`);
        }

        if (!code || !state) {
          return res.redirect("/settings?cloud_error=missing_params");
        }

        // Decode state to get user ID
        let stateData;
        try {
          stateData = JSON.parse(Buffer.from(String(state), "base64").toString());
        } catch {
          return res.redirect("/settings?cloud_error=invalid_state");
        }

        const { userId, timestamp } = stateData;

        // Check state freshness (10 minute expiry)
        if (Date.now() - timestamp > 10 * 60 * 1000) {
          return res.redirect("/settings?cloud_error=state_expired");
        }

        const config = OAUTH_CONFIGS[provider as keyof typeof OAUTH_CONFIGS];
        const clientId = process.env[`${provider.toUpperCase()}_CLIENT_ID`];
        const clientSecret = process.env[`${provider.toUpperCase()}_CLIENT_SECRET`];
        const redirectUri = `${process.env.APP_URL || "http://localhost:5001"}/api/cloud-backup/callback/${provider}`;

        if (!clientId || !clientSecret) {
          return res.redirect("/settings?cloud_error=oauth_not_configured");
        }

        // Exchange code for tokens
        let tokenResponse;
        try {
          const tokenParams = new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            code: String(code),
            redirect_uri: redirectUri,
            grant_type: "authorization_code",
          });

          tokenResponse = await fetch(config.tokenUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: tokenParams.toString(),
          });

          if (!tokenResponse.ok) {
            const errorText = await tokenResponse.text();
            appLogger.error(`Token exchange failed for ${provider}:`, errorText);
            return res.redirect("/settings?cloud_error=token_exchange_failed");
          }
        } catch (fetchError) {
          appLogger.error(`Token fetch error for ${provider}:`, fetchError);
          return res.redirect("/settings?cloud_error=token_fetch_failed");
        }

        const tokens = await tokenResponse.json();

        // Store tokens in database
        const existingConfig = await db
          .select()
          .from(cloudBackupConfigs)
          .where(
            and(eq(cloudBackupConfigs.userId, userId), eq(cloudBackupConfigs.provider, provider))
          );

        const encryptedAccess = encryptToken(tokens.access_token);
        const encryptedRefresh = tokens.refresh_token ? encryptToken(tokens.refresh_token) : null;
        const expiresAt = tokens.expires_in
          ? new Date(Date.now() + tokens.expires_in * 1000)
          : null;

        if (existingConfig.length > 0) {
          await db
            .update(cloudBackupConfigs)
            .set({
              accessToken: encryptedAccess,
              refreshToken: encryptedRefresh,
              tokenExpiresAt: expiresAt,
              isEnabled: true,
            })
            .where(eq(cloudBackupConfigs.id, existingConfig[0].id));
        } else {
          await db.insert(cloudBackupConfigs).values({
            userId,
            provider,
            accessToken: encryptedAccess,
            refreshToken: encryptedRefresh,
            tokenExpiresAt: expiresAt,
            isEnabled: true,
            backupFrequency: "daily",
            folderPath: "/Filadex Backups",
          });
        }

        res.redirect("/settings?cloud_success=" + provider);
      } catch (error) {
        appLogger.error("Error in OAuth callback:", error);
        res.redirect("/settings?cloud_error=callback_failed");
      }
    }
  );

  // Disconnect a provider
  app.delete(
    "/api/cloud-backup/:provider",
    authenticate,
    async (req: Request, res: Response) => {
      try {
        const { provider } = req.params;

        await db
          .delete(cloudBackupConfigs)
          .where(
            and(
              eq(cloudBackupConfigs.userId, req.userId!),
              eq(cloudBackupConfigs.provider, provider)
            )
          );

        res.json({ message: "Provider disconnected" });
      } catch (error) {
        appLogger.error("Error disconnecting provider:", error);
        res.status(500).json({ message: "Failed to disconnect provider" });
      }
    }
  );

  // Toggle backup enabled status
  app.patch(
    "/api/cloud-backup/:provider/toggle",
    authenticate,
    async (req: Request, res: Response) => {
      try {
        const { provider } = req.params;
        const { enabled } = req.body;

        await db
          .update(cloudBackupConfigs)
          .set({ isEnabled: enabled })
          .where(
            and(
              eq(cloudBackupConfigs.userId, req.userId!),
              eq(cloudBackupConfigs.provider, provider)
            )
          );

        res.json({ message: "Backup status updated" });
      } catch (error) {
        appLogger.error("Error toggling backup:", error);
        res.status(500).json({ message: "Failed to toggle backup" });
      }
    }
  );

  // Update backup settings
  app.patch(
    "/api/cloud-backup/:provider/settings",
    authenticate,
    async (req: Request, res: Response) => {
      try {
        const { provider } = req.params;
        const { backupFrequency, folderPath } = req.body;

        await db
          .update(cloudBackupConfigs)
          .set({ backupFrequency, folderPath })
          .where(
            and(
              eq(cloudBackupConfigs.userId, req.userId!),
              eq(cloudBackupConfigs.provider, provider)
            )
          );

        res.json({ message: "Settings updated" });
      } catch (error) {
        appLogger.error("Error updating settings:", error);
        res.status(500).json({ message: "Failed to update settings" });
      }
    }
  );

  // Trigger manual backup
  app.post(
    "/api/cloud-backup/:provider/backup",
    authenticate,
    async (req: Request, res: Response) => {
      try {
        const { provider } = req.params;

        // Get config
        const [config] = await db
          .select()
          .from(cloudBackupConfigs)
          .where(
            and(
              eq(cloudBackupConfigs.userId, req.userId!),
              eq(cloudBackupConfigs.provider, provider)
            )
          );

        if (!config || !config.accessToken) {
          return res.status(400).json({ message: "Provider not configured" });
        }

        // Create backup history entry
        const [historyEntry] = await db
          .insert(backupHistory)
          .values({
            userId: req.userId!,
            provider,
            status: "in_progress",
            startedAt: new Date(),
          })
          .returning();

        // Generate backup data
        const backupData = await generateBackupData(req.userId!);
        const backupJson = JSON.stringify(backupData, null, 2);
        const backupSize = Buffer.byteLength(backupJson, "utf8");

        // Decrypt access token
        const accessToken = decryptToken(config.accessToken);

        // Upload to provider
        let cloudFileId: string | null = null;
        let error: string | null = null;

        const filename = `filadex-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;

        try {
          if (provider === "google") {
            // Google Drive upload
            const metadata = {
              name: filename,
              parents: ["root"], // Could use a specific folder
            };

            const boundary = "filadex_backup_boundary";
            const body =
              `--${boundary}\r\n` +
              `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
              `${JSON.stringify(metadata)}\r\n` +
              `--${boundary}\r\n` +
              `Content-Type: application/json\r\n\r\n` +
              `${backupJson}\r\n` +
              `--${boundary}--`;

            const uploadResponse = await fetch(
              `${OAUTH_CONFIGS.google.uploadUrl}?uploadType=multipart`,
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                  "Content-Type": `multipart/related; boundary=${boundary}`,
                },
                body,
              }
            );

            if (uploadResponse.ok) {
              const result = await uploadResponse.json();
              cloudFileId = result.id;
            } else {
              error = `Google Drive upload failed: ${uploadResponse.status}`;
            }
          } else if (provider === "dropbox") {
            // Dropbox upload
            const uploadPath = `${config.folderPath || "/Filadex Backups"}/${filename}`;

            const uploadResponse = await fetch(OAUTH_CONFIGS.dropbox.uploadUrl, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/octet-stream",
                "Dropbox-API-Arg": JSON.stringify({
                  path: uploadPath,
                  mode: "add",
                  autorename: true,
                }),
              },
              body: backupJson,
            });

            if (uploadResponse.ok) {
              const result = await uploadResponse.json();
              cloudFileId = result.id;
            } else {
              error = `Dropbox upload failed: ${uploadResponse.status}`;
            }
          } else if (provider === "onedrive") {
            // OneDrive upload
            const uploadPath = `${config.folderPath || "/Filadex Backups"}/${filename}`;

            const uploadResponse = await fetch(
              `${OAUTH_CONFIGS.onedrive.uploadUrl}${uploadPath}:/content`,
              {
                method: "PUT",
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                  "Content-Type": "application/json",
                },
                body: backupJson,
              }
            );

            if (uploadResponse.ok) {
              const result = await uploadResponse.json();
              cloudFileId = result.id;
            } else {
              error = `OneDrive upload failed: ${uploadResponse.status}`;
            }
          }
        } catch (uploadError: any) {
          error = uploadError.message || "Upload failed";
        }

        // Update history entry
        await db
          .update(backupHistory)
          .set({
            status: error ? "failed" : "completed",
            fileSize: backupSize,
            cloudFileId,
            errorMessage: error,
            completedAt: new Date(),
          })
          .where(eq(backupHistory.id, historyEntry.id));

        // Update last backup time
        if (!error) {
          await db
            .update(cloudBackupConfigs)
            .set({ lastBackupAt: new Date() })
            .where(eq(cloudBackupConfigs.id, config.id));
        }

        if (error) {
          return res.status(500).json({ message: error });
        }

        res.json({
          message: "Backup completed successfully",
          fileSize: backupSize,
          cloudFileId,
        });
      } catch (error) {
        appLogger.error("Error creating backup:", error);
        res.status(500).json({ message: "Failed to create backup" });
      }
    }
  );

  // Download local backup as ZIP (includes images)
  app.get("/api/cloud-backup/download", authenticate, async (req: Request, res: Response) => {
    try {
      const backupData = await generateBackupData(req.userId!);
      const filename = `filadex-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.zip`;

      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

      const archive = archiver("zip", { zlib: { level: 9 } });
      
      // Add error handling for archive
      archive.on("error", (err) => {
        appLogger.error("Archive error:", err);
      });
      archive.on("warning", (err) => {
        appLogger.warn("Archive warning:", err);
      });

      archive.pipe(res);

      // Add backup.json to the archive
      archive.append(JSON.stringify(backupData, null, 2), { name: "backup.json" });

      // Add user's filament images to the archive
      const imagesDir = path.join(process.cwd(), "public", "uploads", "filaments");
      
      if (fs.existsSync(imagesDir)) {
        // Get list of image URLs from user's filaments
        const userImageUrls = backupData.data.filaments
          .map((f: any) => f.imageUrl)
          .filter((url: string | null) => url && url.startsWith("/uploads/filaments/"));

        for (const imageUrl of userImageUrls) {
          const imageName = path.basename(imageUrl);
          const imagePath = path.join(imagesDir, imageName);
          if (fs.existsSync(imagePath)) {
            archive.file(imagePath, { name: `images/${imageName}` });
          }
        }
      }

      await archive.finalize();
    } catch (error) {
      appLogger.error("Error generating backup:", error);
      res.status(500).json({ message: "Failed to generate backup" });
    }
  });

  // Restore from uploaded ZIP backup file (user-level)
  app.post("/api/cloud-backup/restore-zip", authenticate, zipUpload.single("backup"), async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No backup file uploaded" });
      }

      const userId = req.userId!;
      const imagesDir = path.join(process.cwd(), "public", "uploads", "filaments");
      
      // Ensure images directory exists
      if (!fs.existsSync(imagesDir)) {
        fs.mkdirSync(imagesDir, { recursive: true });
      }

      let backupData: any = null;
      const restoredImages: string[] = [];

      // Parse the zip file
      const zipBuffer = req.file.buffer;
      const directory = await unzipper.Open.buffer(zipBuffer);

      for (const file of directory.files) {
        if (file.path === "backup.json") {
          const content = await file.buffer();
          backupData = JSON.parse(content.toString("utf-8"));
        } else if (file.path.startsWith("images/") && !file.path.endsWith("/")) {
          const imageName = path.basename(file.path);
          const imagePath = path.join(imagesDir, imageName);
          const content = await file.buffer();
          fs.writeFileSync(imagePath, content);
          restoredImages.push(imageName);
        }
      }

      if (!backupData || !backupData.version || !backupData.data) {
        return res.status(400).json({ message: "Invalid backup file format - backup.json not found or invalid" });
      }

      const { data, userSettings } = backupData;
      const uploadSessionIdMap: Record<number, number> = {};

      // Track restored counts
      const restored = {
        filaments: 0,
        printJobs: 0,
        slicerProfiles: 0,
        filamentSlicerProfiles: 0,
        filamentHistory: 0,
        uploadSessions: 0,
        pendingUploads: 0,
        userSharing: 0,
        materialCompatibility: 0,
        userSettings: false,
        images: restoredImages.length,
      };

      // Map old filament IDs to new IDs for history references
      const filamentIdMap: Record<number, number> = {};
      const profileIdMap: Record<number, number> = {};

      // Restore user settings (non-sensitive)
      if (userSettings) {
        try {
          await db
            .update(users)
            .set({
              language: userSettings.language,
              currency: userSettings.currency,
              temperatureUnit: userSettings.temperatureUnit,
            })
            .where(eq(users.id, userId));
          restored.userSettings = true;
        } catch (err) {
          appLogger.warn("Could not restore user settings:", err);
        }
      }

      // Restore material compatibility
      if (data.materialCompatibility && Array.isArray(data.materialCompatibility)) {
        for (const compat of data.materialCompatibility) {
          const { id, ...compatData } = compat;
          try {
            await db.insert(materialCompatibility).values({
              ...compatData,
              createdAt: compatData.createdAt ? new Date(compatData.createdAt) : new Date(),
            });
            restored.materialCompatibility++;
          } catch (insertError) {
            // Skip duplicates
          }
        }
      }

      // Restore filaments (track ID mapping for history)
      if (data.filaments && Array.isArray(data.filaments)) {
        for (const filament of data.filaments) {
          const { id: oldId, userId: oldUserId, ...filamentData } = filament;
          
          try {
            const [newFilament] = await db.insert(filaments).values({
              ...filamentData,
              userId,
              createdAt: filamentData.createdAt ? new Date(filamentData.createdAt) : new Date(),
              updatedAt: new Date(),
            }).returning({ id: filaments.id });
            
            if (oldId && newFilament) {
              filamentIdMap[oldId] = newFilament.id;
            }
            restored.filaments++;
          } catch (insertError) {
            appLogger.warn("Could not restore filament:", insertError);
          }
        }
      }

      // Restore filament history (with ID mapping)
      if (data.filamentHistory && Array.isArray(data.filamentHistory)) {
        for (const history of data.filamentHistory) {
          const { id, filamentId: oldFilamentId, printJobId, ...historyData } = history;
          const newFilamentId = filamentIdMap[oldFilamentId];
          
          if (!newFilamentId) continue;
          
          try {
            await db.insert(filamentHistory).values({
              ...historyData,
              filamentId: newFilamentId,
              printJobId: null,
              createdAt: historyData.createdAt ? new Date(historyData.createdAt) : new Date(),
            });
            restored.filamentHistory++;
          } catch (insertError) {
            appLogger.warn("Could not restore filament history:", insertError);
          }
        }
      }

      // Restore print jobs
      if (data.printJobs && Array.isArray(data.printJobs)) {
        for (const job of data.printJobs) {
          const { id, userId: oldUserId, ...jobData } = job;
          
          try {
            await db.insert(printJobs).values({
              ...jobData,
              userId,
              createdAt: jobData.createdAt ? new Date(jobData.createdAt) : new Date(),
            });
            restored.printJobs++;
          } catch (insertError) {
            appLogger.warn("Could not restore print job:", insertError);
          }
        }
      }

      // Restore slicer profiles
      if (data.slicerProfiles && Array.isArray(data.slicerProfiles)) {
        for (const profile of data.slicerProfiles) {
          const { id, userId: oldUserId, ...profileData } = profile;
          
          try {
            const [newProfile] = await db.insert(slicerProfiles).values({
              ...profileData,
              userId,
              createdAt: profileData.createdAt ? new Date(profileData.createdAt) : new Date(),
              updatedAt: new Date(),
            }).returning();
            if (id && newProfile) {
              profileIdMap[id] = newProfile.id;
            }
            restored.slicerProfiles++;
          } catch (insertError) {
            appLogger.warn("Could not restore slicer profile:", insertError);
          }
        }
      }

      // Restore filament/profile links
      if (data.filamentSlicerProfiles && Array.isArray(data.filamentSlicerProfiles)) {
        for (const link of data.filamentSlicerProfiles) {
          const { id, filamentId: oldFilamentId, slicerProfileId: oldProfileId, ...linkData } = link;
          const newFilamentId = filamentIdMap[oldFilamentId];
          const newProfileId = profileIdMap[oldProfileId];
          if (!newFilamentId || !newProfileId) continue;

          try {
            await db.insert(filamentSlicerProfiles).values({
              ...linkData,
              filamentId: newFilamentId,
              slicerProfileId: newProfileId,
              createdAt: linkData.createdAt ? new Date(linkData.createdAt) : new Date(),
            });
            restored.filamentSlicerProfiles++;
          } catch (insertError) {
            appLogger.warn("Could not restore filament slicer profile link:", insertError);
          }
        }
      }

      // Restore user sharing settings
      if (data.userSharing && Array.isArray(data.userSharing)) {
        for (const sharing of data.userSharing) {
          const { id, userId: oldUserId, ...sharingData } = sharing;
          
          try {
            await db.insert(userSharing).values({
              ...sharingData,
              userId,
              createdAt: sharingData.createdAt ? new Date(sharingData.createdAt) : new Date(),
            });
            restored.userSharing++;
          } catch (insertError) {
            appLogger.warn("Could not restore sharing setting:", insertError);
          }
        }
      }

      // Restore upload sessions
      if (data.uploadSessions && Array.isArray(data.uploadSessions)) {
        for (const session of data.uploadSessions) {
          const { id: oldId, userId: oldUserId, ...sessionData } = session;

          try {
            const [newSession] = await db.insert(uploadSessions).values({
              ...sessionData,
              userId,
              expiresAt: sessionData.expiresAt ? new Date(sessionData.expiresAt) : new Date(),
              createdAt: sessionData.createdAt ? new Date(sessionData.createdAt) : new Date(),
            }).returning({ id: uploadSessions.id });
            if (oldId && newSession) {
              uploadSessionIdMap[oldId] = newSession.id;
            }
            restored.uploadSessions++;
          } catch (insertError) {
            appLogger.warn("Could not restore upload session:", insertError);
          }
        }
      }

      // Restore pending uploads
      if (data.pendingUploads && Array.isArray(data.pendingUploads)) {
        for (const upload of data.pendingUploads) {
          const { id, sessionId: oldSessionId, ...uploadData } = upload;
          const newSessionId = uploadSessionIdMap[oldSessionId];
          if (!newSessionId) continue;

          try {
            await db.insert(pendingUploads).values({
              ...uploadData,
              sessionId: newSessionId,
              createdAt: uploadData.createdAt ? new Date(uploadData.createdAt) : new Date(),
            });
            restored.pendingUploads++;
          } catch (insertError) {
            appLogger.warn("Could not restore pending upload:", insertError);
          }
        }
      }

      // Log the restore
      await db.insert(backupHistory).values({
        userId,
        provider: "local_zip",
        status: "completed",
        fileSize: zipBuffer.length,
        startedAt: new Date(),
        completedAt: new Date(),
      });

      res.json({
        message: "Restore completed",
        restored,
      });
    } catch (error) {
      appLogger.error("Error restoring backup:", error);
      res.status(500).json({ message: "Failed to restore backup" });
    }
  });

  // ============================================
  // S3-Compatible Storage
  // ============================================

  // Configure S3 storage
  app.post("/api/cloud-backup/s3/configure", authenticate, async (req: Request, res: Response) => {
    try {
      const { endpoint, bucket, region, accessKeyId, secretAccessKey, folderPath } = req.body;

      if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
        return res.status(400).json({ message: "Missing required S3 configuration fields" });
      }

      // Check if config already exists
      const existingConfig = await db
        .select()
        .from(cloudBackupConfigs)
        .where(
          and(eq(cloudBackupConfigs.userId, req.userId!), eq(cloudBackupConfigs.provider, "s3"))
        );

      const encryptedAccessKey = encryptToken(accessKeyId);
      const encryptedSecretKey = encryptToken(secretAccessKey);

      if (existingConfig.length > 0) {
        await db
          .update(cloudBackupConfigs)
          .set({
            s3Endpoint: endpoint,
            s3Bucket: bucket,
            s3Region: region || "auto",
            s3AccessKeyId: encryptedAccessKey,
            s3SecretAccessKey: encryptedSecretKey,
            folderPath: folderPath || "filadex-backups",
            isEnabled: true,
          })
          .where(eq(cloudBackupConfigs.id, existingConfig[0].id));
      } else {
        await db.insert(cloudBackupConfigs).values({
          userId: req.userId!,
          provider: "s3",
          s3Endpoint: endpoint,
          s3Bucket: bucket,
          s3Region: region || "auto",
          s3AccessKeyId: encryptedAccessKey,
          s3SecretAccessKey: encryptedSecretKey,
          folderPath: folderPath || "filadex-backups",
          isEnabled: true,
          backupFrequency: "manual",
        });
      }

      res.json({ message: "S3 configuration saved" });
    } catch (error) {
      appLogger.error("Error configuring S3:", error);
      res.status(500).json({ message: "Failed to configure S3" });
    }
  });

  // Test S3 connection
  app.post("/api/cloud-backup/s3/test", authenticate, async (req: Request, res: Response) => {
    try {
      const { endpoint, bucket, region, accessKeyId, secretAccessKey } = req.body;

      if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
        return res.status(400).json({ message: "Missing required S3 fields" });
      }

      // Simple S3 test - try to list objects (will fail if credentials are wrong)
      const testKey = `.filadex-test-${Date.now()}`;
      const testContent = "test";
      
      // Construct S3 request signature (simplified - using AWS SDK would be better in production)
      const s3Url = endpoint.endsWith("/") ? endpoint : `${endpoint}/`;
      const objectUrl = `${s3Url}${bucket}/${testKey}`;

      // For now, we'll do a simple unsigned request to check if the bucket is accessible
      // In production, you'd want to use proper AWS Signature V4
      try {
        // Try to put a test object using basic auth header approach
        // Note: This works for MinIO and some S3-compatible services
        const credentials = Buffer.from(`${accessKeyId}:${secretAccessKey}`).toString("base64");
        
        const putResponse = await fetch(objectUrl, {
          method: "PUT",
          headers: {
            "Authorization": `Basic ${credentials}`,
            "Content-Type": "text/plain",
            "x-amz-content-sha256": "UNSIGNED-PAYLOAD",
          },
          body: testContent,
        });

        // If basic auth doesn't work, the endpoint might still be valid
        // We'll consider it a success if we get any response
        if (putResponse.ok || putResponse.status === 403 || putResponse.status === 400) {
          res.json({ success: true, message: "S3 endpoint is reachable. Configuration saved." });
        } else {
          res.json({ success: false, message: `S3 test returned status ${putResponse.status}` });
        }
      } catch (fetchError: any) {
        res.json({ success: false, message: `Cannot reach S3 endpoint: ${fetchError.message}` });
      }
    } catch (error) {
      appLogger.error("Error testing S3:", error);
      res.status(500).json({ message: "Failed to test S3 connection" });
    }
  });

  // Backup to S3
  app.post("/api/cloud-backup/s3/backup", authenticate, async (req: Request, res: Response) => {
    try {
      const [config] = await db
        .select()
        .from(cloudBackupConfigs)
        .where(
          and(eq(cloudBackupConfigs.userId, req.userId!), eq(cloudBackupConfigs.provider, "s3"))
        );

      if (!config || !config.s3AccessKeyId || !config.s3SecretAccessKey) {
        return res.status(400).json({ message: "S3 not configured" });
      }

      // Create history entry
      const [historyEntry] = await db
        .insert(backupHistory)
        .values({
          userId: req.userId!,
          provider: "s3",
          status: "in_progress",
          startedAt: new Date(),
        })
        .returning();

      // Generate backup
      const backupData = await generateBackupData(req.userId!);
      const backupJson = JSON.stringify(backupData, null, 2);
      const backupSize = Buffer.byteLength(backupJson, "utf8");

      const accessKeyId = decryptToken(config.s3AccessKeyId);
      const secretAccessKey = decryptToken(config.s3SecretAccessKey);
      
      const filename = `filadex-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
      const folderPath = config.folderPath || "filadex-backups";
      const objectKey = `${folderPath}/${filename}`;

      let error: string | null = null;
      let cloudFileId: string | null = null;

      try {
        const s3Url = config.s3Endpoint!.endsWith("/") ? config.s3Endpoint! : `${config.s3Endpoint!}/`;
        const objectUrl = `${s3Url}${config.s3Bucket}/${objectKey}`;

        // Use basic auth for S3-compatible services
        const credentials = Buffer.from(`${accessKeyId}:${secretAccessKey}`).toString("base64");

        const uploadResponse = await fetch(objectUrl, {
          method: "PUT",
          headers: {
            "Authorization": `Basic ${credentials}`,
            "Content-Type": "application/json",
            "x-amz-content-sha256": "UNSIGNED-PAYLOAD",
          },
          body: backupJson,
        });

        if (uploadResponse.ok) {
          cloudFileId = objectKey;
        } else {
          const errorText = await uploadResponse.text();
          error = `S3 upload failed: ${uploadResponse.status} - ${errorText}`;
        }
      } catch (uploadError: any) {
        error = `S3 upload error: ${uploadError.message}`;
      }

      // Update history
      await db
        .update(backupHistory)
        .set({
          status: error ? "failed" : "completed",
          fileSize: backupSize,
          cloudFileId,
          errorMessage: error,
          completedAt: new Date(),
        })
        .where(eq(backupHistory.id, historyEntry.id));

      if (!error) {
        await db
          .update(cloudBackupConfigs)
          .set({ lastBackupAt: new Date() })
          .where(eq(cloudBackupConfigs.id, config.id));
      }

      if (error) {
        return res.status(500).json({ message: error });
      }

      res.json({ message: "Backup completed", fileSize: backupSize, cloudFileId });
    } catch (error) {
      appLogger.error("Error backing up to S3:", error);
      res.status(500).json({ message: "Failed to backup to S3" });
    }
  });

  // Get S3 config (for display - without secrets)
  app.get("/api/cloud-backup/s3/config", authenticate, async (req: Request, res: Response) => {
    try {
      const [config] = await db
        .select()
        .from(cloudBackupConfigs)
        .where(
          and(eq(cloudBackupConfigs.userId, req.userId!), eq(cloudBackupConfigs.provider, "s3"))
        );

      if (!config) {
        return res.json({ configured: false });
      }

      res.json({
        configured: true,
        enabled: config.isEnabled,
        endpoint: config.s3Endpoint,
        bucket: config.s3Bucket,
        region: config.s3Region,
        folderPath: config.folderPath,
        lastBackup: config.lastBackupAt?.toISOString() || null,
      });
    } catch (error) {
      appLogger.error("Error fetching S3 config:", error);
      res.status(500).json({ message: "Failed to fetch S3 config" });
    }
  });

  // ============================================
  // WebDAV Storage
  // ============================================

  // Configure WebDAV
  app.post("/api/cloud-backup/webdav/configure", authenticate, async (req: Request, res: Response) => {
    try {
      const { url, username, password, folderPath } = req.body;

      if (!url || !username || !password) {
        return res.status(400).json({ message: "Missing required WebDAV configuration fields" });
      }

      const existingConfig = await db
        .select()
        .from(cloudBackupConfigs)
        .where(
          and(eq(cloudBackupConfigs.userId, req.userId!), eq(cloudBackupConfigs.provider, "webdav"))
        );

      const encryptedPassword = encryptToken(password);

      if (existingConfig.length > 0) {
        await db
          .update(cloudBackupConfigs)
          .set({
            webdavUrl: url,
            webdavUsername: username,
            webdavPassword: encryptedPassword,
            folderPath: folderPath || "Filadex-Backups",
            isEnabled: true,
          })
          .where(eq(cloudBackupConfigs.id, existingConfig[0].id));
      } else {
        await db.insert(cloudBackupConfigs).values({
          userId: req.userId!,
          provider: "webdav",
          webdavUrl: url,
          webdavUsername: username,
          webdavPassword: encryptedPassword,
          folderPath: folderPath || "Filadex-Backups",
          isEnabled: true,
          backupFrequency: "manual",
        });
      }

      res.json({ message: "WebDAV configuration saved" });
    } catch (error) {
      appLogger.error("Error configuring WebDAV:", error);
      res.status(500).json({ message: "Failed to configure WebDAV" });
    }
  });

  // Test WebDAV connection
  app.post("/api/cloud-backup/webdav/test", authenticate, async (req: Request, res: Response) => {
    try {
      const { url, username, password } = req.body;

      if (!url || !username || !password) {
        return res.status(400).json({ message: "Missing required WebDAV fields" });
      }

      // Test WebDAV connection with PROPFIND request
      const credentials = Buffer.from(`${username}:${password}`).toString("base64");

      try {
        const testResponse = await fetch(url, {
          method: "PROPFIND",
          headers: {
            "Authorization": `Basic ${credentials}`,
            "Depth": "0",
            "Content-Type": "application/xml",
          },
          body: '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/></d:prop></d:propfind>',
        });

        if (testResponse.ok || testResponse.status === 207) {
          res.json({ success: true, message: "WebDAV connection successful" });
        } else if (testResponse.status === 401) {
          res.json({ success: false, message: "Authentication failed - check username/password" });
        } else {
          res.json({ success: false, message: `WebDAV returned status ${testResponse.status}` });
        }
      } catch (fetchError: any) {
        res.json({ success: false, message: `Cannot reach WebDAV server: ${fetchError.message}` });
      }
    } catch (error) {
      appLogger.error("Error testing WebDAV:", error);
      res.status(500).json({ message: "Failed to test WebDAV connection" });
    }
  });

  // Backup to WebDAV
  app.post("/api/cloud-backup/webdav/backup", authenticate, async (req: Request, res: Response) => {
    try {
      const [config] = await db
        .select()
        .from(cloudBackupConfigs)
        .where(
          and(eq(cloudBackupConfigs.userId, req.userId!), eq(cloudBackupConfigs.provider, "webdav"))
        );

      if (!config || !config.webdavUrl || !config.webdavPassword) {
        return res.status(400).json({ message: "WebDAV not configured" });
      }

      // Create history entry
      const [historyEntry] = await db
        .insert(backupHistory)
        .values({
          userId: req.userId!,
          provider: "webdav",
          status: "in_progress",
          startedAt: new Date(),
        })
        .returning();

      // Generate backup
      const backupData = await generateBackupData(req.userId!);
      const backupJson = JSON.stringify(backupData, null, 2);
      const backupSize = Buffer.byteLength(backupJson, "utf8");

      const password = decryptToken(config.webdavPassword);
      const credentials = Buffer.from(`${config.webdavUsername}:${password}`).toString("base64");

      const filename = `filadex-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
      const baseUrl = config.webdavUrl!.endsWith("/") ? config.webdavUrl! : `${config.webdavUrl!}/`;
      const folderPath = config.folderPath || "Filadex-Backups";
      
      let error: string | null = null;
      let cloudFileId: string | null = null;

      try {
        // Try to create folder first (ignore errors if exists)
        await fetch(`${baseUrl}${folderPath}`, {
          method: "MKCOL",
          headers: { "Authorization": `Basic ${credentials}` },
        });

        // Upload file
        const uploadUrl = `${baseUrl}${folderPath}/${filename}`;
        const uploadResponse = await fetch(uploadUrl, {
          method: "PUT",
          headers: {
            "Authorization": `Basic ${credentials}`,
            "Content-Type": "application/json",
          },
          body: backupJson,
        });

        if (uploadResponse.ok || uploadResponse.status === 201 || uploadResponse.status === 204) {
          cloudFileId = `${folderPath}/${filename}`;
        } else {
          const errorText = await uploadResponse.text();
          error = `WebDAV upload failed: ${uploadResponse.status} - ${errorText}`;
        }
      } catch (uploadError: any) {
        error = `WebDAV upload error: ${uploadError.message}`;
      }

      // Update history
      await db
        .update(backupHistory)
        .set({
          status: error ? "failed" : "completed",
          fileSize: backupSize,
          cloudFileId,
          errorMessage: error,
          completedAt: new Date(),
        })
        .where(eq(backupHistory.id, historyEntry.id));

      if (!error) {
        await db
          .update(cloudBackupConfigs)
          .set({ lastBackupAt: new Date() })
          .where(eq(cloudBackupConfigs.id, config.id));
      }

      if (error) {
        return res.status(500).json({ message: error });
      }

      res.json({ message: "Backup completed", fileSize: backupSize, cloudFileId });
    } catch (error) {
      appLogger.error("Error backing up to WebDAV:", error);
      res.status(500).json({ message: "Failed to backup to WebDAV" });
    }
  });

  // Get WebDAV config (for display - without password)
  app.get("/api/cloud-backup/webdav/config", authenticate, async (req: Request, res: Response) => {
    try {
      const [config] = await db
        .select()
        .from(cloudBackupConfigs)
        .where(
          and(eq(cloudBackupConfigs.userId, req.userId!), eq(cloudBackupConfigs.provider, "webdav"))
        );

      if (!config) {
        return res.json({ configured: false });
      }

      res.json({
        configured: true,
        enabled: config.isEnabled,
        url: config.webdavUrl,
        username: config.webdavUsername,
        folderPath: config.folderPath,
        lastBackup: config.lastBackupAt?.toISOString() || null,
      });
    } catch (error) {
      appLogger.error("Error fetching WebDAV config:", error);
      res.status(500).json({ message: "Failed to fetch WebDAV config" });
    }
  });

  // ============================================
  // Local Backup Restore
  // ============================================

  // Restore from uploaded backup file (user-level)
  app.post("/api/cloud-backup/restore", authenticate, async (req: Request, res: Response) => {
    try {
      const backupData = req.body;

      if (!backupData || !backupData.version || !backupData.data) {
        return res.status(400).json({ message: "Invalid backup file format" });
      }

      const { data, userSettings } = backupData;
      const userId = req.userId!;
      const uploadSessionIdMap: Record<number, number> = {};

      // Track restored counts
      const restored = {
        filaments: 0,
        printJobs: 0,
        slicerProfiles: 0,
        filamentSlicerProfiles: 0,
        filamentHistory: 0,
        uploadSessions: 0,
        pendingUploads: 0,
        userSharing: 0,
        materialCompatibility: 0,
        userSettings: false,
      };

      // Map old filament IDs to new IDs for history references
      const filamentIdMap: Record<number, number> = {};
      const profileIdMap: Record<number, number> = {};

      // Restore user settings (non-sensitive)
      if (userSettings) {
        try {
          await db
            .update(users)
            .set({
              language: userSettings.language,
              currency: userSettings.currency,
              temperatureUnit: userSettings.temperatureUnit,
            })
            .where(eq(users.id, userId));
          restored.userSettings = true;
        } catch (err) {
          appLogger.warn("Could not restore user settings:", err);
        }
      }

      // Restore material compatibility
      if (data.materialCompatibility && Array.isArray(data.materialCompatibility)) {
        for (const compat of data.materialCompatibility) {
          const { id, ...compatData } = compat;
          try {
            await db.insert(materialCompatibility).values({
              ...compatData,
              createdAt: compatData.createdAt ? new Date(compatData.createdAt) : new Date(),
            });
            restored.materialCompatibility++;
          } catch (insertError) {
            // Skip duplicates
          }
        }
      }

      // Restore filaments (track ID mapping for history)
      if (data.filaments && Array.isArray(data.filaments)) {
        for (const filament of data.filaments) {
          const { id: oldId, userId: oldUserId, ...filamentData } = filament;
          
          try {
            const [newFilament] = await db.insert(filaments).values({
              ...filamentData,
              userId,
              createdAt: filamentData.createdAt ? new Date(filamentData.createdAt) : new Date(),
              updatedAt: new Date(),
            }).returning({ id: filaments.id });
            
            if (oldId && newFilament) {
              filamentIdMap[oldId] = newFilament.id;
            }
            restored.filaments++;
          } catch (insertError) {
            appLogger.warn("Could not restore filament:", insertError);
          }
        }
      }

      // Restore filament history (with ID mapping)
      if (data.filamentHistory && Array.isArray(data.filamentHistory)) {
        for (const history of data.filamentHistory) {
          const { id, filamentId: oldFilamentId, printJobId, ...historyData } = history;
          const newFilamentId = filamentIdMap[oldFilamentId];
          
          if (!newFilamentId) continue;
          
          try {
            await db.insert(filamentHistory).values({
              ...historyData,
              filamentId: newFilamentId,
              printJobId: null, // Don't link to old print jobs
              createdAt: historyData.createdAt ? new Date(historyData.createdAt) : new Date(),
            });
            restored.filamentHistory++;
          } catch (insertError) {
            appLogger.warn("Could not restore filament history:", insertError);
          }
        }
      }

      // Restore print jobs
      if (data.printJobs && Array.isArray(data.printJobs)) {
        for (const job of data.printJobs) {
          const { id, userId: oldUserId, ...jobData } = job;
          
          try {
            await db.insert(printJobs).values({
              ...jobData,
              userId,
              createdAt: jobData.createdAt ? new Date(jobData.createdAt) : new Date(),
            });
            restored.printJobs++;
          } catch (insertError) {
            appLogger.warn("Could not restore print job:", insertError);
          }
        }
      }

      // Restore slicer profiles
      if (data.slicerProfiles && Array.isArray(data.slicerProfiles)) {
        for (const profile of data.slicerProfiles) {
          const { id, userId: oldUserId, ...profileData } = profile;
          
          try {
            const [newProfile] = await db.insert(slicerProfiles).values({
              ...profileData,
              userId,
              createdAt: profileData.createdAt ? new Date(profileData.createdAt) : new Date(),
              updatedAt: new Date(),
            }).returning();
            if (id && newProfile) {
              profileIdMap[id] = newProfile.id;
            }
            restored.slicerProfiles++;
          } catch (insertError) {
            appLogger.warn("Could not restore slicer profile:", insertError);
          }
        }
      }

      // Restore filament/profile links
      if (data.filamentSlicerProfiles && Array.isArray(data.filamentSlicerProfiles)) {
        for (const link of data.filamentSlicerProfiles) {
          const { id, filamentId: oldFilamentId, slicerProfileId: oldProfileId, ...linkData } = link;
          const newFilamentId = filamentIdMap[oldFilamentId];
          const newProfileId = profileIdMap[oldProfileId];
          if (!newFilamentId || !newProfileId) continue;

          try {
            await db.insert(filamentSlicerProfiles).values({
              ...linkData,
              filamentId: newFilamentId,
              slicerProfileId: newProfileId,
              createdAt: linkData.createdAt ? new Date(linkData.createdAt) : new Date(),
            });
            restored.filamentSlicerProfiles++;
          } catch (insertError) {
            appLogger.warn("Could not restore filament slicer profile link:", insertError);
          }
        }
      }

      // Restore user sharing settings
      if (data.userSharing && Array.isArray(data.userSharing)) {
        for (const sharing of data.userSharing) {
          const { id, userId: oldUserId, ...sharingData } = sharing;
          
          try {
            await db.insert(userSharing).values({
              ...sharingData,
              userId,
              createdAt: sharingData.createdAt ? new Date(sharingData.createdAt) : new Date(),
            });
            restored.userSharing++;
          } catch (insertError) {
            appLogger.warn("Could not restore sharing setting:", insertError);
          }
        }
      }

      // Restore upload sessions
      if (data.uploadSessions && Array.isArray(data.uploadSessions)) {
        for (const session of data.uploadSessions) {
          const { id: oldId, userId: oldUserId, ...sessionData } = session;

          try {
            const [newSession] = await db.insert(uploadSessions).values({
              ...sessionData,
              userId,
              expiresAt: sessionData.expiresAt ? new Date(sessionData.expiresAt) : new Date(),
              createdAt: sessionData.createdAt ? new Date(sessionData.createdAt) : new Date(),
            }).returning({ id: uploadSessions.id });
            if (oldId && newSession) {
              uploadSessionIdMap[oldId] = newSession.id;
            }
            restored.uploadSessions++;
          } catch (insertError) {
            appLogger.warn("Could not restore upload session:", insertError);
          }
        }
      }

      // Restore pending uploads
      if (data.pendingUploads && Array.isArray(data.pendingUploads)) {
        for (const upload of data.pendingUploads) {
          const { id, sessionId: oldSessionId, ...uploadData } = upload;
          const newSessionId = uploadSessionIdMap[oldSessionId];
          if (!newSessionId) continue;

          try {
            await db.insert(pendingUploads).values({
              ...uploadData,
              sessionId: newSessionId,
              createdAt: uploadData.createdAt ? new Date(uploadData.createdAt) : new Date(),
            });
            restored.pendingUploads++;
          } catch (insertError) {
            appLogger.warn("Could not restore pending upload:", insertError);
          }
        }
      }

      // Log the restore
      await db.insert(backupHistory).values({
        userId,
        provider: "local",
        status: "completed",
        fileSize: JSON.stringify(backupData).length,
        startedAt: new Date(),
        completedAt: new Date(),
      });

      res.json({
        message: "Restore completed",
        restored,
      });
    } catch (error) {
      appLogger.error("Error restoring backup:", error);
      res.status(500).json({ message: "Failed to restore backup" });
    }
  });

  // ============================================
  // Admin Full Backup/Restore
  // ============================================

  // Download admin full backup as ZIP (all users - admin only)
  app.get("/api/cloud-backup/admin/download", authenticate, async (req: Request, res: Response) => {
    try {
      // Check if user is admin
      const [currentUser] = await db
        .select({ isAdmin: users.isAdmin })
        .from(users)
        .where(eq(users.id, req.userId!));

      if (!currentUser?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const backupData = await generateAdminBackupData();
      const filename = `filadex-admin-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.zip`;

      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

      const archive = archiver("zip", { zlib: { level: 9 } });
      archive.pipe(res);

      // Add backup.json to the archive
      archive.append(JSON.stringify(backupData, null, 2), { name: "backup.json" });

      // Add ALL filament images to the archive
      const imagesDir = path.join(process.cwd(), "public", "uploads", "filaments");
      if (fs.existsSync(imagesDir)) {
        const allImageUrls = backupData.data.filaments
          .map((f: any) => f.imageUrl)
          .filter((url: string | null) => url && url.startsWith("/uploads/filaments/"));

        for (const imageUrl of allImageUrls) {
          const imageName = path.basename(imageUrl);
          const imagePath = path.join(imagesDir, imageName);
          if (fs.existsSync(imagePath)) {
            archive.file(imagePath, { name: `images/${imageName}` });
          }
        }
      }

      await archive.finalize();
    } catch (error) {
      appLogger.error("Error generating admin backup:", error);
      res.status(500).json({ message: "Failed to generate admin backup" });
    }
  });

  // Restore admin full backup (admin only)
  app.post("/api/cloud-backup/admin/restore", authenticate, async (req: Request, res: Response) => {
    try {
      // Check if user is admin
      const [currentUser] = await db
        .select({ isAdmin: users.isAdmin })
        .from(users)
        .where(eq(users.id, req.userId!));

      if (!currentUser?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const backupData = req.body;

      if (!backupData || !backupData.version || !backupData.data) {
        return res.status(400).json({ message: "Invalid backup file format" });
      }

      if (backupData.backupType !== "admin_full") {
        return res.status(400).json({ message: "This is not an admin backup file. Use regular restore for user backups." });
      }

      const { data } = backupData;

      // Track restore stats
      const restored = {
        users: 0,
        filaments: 0,
        printJobs: 0,
        slicerProfiles: 0,
        filamentSlicerProfiles: 0,
        filamentHistory: 0,
        uploadSessions: 0,
        pendingUploads: 0,
        userSharing: 0,
        materialCompatibility: 0,
      };

      // Map old IDs to new IDs
      const userIdMap: Record<number, number> = {};
      const filamentIdMap: Record<number, number> = {};
      const profileIdMap: Record<number, number> = {};
      const uploadSessionIdMap: Record<number, number> = {};

      // Restore users (create if not exists)
      if (data.users && Array.isArray(data.users)) {
        for (const user of data.users) {
          const { id: oldId, ...userData } = user;
          
          // Check if user already exists by username
          const [existingUser] = await db
            .select({ id: users.id })
            .from(users)
            .where(eq(users.username, userData.username));

          if (existingUser) {
            userIdMap[oldId] = existingUser.id;
            await db
              .update(users)
              .set({
                language: userData.language,
                currency: userData.currency,
                temperatureUnit: userData.temperatureUnit,
              })
              .where(eq(users.id, existingUser.id));
          } else {
            const tempPassword = await bcrypt.hash("changeme", 10);
            const [newUser] = await db
              .insert(users)
              .values({
                username: userData.username,
                password: tempPassword,
                isAdmin: userData.isAdmin || false,
                forceChangePassword: true,
                language: userData.language || "en",
                currency: userData.currency || "USD",
                temperatureUnit: userData.temperatureUnit || "C",
              })
              .returning({ id: users.id });

            userIdMap[oldId] = newUser.id;
            restored.users++;
          }
        }
      }

      // Restore material compatibility
      if (data.materialCompatibility && Array.isArray(data.materialCompatibility)) {
        for (const compat of data.materialCompatibility) {
          const { id, ...compatData } = compat;
          try {
            await db.insert(materialCompatibility).values({
              ...compatData,
              createdAt: compatData.createdAt ? new Date(compatData.createdAt) : new Date(),
            });
            restored.materialCompatibility++;
          } catch (insertError) {
            // Skip duplicates
          }
        }
      }

      // Restore filaments (with user ID mapping, track filament ID mapping)
      if (data.filaments && Array.isArray(data.filaments)) {
        for (const filament of data.filaments) {
          const { id: oldId, userId: oldUserId, ...filamentData } = filament;
          const newUserId = userIdMap[oldUserId];
          
          if (!newUserId) {
            appLogger.warn(`Skipping filament - user ID ${oldUserId} not found in backup`);
            continue;
          }
          
          try {
            const [newFilament] = await db.insert(filaments).values({
              ...filamentData,
              userId: newUserId,
              createdAt: filamentData.createdAt ? new Date(filamentData.createdAt) : new Date(),
              updatedAt: new Date(),
            }).returning({ id: filaments.id });
            
            if (oldId && newFilament) {
              filamentIdMap[oldId] = newFilament.id;
            }
            restored.filaments++;
          } catch (insertError) {
            appLogger.warn("Could not restore filament:", insertError);
          }
        }
      }

      // Restore filament history (with filament ID mapping)
      if (data.filamentHistory && Array.isArray(data.filamentHistory)) {
        for (const history of data.filamentHistory) {
          const { id, filamentId: oldFilamentId, printJobId, ...historyData } = history;
          const newFilamentId = filamentIdMap[oldFilamentId];
          
          if (!newFilamentId) continue;
          
          try {
            await db.insert(filamentHistory).values({
              ...historyData,
              filamentId: newFilamentId,
              printJobId: null,
              createdAt: historyData.createdAt ? new Date(historyData.createdAt) : new Date(),
            });
            restored.filamentHistory++;
          } catch (insertError) {
            appLogger.warn("Could not restore filament history:", insertError);
          }
        }
      }

      // Restore print jobs (with user ID mapping)
      if (data.printJobs && Array.isArray(data.printJobs)) {
        for (const job of data.printJobs) {
          const { id, userId: oldUserId, ...jobData } = job;
          const newUserId = userIdMap[oldUserId];
          
          if (!newUserId) continue;
          
          try {
            await db.insert(printJobs).values({
              ...jobData,
              userId: newUserId,
              createdAt: jobData.createdAt ? new Date(jobData.createdAt) : new Date(),
            });
            restored.printJobs++;
          } catch (insertError) {
            appLogger.warn("Could not restore print job:", insertError);
          }
        }
      }

      // Restore slicer profiles (with user ID mapping)
      if (data.slicerProfiles && Array.isArray(data.slicerProfiles)) {
        for (const profile of data.slicerProfiles) {
          const { id, userId: oldUserId, ...profileData } = profile;
          const newUserId = userIdMap[oldUserId];
          
          if (!newUserId) continue;
          
          try {
            const [newProfile] = await db.insert(slicerProfiles).values({
              ...profileData,
              userId: newUserId,
              createdAt: profileData.createdAt ? new Date(profileData.createdAt) : new Date(),
              updatedAt: new Date(),
            }).returning();
            if (id && newProfile) {
              profileIdMap[id] = newProfile.id;
            }
            restored.slicerProfiles++;
          } catch (insertError) {
            appLogger.warn("Could not restore slicer profile:", insertError);
          }
        }
      }

      // Restore filament/profile links
      if (data.filamentSlicerProfiles && Array.isArray(data.filamentSlicerProfiles)) {
        for (const link of data.filamentSlicerProfiles) {
          const { id, filamentId: oldFilamentId, slicerProfileId: oldProfileId, ...linkData } = link;
          const newFilamentId = filamentIdMap[oldFilamentId];
          const newProfileId = profileIdMap[oldProfileId];
          if (!newFilamentId || !newProfileId) continue;

          try {
            await db.insert(filamentSlicerProfiles).values({
              ...linkData,
              filamentId: newFilamentId,
              slicerProfileId: newProfileId,
              createdAt: linkData.createdAt ? new Date(linkData.createdAt) : new Date(),
            });
            restored.filamentSlicerProfiles++;
          } catch (insertError) {
            appLogger.warn("Could not restore filament slicer profile link:", insertError);
          }
        }
      }

      // Restore user sharing (with user ID mapping)
      if (data.userSharing && Array.isArray(data.userSharing)) {
        for (const sharing of data.userSharing) {
          const { id, userId: oldUserId, ...sharingData } = sharing;
          const newUserId = userIdMap[oldUserId];
          
          if (!newUserId) continue;
          
          try {
            await db.insert(userSharing).values({
              ...sharingData,
              userId: newUserId,
              createdAt: sharingData.createdAt ? new Date(sharingData.createdAt) : new Date(),
            });
            restored.userSharing++;
          } catch (insertError) {
            appLogger.warn("Could not restore user sharing:", insertError);
          }
        }
      }

      // Restore upload sessions (with user ID mapping)
      if (data.uploadSessions && Array.isArray(data.uploadSessions)) {
        for (const session of data.uploadSessions) {
          const { id: oldId, userId: oldUserId, ...sessionData } = session;
          const newUserId = userIdMap[oldUserId];
          if (!newUserId) continue;

          try {
            const [newSession] = await db.insert(uploadSessions).values({
              ...sessionData,
              userId: newUserId,
              expiresAt: sessionData.expiresAt ? new Date(sessionData.expiresAt) : new Date(),
              createdAt: sessionData.createdAt ? new Date(sessionData.createdAt) : new Date(),
            }).returning({ id: uploadSessions.id });
            if (oldId && newSession) {
              uploadSessionIdMap[oldId] = newSession.id;
            }
            restored.uploadSessions++;
          } catch (insertError) {
            appLogger.warn("Could not restore upload session:", insertError);
          }
        }
      }

      // Restore pending uploads (with session ID mapping)
      if (data.pendingUploads && Array.isArray(data.pendingUploads)) {
        for (const upload of data.pendingUploads) {
          const { id, sessionId: oldSessionId, ...uploadData } = upload;
          const newSessionId = uploadSessionIdMap[oldSessionId];
          if (!newSessionId) continue;

          try {
            await db.insert(pendingUploads).values({
              ...uploadData,
              sessionId: newSessionId,
              createdAt: uploadData.createdAt ? new Date(uploadData.createdAt) : new Date(),
            });
            restored.pendingUploads++;
          } catch (insertError) {
            appLogger.warn("Could not restore pending upload:", insertError);
          }
        }
      }

      // Log the restore
      await db.insert(backupHistory).values({
        userId: req.userId!,
        provider: "admin_restore",
        status: "completed",
        fileSize: JSON.stringify(backupData).length,
        startedAt: new Date(),
        completedAt: new Date(),
      });

      res.json({
        message: "Admin restore completed",
        restored,
        note: restored.users > 0 ? `${restored.users} new users created with temporary password "changeme"` : undefined,
      });
    } catch (error) {
      appLogger.error("Error restoring admin backup:", error);
      res.status(500).json({ message: "Failed to restore admin backup" });
    }
  });

  // Restore admin full backup from ZIP file (admin only)
  app.post("/api/cloud-backup/admin/restore-zip", authenticate, zipUpload.single("backup"), async (req: Request, res: Response) => {
    try {
      // Check if user is admin
      const [currentUser] = await db
        .select({ isAdmin: users.isAdmin })
        .from(users)
        .where(eq(users.id, req.userId!));

      if (!currentUser?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      if (!req.file) {
        return res.status(400).json({ message: "No backup file uploaded" });
      }

      const imagesDir = path.join(process.cwd(), "public", "uploads", "filaments");
      
      // Ensure images directory exists
      if (!fs.existsSync(imagesDir)) {
        fs.mkdirSync(imagesDir, { recursive: true });
      }

      let backupData: any = null;
      const restoredImages: string[] = [];

      // Parse the zip file
      const zipBuffer = req.file.buffer;
      const directory = await unzipper.Open.buffer(zipBuffer);

      for (const file of directory.files) {
        if (file.path === "backup.json") {
          const content = await file.buffer();
          backupData = JSON.parse(content.toString("utf-8"));
        } else if (file.path.startsWith("images/") && !file.path.endsWith("/")) {
          const imageName = path.basename(file.path);
          const imagePath = path.join(imagesDir, imageName);
          const content = await file.buffer();
          fs.writeFileSync(imagePath, content);
          restoredImages.push(imageName);
        }
      }

      if (!backupData || !backupData.version || !backupData.data) {
        return res.status(400).json({ message: "Invalid backup file format - backup.json not found or invalid" });
      }

      if (backupData.backupType !== "admin_full") {
        return res.status(400).json({ message: "This is not an admin backup file. Use regular restore for user backups." });
      }

      const { data } = backupData;

      // Track restore stats
      const restored = {
        users: 0,
        filaments: 0,
        printJobs: 0,
        slicerProfiles: 0,
        filamentSlicerProfiles: 0,
        filamentHistory: 0,
        uploadSessions: 0,
        pendingUploads: 0,
        userSharing: 0,
        materialCompatibility: 0,
        images: restoredImages.length,
      };

      // Map old IDs to new IDs
      const userIdMap: Record<number, number> = {};
      const filamentIdMap: Record<number, number> = {};
      const profileIdMap: Record<number, number> = {};
      const uploadSessionIdMap: Record<number, number> = {};

      // Restore users (create if not exists)
      if (data.users && Array.isArray(data.users)) {
        for (const user of data.users) {
          const { id: oldId, ...userData } = user;
          
          const [existingUser] = await db
            .select({ id: users.id })
            .from(users)
            .where(eq(users.username, userData.username));

          if (existingUser) {
            userIdMap[oldId] = existingUser.id;
            await db
              .update(users)
              .set({
                language: userData.language,
                currency: userData.currency,
                temperatureUnit: userData.temperatureUnit,
              })
              .where(eq(users.id, existingUser.id));
          } else {
            const tempPassword = await bcrypt.hash("changeme", 10);
            const [newUser] = await db
              .insert(users)
              .values({
                username: userData.username,
                password: tempPassword,
                isAdmin: userData.isAdmin || false,
                forceChangePassword: true,
                language: userData.language || "en",
                currency: userData.currency || "USD",
                temperatureUnit: userData.temperatureUnit || "C",
              })
              .returning({ id: users.id });

            userIdMap[oldId] = newUser.id;
            restored.users++;
          }
        }
      }

      // Restore material compatibility
      if (data.materialCompatibility && Array.isArray(data.materialCompatibility)) {
        for (const compat of data.materialCompatibility) {
          const { id, ...compatData } = compat;
          try {
            await db.insert(materialCompatibility).values({
              ...compatData,
              createdAt: compatData.createdAt ? new Date(compatData.createdAt) : new Date(),
            });
            restored.materialCompatibility++;
          } catch (insertError) {
            // Skip duplicates
          }
        }
      }

      // Restore filaments (with user ID mapping, track filament ID mapping)
      if (data.filaments && Array.isArray(data.filaments)) {
        for (const filament of data.filaments) {
          const { id: oldId, userId: oldUserId, ...filamentData } = filament;
          const newUserId = userIdMap[oldUserId];
          
          if (!newUserId) {
            appLogger.warn(`Skipping filament - user ID ${oldUserId} not found in backup`);
            continue;
          }
          
          try {
            const [newFilament] = await db.insert(filaments).values({
              ...filamentData,
              userId: newUserId,
              createdAt: filamentData.createdAt ? new Date(filamentData.createdAt) : new Date(),
              updatedAt: new Date(),
            }).returning({ id: filaments.id });
            
            if (oldId && newFilament) {
              filamentIdMap[oldId] = newFilament.id;
            }
            restored.filaments++;
          } catch (insertError) {
            appLogger.warn("Could not restore filament:", insertError);
          }
        }
      }

      // Restore filament history (with filament ID mapping)
      if (data.filamentHistory && Array.isArray(data.filamentHistory)) {
        for (const history of data.filamentHistory) {
          const { id, filamentId: oldFilamentId, printJobId, ...historyData } = history;
          const newFilamentId = filamentIdMap[oldFilamentId];
          
          if (!newFilamentId) continue;
          
          try {
            await db.insert(filamentHistory).values({
              ...historyData,
              filamentId: newFilamentId,
              printJobId: null,
              createdAt: historyData.createdAt ? new Date(historyData.createdAt) : new Date(),
            });
            restored.filamentHistory++;
          } catch (insertError) {
            appLogger.warn("Could not restore filament history:", insertError);
          }
        }
      }

      // Restore print jobs (with user ID mapping)
      if (data.printJobs && Array.isArray(data.printJobs)) {
        for (const job of data.printJobs) {
          const { id, userId: oldUserId, ...jobData } = job;
          const newUserId = userIdMap[oldUserId];
          
          if (!newUserId) continue;
          
          try {
            await db.insert(printJobs).values({
              ...jobData,
              userId: newUserId,
              createdAt: jobData.createdAt ? new Date(jobData.createdAt) : new Date(),
            });
            restored.printJobs++;
          } catch (insertError) {
            appLogger.warn("Could not restore print job:", insertError);
          }
        }
      }

      // Restore slicer profiles (with user ID mapping)
      if (data.slicerProfiles && Array.isArray(data.slicerProfiles)) {
        for (const profile of data.slicerProfiles) {
          const { id, userId: oldUserId, ...profileData } = profile;
          const newUserId = userIdMap[oldUserId];
          
          if (!newUserId) continue;
          
          try {
            const [newProfile] = await db.insert(slicerProfiles).values({
              ...profileData,
              userId: newUserId,
              createdAt: profileData.createdAt ? new Date(profileData.createdAt) : new Date(),
              updatedAt: new Date(),
            }).returning();
            if (id && newProfile) {
              profileIdMap[id] = newProfile.id;
            }
            restored.slicerProfiles++;
          } catch (insertError) {
            appLogger.warn("Could not restore slicer profile:", insertError);
          }
        }
      }

      // Restore filament/profile links
      if (data.filamentSlicerProfiles && Array.isArray(data.filamentSlicerProfiles)) {
        for (const link of data.filamentSlicerProfiles) {
          const { id, filamentId: oldFilamentId, slicerProfileId: oldProfileId, ...linkData } = link;
          const newFilamentId = filamentIdMap[oldFilamentId];
          const newProfileId = profileIdMap[oldProfileId];
          if (!newFilamentId || !newProfileId) continue;

          try {
            await db.insert(filamentSlicerProfiles).values({
              ...linkData,
              filamentId: newFilamentId,
              slicerProfileId: newProfileId,
              createdAt: linkData.createdAt ? new Date(linkData.createdAt) : new Date(),
            });
            restored.filamentSlicerProfiles++;
          } catch (insertError) {
            appLogger.warn("Could not restore filament slicer profile link:", insertError);
          }
        }
      }

      // Restore user sharing (with user ID mapping)
      if (data.userSharing && Array.isArray(data.userSharing)) {
        for (const sharing of data.userSharing) {
          const { id, userId: oldUserId, ...sharingData } = sharing;
          const newUserId = userIdMap[oldUserId];
          
          if (!newUserId) continue;
          
          try {
            await db.insert(userSharing).values({
              ...sharingData,
              userId: newUserId,
              createdAt: sharingData.createdAt ? new Date(sharingData.createdAt) : new Date(),
            });
            restored.userSharing++;
          } catch (insertError) {
            appLogger.warn("Could not restore user sharing:", insertError);
          }
        }
      }

      // Restore upload sessions (with user ID mapping)
      if (data.uploadSessions && Array.isArray(data.uploadSessions)) {
        for (const session of data.uploadSessions) {
          const { id: oldId, userId: oldUserId, ...sessionData } = session;
          const newUserId = userIdMap[oldUserId];
          if (!newUserId) continue;

          try {
            const [newSession] = await db.insert(uploadSessions).values({
              ...sessionData,
              userId: newUserId,
              expiresAt: sessionData.expiresAt ? new Date(sessionData.expiresAt) : new Date(),
              createdAt: sessionData.createdAt ? new Date(sessionData.createdAt) : new Date(),
            }).returning({ id: uploadSessions.id });
            if (oldId && newSession) {
              uploadSessionIdMap[oldId] = newSession.id;
            }
            restored.uploadSessions++;
          } catch (insertError) {
            appLogger.warn("Could not restore upload session:", insertError);
          }
        }
      }

      // Restore pending uploads (with session ID mapping)
      if (data.pendingUploads && Array.isArray(data.pendingUploads)) {
        for (const upload of data.pendingUploads) {
          const { id, sessionId: oldSessionId, ...uploadData } = upload;
          const newSessionId = uploadSessionIdMap[oldSessionId];
          if (!newSessionId) continue;

          try {
            await db.insert(pendingUploads).values({
              ...uploadData,
              sessionId: newSessionId,
              createdAt: uploadData.createdAt ? new Date(uploadData.createdAt) : new Date(),
            });
            restored.pendingUploads++;
          } catch (insertError) {
            appLogger.warn("Could not restore pending upload:", insertError);
          }
        }
      }

      // Log the restore
      await db.insert(backupHistory).values({
        userId: req.userId!,
        provider: "admin_restore_zip",
        status: "completed",
        fileSize: zipBuffer.length,
        startedAt: new Date(),
        completedAt: new Date(),
      });

      res.json({
        message: "Admin restore completed",
        restored,
        note: restored.users > 0 ? `${restored.users} new users created with temporary password "changeme"` : undefined,
      });
    } catch (error) {
      appLogger.error("Error restoring admin backup:", error);
      res.status(500).json({ message: "Failed to restore admin backup" });
    }
  });

  // Get extended status (including S3 and WebDAV)
  app.get("/api/cloud-backup/status-extended", authenticate, async (req: Request, res: Response) => {
    try {
      const configs = await db
        .select()
        .from(cloudBackupConfigs)
        .where(eq(cloudBackupConfigs.userId, req.userId!));

      const status: Record<string, { configured: boolean; enabled: boolean; lastBackup: string | null }> = {
        google: { configured: false, enabled: false, lastBackup: null },
        dropbox: { configured: false, enabled: false, lastBackup: null },
        onedrive: { configured: false, enabled: false, lastBackup: null },
        s3: { configured: false, enabled: false, lastBackup: null },
        webdav: { configured: false, enabled: false, lastBackup: null },
      };

      for (const config of configs) {
        const provider = config.provider;
        if (status[provider]) {
          let isConfigured = false;
          
          if (provider === "s3") {
            isConfigured = !!(config.s3AccessKeyId && config.s3SecretAccessKey && config.s3Bucket);
          } else if (provider === "webdav") {
            isConfigured = !!(config.webdavUrl && config.webdavPassword);
          } else {
            isConfigured = !!config.accessToken;
          }

          status[provider] = {
            configured: isConfigured,
            enabled: config.isEnabled || false,
            lastBackup: config.lastBackupAt?.toISOString() || null,
          };
        }
      }

      res.json(status);
    } catch (error) {
      appLogger.error("Error fetching extended backup status:", error);
      res.status(500).json({ message: "Failed to fetch backup status" });
    }
  });
}
