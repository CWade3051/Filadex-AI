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
  printJobs,
  slicerProfiles,
} from "@shared/schema";
import { eq, and } from "drizzle-orm";
import crypto from "crypto";
import fs from "fs";
import path from "path";

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

// Generate backup data
async function generateBackupData(userId: number) {
  const userFilaments = await db
    .select()
    .from(filaments)
    .where(eq(filaments.userId, userId));

  const allManufacturers = await db.select().from(manufacturers);
  const allMaterials = await db.select().from(materials);
  const allColors = await db.select().from(colors);
  const allDiameters = await db.select().from(diameters);
  const allLocations = await db.select().from(storageLocations);

  const userPrintJobs = await db
    .select()
    .from(printJobs)
    .where(eq(printJobs.userId, userId));

  const userProfiles = await db
    .select()
    .from(slicerProfiles)
    .where(eq(slicerProfiles.userId, userId));

  return {
    version: "1.0",
    exportedAt: new Date().toISOString(),
    data: {
      filaments: userFilaments,
      manufacturers: allManufacturers,
      materials: allMaterials,
      colors: allColors,
      diameters: allDiameters,
      storageLocations: allLocations,
      printJobs: userPrintJobs,
      slicerProfiles: userProfiles,
    },
  };
}

export function registerCloudBackupRoutes(app: Express) {
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

  // Download local backup (always available)
  app.get("/api/cloud-backup/download", authenticate, async (req: Request, res: Response) => {
    try {
      const backupData = await generateBackupData(req.userId!);
      const filename = `filadex-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;

      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.json(backupData);
    } catch (error) {
      appLogger.error("Error generating backup:", error);
      res.status(500).json({ message: "Failed to generate backup" });
    }
  });
}
