import type { Express, Request, Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import os from "os";
import QRCode from "qrcode";
import { authenticate } from "../auth";
import { storage } from "../storage";
import { db } from "../db";
import {
  uploadSessions as uploadSessionsTable,
  pendingUploads as pendingUploadsTable,
  filaments as filamentsTable,
} from "../../shared/schema";
import { and, eq, desc, inArray, count } from "drizzle-orm";
import { logger } from "../utils/logger";
import { encrypt, decrypt, maskApiKey, isValidOpenAIKeyFormat } from "../utils/encryption";
import { extractFilamentDataFromImage, extractFilamentDataFromImages, validateOpenAIKey, ExtractedFilamentData, VISION_MODELS } from "../utils/openai-vision";

/**
 * Get the local network IP address for the server
 * This allows mobile devices on the same network to connect
 * 
 * For Docker: Set HOST_IP environment variable to your host machine's IP
 * Example: HOST_IP=192.168.1.100
 */
function getLocalNetworkIP(): string {
  // Check for explicit host IP (required for Docker)
  if (process.env.HOST_IP) {
    return process.env.HOST_IP;
  }
  
  // Check for public URL (strips protocol and port)
  if (process.env.PUBLIC_URL) {
    const url = process.env.PUBLIC_URL;
    const match = url.match(/^https?:\/\/([^:\/]+)/);
    if (match) return match[1];
  }
  
  const interfaces = os.networkInterfaces();
  
  // Priority order: en0 (macOS WiFi), eth0, wlan0, then any other
  const priorityInterfaces = ['en0', 'en1', 'eth0', 'wlan0', 'Wi-Fi', 'Ethernet'];
  
  for (const ifaceName of priorityInterfaces) {
    const iface = interfaces[ifaceName];
    if (iface) {
      for (const alias of iface) {
        if (alias.family === 'IPv4' && !alias.internal) {
          return alias.address;
        }
      }
    }
  }
  
  // Fallback: find any non-internal IPv4 address
  for (const ifaceName of Object.keys(interfaces)) {
    const iface = interfaces[ifaceName];
    if (iface) {
      for (const alias of iface) {
        if (alias.family === 'IPv4' && !alias.internal) {
          return alias.address;
        }
      }
    }
  }
  
  // Last resort fallback
  return 'localhost';
}

// Configure multer for file uploads
const uploadDir = path.join(process.cwd(), "public", "uploads", "filaments");
const MAX_UPLOAD_FILES = 50;
const MAX_UPLOAD_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB max
const ACTIVE_PENDING_STATUSES = ["pending", "processing", "ready", "error"] as const;

// Ensure upload directory exists
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const multerStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;
    const ext = path.extname(file.originalname) || ".jpg";
    cb(null, `filament-${uniqueSuffix}${ext}`);
  },
});

const upload = multer({
  storage: multerStorage,
  limits: {
    fileSize: MAX_UPLOAD_FILE_SIZE_BYTES,
    files: MAX_UPLOAD_FILES,
  },
  fileFilter: (_req, file, cb) => {
    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type: ${file.mimetype}. Allowed types: JPEG, PNG, WebP, HEIC`));
    }
  },
});

function parseExtractedData(raw?: string | null): ExtractedFilamentData | undefined {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as ExtractedFilamentData;
  } catch {
    return undefined;
  }
}

/**
 * Get OpenAI API key - first check user's stored key, then fall back to env var
 */
async function getOpenAIKey(userId: number): Promise<string | null> {
  // First try to get user's personal API key
  const user = await storage.getUser(userId);
  if (user?.openaiApiKey) {
    try {
      return decrypt(user.openaiApiKey);
    } catch (error) {
      logger.error("Failed to decrypt user's API key:", error);
    }
  }
  
  // Fall back to environment variable (for development/shared instances)
  return process.env.OPENAI_API_KEY || null;
}

export function registerAIRoutes(app: Express): void {
  // ===== API KEY MANAGEMENT =====
  
  /**
   * Get the status of the user's OpenAI API key and model preference
   */
  app.get("/api/ai/api-key/status", authenticate, async (req: Request, res: Response) => {
    try {
      const user = await storage.getUser(req.userId);
      
      const hasUserKey = !!user?.openaiApiKey;
      const hasEnvKey = !!process.env.OPENAI_API_KEY;
      
      let maskedKey = null;
      if (hasUserKey && user?.openaiApiKey) {
        try {
          const decrypted = decrypt(user.openaiApiKey);
          maskedKey = maskApiKey(decrypted);
        } catch {
          maskedKey = "****";
        }
      }
      
      res.json({
        hasUserKey,
        hasEnvKey,
        maskedKey,
        aiEnabled: hasUserKey || hasEnvKey,
        selectedModel: (user as any)?.openaiModel || 'gpt-4o',
        availableModels: VISION_MODELS,
      });
    } catch (error) {
      logger.error("Error getting API key status:", error);
      res.status(500).json({ message: "Failed to get API key status" });
    }
  });
  
  /**
   * Update the user's preferred OpenAI model
   */
  app.post("/api/ai/model", authenticate, async (req: Request, res: Response) => {
    try {
      const { model } = req.body;
      
      if (!model) {
        return res.status(400).json({ message: "Model is required" });
      }
      
      // Validate model is in the allowed list
      const validModel = VISION_MODELS.find(m => m.id === model);
      if (!validModel) {
        return res.status(400).json({ message: "Invalid model selected" });
      }
      
      // Update user's model preference
      await storage.updateUserModel(req.userId, model);
      
      res.json({ 
        success: true, 
        model,
        modelInfo: validModel
      });
    } catch (error) {
      logger.error("Error updating model preference:", error);
      res.status(500).json({ message: "Failed to update model preference" });
    }
  });
  
  /**
   * Save or update the user's OpenAI API key
   */
  app.post("/api/ai/api-key", authenticate, async (req: Request, res: Response) => {
    try {
      const { apiKey } = req.body;
      
      if (!apiKey) {
        return res.status(400).json({ message: "API key is required" });
      }
      
      if (!isValidOpenAIKeyFormat(apiKey)) {
        return res.status(400).json({ message: "Invalid API key format. OpenAI keys start with 'sk-'" });
      }
      
      // Validate the key works
      const validation = await validateOpenAIKey(apiKey);
      if (!validation.valid) {
        return res.status(400).json({ message: validation.error || "Invalid API key" });
      }
      
      // Encrypt and store
      const encryptedKey = encrypt(apiKey);
      await storage.updateUserApiKey(req.userId, encryptedKey);
      
      res.json({
        success: true,
        maskedKey: maskApiKey(apiKey),
      });
    } catch (error) {
      logger.error("Error saving API key:", error);
      res.status(500).json({ message: "Failed to save API key" });
    }
  });
  
  /**
   * Remove the user's OpenAI API key
   */
  app.delete("/api/ai/api-key", authenticate, async (req: Request, res: Response) => {
    try {
      await storage.updateUserApiKey(req.userId, null);
      res.json({ success: true });
    } catch (error) {
      logger.error("Error removing API key:", error);
      res.status(500).json({ message: "Failed to remove API key" });
    }
  });
  
  // ===== SINGLE IMAGE EXTRACTION =====
  
  /**
   * Upload a single image and extract filament data
   */
  app.post("/api/ai/extract", authenticate, upload.single("image"), async (req: Request, res: Response) => {
    try {
      const apiKey = await getOpenAIKey(req.userId);
      if (!apiKey) {
        return res.status(400).json({
          message: "OpenAI API key not configured. Please add your API key in Settings.",
        });
      }
      
      if (!req.file) {
        return res.status(400).json({ message: "No image file provided" });
      }
      
      // Read the image and convert to base64
      const imagePath = req.file.path;
      const imageBuffer = fs.readFileSync(imagePath);
      const base64Image = imageBuffer.toString("base64");
      
      // Extract data using OpenAI Vision
      const extractedData = await extractFilamentDataFromImage(base64Image, apiKey);
      
      // Generate the public URL for the uploaded image
      const imageUrl = `/uploads/filaments/${req.file.filename}`;
      
      res.json({
        success: true,
        imageUrl,
        extractedData,
      });
    } catch (error) {
      logger.error("Error extracting filament data:", error);
      
      // Clean up uploaded file on error
      if (req.file?.path) {
        try {
          fs.unlinkSync(req.file.path);
        } catch {}
      }
      
      const message = error instanceof Error ? error.message : "Failed to extract filament data";
      res.status(500).json({ message });
    }
  });
  
  /**
   * Extract data from base64 image without saving
   */
  app.post("/api/ai/extract-preview", authenticate, async (req: Request, res: Response) => {
    try {
      const apiKey = await getOpenAIKey(req.userId);
      if (!apiKey) {
        return res.status(400).json({
          message: "OpenAI API key not configured. Please add your API key in Settings.",
        });
      }
      
      const { imageBase64 } = req.body;
      if (!imageBase64) {
        return res.status(400).json({ message: "No image data provided" });
      }
      
      // Extract data using OpenAI Vision
      const extractedData = await extractFilamentDataFromImage(imageBase64, apiKey);
      
      res.json({
        success: true,
        extractedData,
      });
    } catch (error) {
      logger.error("Error extracting filament data:", error);
      const message = error instanceof Error ? error.message : "Failed to extract filament data";
      res.status(500).json({ message });
    }
  });
  
  // ===== BULK IMAGE EXTRACTION =====
  
  /**
   * Upload multiple images and extract filament data from all of them
   */
  app.post(
    "/api/ai/extract-bulk",
    authenticate,
    upload.array("images", MAX_UPLOAD_FILES),
    async (req: Request, res: Response) => {
      try {
      const apiKey = await getOpenAIKey(req.userId);
      if (!apiKey) {
        return res.status(400).json({
          message: "OpenAI API key not configured. Please add your API key in Settings.",
        });
      }
      
      // Get user's preferred model
      const user = await storage.getUser(req.userId);
      const model = (user as any)?.openaiModel || 'gpt-4o';
      
      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        return res.status(400).json({ message: "No image files provided" });
      }
      
      logger.info(`Processing ${files.length} images for bulk extraction using model: ${model}...`);

      const sessionToken = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const [session] = await db
        .insert(uploadSessionsTable)
        .values({
          sessionToken,
          userId: req.userId,
          status: "processing",
          expiresAt,
        })
        .returning({ id: uploadSessionsTable.id });

      const pendingRows = files.map((file) => ({
        sessionId: session.id,
        imageUrl: `/uploads/filaments/${file.filename}`,
        status: "processing",
      }));

      const inserted = await db
        .insert(pendingUploadsTable)
        .values(pendingRows)
        .returning({ id: pendingUploadsTable.id });

      const resultsWithIds: Array<{
        imageUrl: string;
        originalName: string;
        extractedData?: ExtractedFilamentData;
        error?: string;
        pendingUploadId?: number;
      }> = [];

      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        const pendingId = inserted[index]?.id;
        const imageUrl = `/uploads/filaments/${file.filename}`;

        try {
          const base64 = fs.readFileSync(file.path).toString("base64");
          const extractedData = await extractFilamentDataFromImage(base64, apiKey, model);

          if (pendingId) {
            await db
              .update(pendingUploadsTable)
              .set({
                extractedData: JSON.stringify(extractedData),
                status: "ready",
                errorMessage: null,
              })
              .where(eq(pendingUploadsTable.id, pendingId));
          }

          resultsWithIds.push({
            imageUrl,
            originalName: file.originalname,
            extractedData,
            pendingUploadId: pendingId,
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Failed to process image";
          if (pendingId) {
            await db
              .update(pendingUploadsTable)
              .set({
                status: "error",
                errorMessage,
              })
              .where(eq(pendingUploadsTable.id, pendingId));
          }

          resultsWithIds.push({
            imageUrl,
            originalName: file.originalname,
            error: errorMessage,
            pendingUploadId: pendingId,
          });
        }
      }

      await db
        .update(uploadSessionsTable)
        .set({ status: "completed" })
        .where(eq(uploadSessionsTable.id, session.id));
      
      res.json({
        success: true,
        total: files.length,
        processed: resultsWithIds.filter((r) => !r.error).length,
        failed: resultsWithIds.filter((r) => r.error).length,
        results: resultsWithIds,
      });
    } catch (error) {
      logger.error("Error in bulk extraction:", error);
      
      // Clean up uploaded files on error
      const files = req.files as Express.Multer.File[];
      for (const file of files || []) {
        try {
          fs.unlinkSync(file.path);
        } catch {}
      }
      
      const message = error instanceof Error ? error.message : "Failed to process images";
      res.status(500).json({ message });
    }
  });
  
  // ===== QR CODE / MOBILE UPLOAD SESSION =====
  
  /**
   * Create a new upload session and generate QR code for mobile upload
   */
  app.post("/api/ai/upload-session", authenticate, async (req: Request, res: Response) => {
    try {
      // Generate unique session token
      const sessionToken = crypto.randomBytes(32).toString("hex");
      
      // Session expires in 30 minutes
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

      await db.insert(uploadSessionsTable).values({
        sessionToken,
        userId: req.userId,
        status: "pending",
        expiresAt,
      });
      
      // Generate QR code with upload URL using local network IP
      const localIP = getLocalNetworkIP();
      const port = process.env.PORT || 5001;
      const protocol = req.protocol;
      const uploadUrl = `${protocol}://${localIP}:${port}/mobile-upload/${sessionToken}`;
      
      logger.info(`Mobile upload session created. URL: ${uploadUrl}`);
      
      const qrCodeDataUrl = await QRCode.toDataURL(uploadUrl, {
        width: 256,
        margin: 2,
        color: {
          dark: "#000000",
          light: "#ffffff",
        },
      });
      
      res.json({
        success: true,
        sessionToken,
        uploadUrl,
        qrCode: qrCodeDataUrl,
        expiresAt: expiresAt.toISOString(),
      });
    } catch (error) {
      logger.error("Error creating upload session:", error);
      res.status(500).json({ message: "Failed to create upload session" });
    }
  });
  
  /**
   * Get upload session status
   */
  app.get("/api/ai/upload-session/:token", authenticate, async (req: Request, res: Response) => {
    try {
      res.set("Cache-Control", "no-store, max-age=0");
      res.set("Pragma", "no-cache");
      res.set("Expires", "0");

      const { token } = req.params;
      const sessionRows = await db
        .select()
        .from(uploadSessionsTable)
        .where(eq(uploadSessionsTable.sessionToken, token))
        .limit(1);

      const session = sessionRows[0];
      if (!session) {
        return res.status(404).json({ message: "Session not found or expired" });
      }

      if (session.userId !== req.userId) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      if (session.status === "cancelled") {
        return res.status(409).json({ message: "Session cancelled" });
      }

      if (session.expiresAt < new Date() && session.status !== "expired" && session.status !== "cancelled") {
        await db
          .update(uploadSessionsTable)
          .set({ status: "expired" })
          .where(eq(uploadSessionsTable.id, session.id));
      }

      const uploads = await db
        .select()
        .from(pendingUploadsTable)
        .where(
          and(
            eq(pendingUploadsTable.sessionId, session.id),
            inArray(pendingUploadsTable.status, ACTIVE_PENDING_STATUSES)
          )
        )
        .orderBy(desc(pendingUploadsTable.createdAt));

      const images = uploads.map((upload) => ({
        id: upload.id,
        imageUrl: upload.imageUrl,
        extractedData: parseExtractedData(upload.extractedData),
        error: upload.errorMessage || undefined,
      }));

      const processedCount = uploads.filter((img) => img.extractedData || img.errorMessage).length;
      const pendingCount = uploads.length - processedCount;

      res.json({
        status: session.status,
        imageCount: uploads.length,
        images,
        processedCount,
        pendingCount,
        processing: session.status === "processing",
        expiresAt: session.expiresAt.toISOString(),
      });
    } catch (error) {
      logger.error("Error getting session status:", error);
      res.status(500).json({ message: "Failed to get session status" });
    }
  });
  
  /**
   * Mobile upload endpoint - accepts images for a session (no auth required, uses session token)
   */
  app.post("/api/ai/mobile-upload/:token", upload.array("images", MAX_UPLOAD_FILES), async (req: Request, res: Response) => {
    try {
      const { token } = req.params;
      const sessionRows = await db
        .select()
        .from(uploadSessionsTable)
        .where(eq(uploadSessionsTable.sessionToken, token))
        .limit(1);

      const session = sessionRows[0];
      if (!session) {
        return res.status(404).json({ message: "Session not found or expired" });
      }

      if (session.expiresAt < new Date()) {
        await db
          .update(uploadSessionsTable)
          .set({ status: "expired" })
          .where(eq(uploadSessionsTable.id, session.id));
        return res.status(410).json({ message: "Session expired" });
      }
      
      if (session.status === "cancelled") {
        return res.status(409).json({ message: "Session cancelled" });
      }
      
      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        return res.status(400).json({ message: "No images provided" });
      }
      
      await db
        .update(uploadSessionsTable)
        .set({ status: "uploading" })
        .where(eq(uploadSessionsTable.id, session.id));

      const pendingRows = files.map((file) => ({
        sessionId: session.id,
        imageUrl: `/uploads/filaments/${file.filename}`,
        status: "pending",
      }));

      await db.insert(pendingUploadsTable).values(pendingRows);

      const totalCount = await db
        .select({ total: count() })
        .from(pendingUploadsTable)
        .where(eq(pendingUploadsTable.sessionId, session.id));
      
      res.json({
        success: true,
        uploaded: files.length,
        total: totalCount[0]?.total ?? files.length,
      });
    } catch (error) {
      logger.error("Error in mobile upload:", error);
      res.status(500).json({ message: "Failed to upload images" });
    }
  });
  
  /**
   * Process images from an upload session - starts processing and returns immediately
   * Client should poll GET /api/ai/upload-session/:token to get results as they complete
   */
  app.post("/api/ai/upload-session/:token/process", authenticate, async (req: Request, res: Response) => {
    try {
      const { token } = req.params;
      const sessionRows = await db
        .select()
        .from(uploadSessionsTable)
        .where(eq(uploadSessionsTable.sessionToken, token))
        .limit(1);

      const session = sessionRows[0];
      if (!session) {
        return res.status(404).json({ message: "Session not found or expired" });
      }

      if (session.userId !== req.userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const uploads = await db
        .select()
        .from(pendingUploadsTable)
        .where(
          and(
            eq(pendingUploadsTable.sessionId, session.id),
            inArray(pendingUploadsTable.status, ACTIVE_PENDING_STATUSES)
          )
        )
        .orderBy(desc(pendingUploadsTable.createdAt));

      const unprocessedImages = uploads.filter(
        (img) => !img.extractedData && !img.errorMessage && img.status !== "error"
      );

      if (unprocessedImages.length === 0) {
        const results = uploads
          .filter((img) => img.extractedData || img.errorMessage)
          .map((img) => ({
            id: img.id,
            imageUrl: img.imageUrl,
            extractedData: parseExtractedData(img.extractedData),
            error: img.errorMessage || undefined,
          }));

        return res.json({
          success: true,
          results,
          processing: false,
          processedCount: results.length,
          totalCount: uploads.length,
        });
      }
      
      const apiKey = await getOpenAIKey(req.userId);
      if (!apiKey) {
        return res.status(400).json({
          message: "OpenAI API key not configured. Please add your API key in Settings.",
        });
      }
      
      // If already processing, just return current status
      if (session.status === "processing") {
        const results = uploads
          .filter((img) => img.extractedData || img.errorMessage)
          .map((img) => ({
            id: img.id,
            imageUrl: img.imageUrl,
            extractedData: parseExtractedData(img.extractedData),
            error: img.errorMessage || undefined,
          }));

        return res.json({
          success: true,
          results,
          processing: true,
          processedCount: results.length,
          totalCount: uploads.length,
        });
      }

      await db
        .update(uploadSessionsTable)
        .set({ status: "processing" })
        .where(eq(uploadSessionsTable.id, session.id));
      
      // Return immediately with current status
      const currentResults = uploads
        .filter((img) => img.extractedData || img.errorMessage)
        .map((img) => ({
          id: img.id,
          imageUrl: img.imageUrl,
          extractedData: parseExtractedData(img.extractedData),
          error: img.errorMessage || undefined,
        }));

      res.json({
        success: true,
        results: currentResults,
        processing: true,
        processedCount: currentResults.length,
        totalCount: uploads.length,
      });
      
      // Process images one at a time in the background
      (async () => {
        for (const image of unprocessedImages) {
          try {
            const sessionCheck = await db
              .select({ status: uploadSessionsTable.status })
              .from(uploadSessionsTable)
              .where(eq(uploadSessionsTable.id, session.id))
              .limit(1);
            
            const currentStatus = sessionCheck[0]?.status;
            if (!currentStatus || currentStatus === "cancelled" || currentStatus === "expired") {
              logger.info(`Session ${token} cancelled or expired. Stopping processing.`);
              break;
            }
            
            const filename = path.basename(image.imageUrl);
            const imagePath = path.join(uploadDir, filename);
            const imageBuffer = fs.readFileSync(imagePath);
            const base64Image = imageBuffer.toString("base64");

            const extractedData = await extractFilamentDataFromImage(base64Image, apiKey);
            await db
              .update(pendingUploadsTable)
              .set({
                extractedData: JSON.stringify(extractedData),
                status: "ready",
                errorMessage: null,
              })
              .where(eq(pendingUploadsTable.id, image.id));

            logger.info(`Processed image: ${filename}`);
          } catch (error) {
            await db
              .update(pendingUploadsTable)
              .set({
                status: "error",
                errorMessage: error instanceof Error ? error.message : "Failed to process image",
              })
              .where(eq(pendingUploadsTable.id, image.id));

            logger.error(`Error processing image ${image.imageUrl}:`, error);
          }
        }

        const finalSession = await db
          .select({ status: uploadSessionsTable.status })
          .from(uploadSessionsTable)
          .where(eq(uploadSessionsTable.id, session.id))
          .limit(1);
        
        if (finalSession[0]?.status && finalSession[0].status !== "cancelled" && finalSession[0].status !== "expired") {
          await db
            .update(uploadSessionsTable)
            .set({ status: "completed" })
            .where(eq(uploadSessionsTable.id, session.id));
          logger.info(`Session ${token} processing complete. ${uploads.length} images processed.`);
        } else {
          logger.info(`Session ${token} processing stopped (${finalSession[0]?.status ?? "missing"}).`);
        }
      })();
      
    } catch (error) {
      logger.error("Error processing session images:", error);
      res.status(500).json({ message: "Failed to process images" });
    }
  });
  
  /**
   * Cancel processing for an upload session (keeps processed results)
   */
  app.post("/api/ai/upload-session/:token/cancel", authenticate, async (req: Request, res: Response) => {
    try {
      const { token } = req.params;
      const sessionRows = await db
        .select()
        .from(uploadSessionsTable)
        .where(eq(uploadSessionsTable.sessionToken, token))
        .limit(1);

      const session = sessionRows[0];
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }

      if (session.userId !== req.userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      if (session.status === "cancelled") {
        return res.json({ success: true, cancelledCount: 0, status: "cancelled" });
      }

      await db
        .update(uploadSessionsTable)
        .set({ status: "cancelled" })
        .where(eq(uploadSessionsTable.id, session.id));

      const cancelledRows = await db
        .update(pendingUploadsTable)
        .set({ status: "cancelled", errorMessage: "Cancelled by user" })
        .where(
          and(
            eq(pendingUploadsTable.sessionId, session.id),
            inArray(pendingUploadsTable.status, ["pending", "processing"])
          )
        )
        .returning({ id: pendingUploadsTable.id });

      res.json({
        success: true,
        cancelledCount: cancelledRows.length,
        status: "cancelled",
      });
    } catch (error) {
      logger.error("Error cancelling session processing:", error);
      res.status(500).json({ message: "Failed to cancel processing" });
    }
  });
  
  /**
   * Delete an upload session
   */
  app.delete("/api/ai/upload-session/:token", authenticate, async (req: Request, res: Response) => {
    try {
      const { token } = req.params;
      const sessionRows = await db
        .select()
        .from(uploadSessionsTable)
        .where(eq(uploadSessionsTable.sessionToken, token))
        .limit(1);

      const session = sessionRows[0];
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }

      if (session.userId !== req.userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      await db.delete(uploadSessionsTable).where(eq(uploadSessionsTable.id, session.id));

      res.json({ success: true });
    } catch (error) {
      logger.error("Error deleting session:", error);
      res.status(500).json({ message: "Failed to delete session" });
    }
  });

  /**
   * Get pending uploads for review (DB-backed)
   */
  app.get("/api/ai/pending-uploads", authenticate, async (req: Request, res: Response) => {
    try {
      res.set("Cache-Control", "no-store, max-age=0");
      res.set("Pragma", "no-cache");
      res.set("Expires", "0");

      const sessions = await db
        .select({ id: uploadSessionsTable.id })
        .from(uploadSessionsTable)
        .where(eq(uploadSessionsTable.userId, req.userId));

      if (sessions.length === 0) {
        return res.json({
          items: [],
          pendingCount: 0,
          processedCount: 0,
          totalCount: 0,
        });
      }

      const sessionIds = sessions.map((s) => s.id);
      const uploads = await db
        .select()
        .from(pendingUploadsTable)
        .where(
          and(
            inArray(pendingUploadsTable.sessionId, sessionIds),
            inArray(pendingUploadsTable.status, ["pending", "processing", "ready", "error"])
          )
        )
        .orderBy(desc(pendingUploadsTable.createdAt));

      let visibleUploads = uploads;

      if (uploads.length > 0) {
        const imageUrls = uploads
          .map((upload) => upload.imageUrl)
          .filter((url): url is string => Boolean(url));

        if (imageUrls.length > 0) {
          const imported = await db
            .select({ imageUrl: filamentsTable.imageUrl })
            .from(filamentsTable)
            .where(
              and(
                eq(filamentsTable.userId, req.userId),
                inArray(filamentsTable.imageUrl, imageUrls)
              )
            );

          const importedUrls = new Set(
            imported.map((row) => row.imageUrl).filter((url): url is string => Boolean(url))
          );

          if (importedUrls.size > 0) {
            visibleUploads = uploads.filter((upload) => !importedUrls.has(upload.imageUrl));

            await db
              .update(pendingUploadsTable)
              .set({ status: "imported" })
              .where(
                and(
                  inArray(pendingUploadsTable.sessionId, sessionIds),
                  inArray(pendingUploadsTable.imageUrl, Array.from(importedUrls))
                )
              );
          }
        }
      }

      const items = visibleUploads.map((upload) => ({
        id: upload.id,
        imageUrl: upload.imageUrl,
        extractedData: parseExtractedData(upload.extractedData),
        error: upload.errorMessage || undefined,
        status: upload.status,
      }));

      const pendingCount = visibleUploads.filter((u) => u.status === "pending" || u.status === "processing").length;
      const processedCount = visibleUploads.filter((u) => u.status === "ready" || u.status === "error").length;

      res.json({
        items,
        pendingCount,
        processedCount,
        totalCount: visibleUploads.length,
      });
    } catch (error) {
      logger.error("Error getting pending uploads:", error);
      res.status(500).json({ message: "Failed to get pending uploads" });
    }
  });

  /**
   * Update a pending upload (notes/remaining/status edits)
   */
  app.patch("/api/ai/pending-uploads/:id", authenticate, async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      if (Number.isNaN(id)) {
        return res.status(400).json({ message: "Invalid pending upload id" });
      }

      const rows = await db
        .select({ id: pendingUploadsTable.id })
        .from(pendingUploadsTable)
        .innerJoin(uploadSessionsTable, eq(pendingUploadsTable.sessionId, uploadSessionsTable.id))
        .where(and(eq(pendingUploadsTable.id, id), eq(uploadSessionsTable.userId, req.userId)))
        .limit(1);

      if (rows.length === 0) {
        return res.status(404).json({ message: "Pending upload not found" });
      }

      const { extractedData } = req.body;
      if (!extractedData) {
        return res.status(400).json({ message: "No extracted data provided" });
      }

      await db
        .update(pendingUploadsTable)
        .set({
          extractedData: JSON.stringify(extractedData),
          status: "ready",
          errorMessage: null,
        })
        .where(eq(pendingUploadsTable.id, id));

      res.json({ success: true });
    } catch (error) {
      logger.error("Error updating pending upload:", error);
      res.status(500).json({ message: "Failed to update pending upload" });
    }
  });

  /**
   * Remove a single pending upload
   */
  app.delete("/api/ai/pending-uploads/:id", authenticate, async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      if (Number.isNaN(id)) {
        return res.status(400).json({ message: "Invalid pending upload id" });
      }

      const rows = await db
        .select({ id: pendingUploadsTable.id })
        .from(pendingUploadsTable)
        .innerJoin(uploadSessionsTable, eq(pendingUploadsTable.sessionId, uploadSessionsTable.id))
        .where(and(eq(pendingUploadsTable.id, id), eq(uploadSessionsTable.userId, req.userId)))
        .limit(1);

      if (rows.length === 0) {
        return res.status(404).json({ message: "Pending upload not found" });
      }

      await db.delete(pendingUploadsTable).where(eq(pendingUploadsTable.id, id));

      res.json({ success: true });
    } catch (error) {
      logger.error("Error deleting pending upload:", error);
      res.status(500).json({ message: "Failed to delete pending upload" });
    }
  });

  /**
   * Clear all pending uploads for the user
   */
  app.delete("/api/ai/pending-uploads", authenticate, async (req: Request, res: Response) => {
    try {
      const sessions = await db
        .select({ id: uploadSessionsTable.id })
        .from(uploadSessionsTable)
        .where(eq(uploadSessionsTable.userId, req.userId));

      if (sessions.length === 0) {
        return res.json({ success: true });
      }

      const sessionIds = sessions.map((s) => s.id);
      await db
        .delete(pendingUploadsTable)
        .where(
          and(
            inArray(pendingUploadsTable.sessionId, sessionIds),
            inArray(pendingUploadsTable.status, ["pending", "processing", "ready", "error", "cancelled"])
          )
        );

      res.json({ success: true });
    } catch (error) {
      logger.error("Error clearing pending uploads:", error);
      res.status(500).json({ message: "Failed to clear pending uploads" });
    }
  });

  /**
   * Mark a set of pending uploads as imported
   */
  app.post("/api/ai/pending-uploads/mark-imported", authenticate, async (req: Request, res: Response) => {
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: "No pending upload ids provided" });
      }

      const sessions = await db
        .select({ id: uploadSessionsTable.id })
        .from(uploadSessionsTable)
        .where(eq(uploadSessionsTable.userId, req.userId));

      if (sessions.length === 0) {
        return res.json({ success: true });
      }

      const sessionIds = sessions.map((s) => s.id);
      await db
        .update(pendingUploadsTable)
        .set({ status: "imported" })
        .where(
          and(
            inArray(pendingUploadsTable.sessionId, sessionIds),
            inArray(pendingUploadsTable.id, ids)
          )
        );

      res.json({ success: true });
    } catch (error) {
      logger.error("Error marking pending uploads as imported:", error);
      res.status(500).json({ message: "Failed to mark pending uploads as imported" });
    }
  });
  
  // ===== MOBILE UPLOAD PAGE =====
  
  /**
   * Serve a simple mobile upload page
   */
  app.get("/mobile-upload/:token", async (req: Request, res: Response) => {
    const { token } = req.params;
    const sessionRows = await db
      .select()
      .from(uploadSessionsTable)
      .where(eq(uploadSessionsTable.sessionToken, token))
      .limit(1);
    const session = sessionRows[0];

    if (!session || session.expiresAt < new Date()) {
      return res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>Upload Expired</title>
          <style>
            body { font-family: system-ui, -apple-system, sans-serif; padding: 20px; text-align: center; background: #1a1a1a; color: white; }
            .error { color: #ef4444; }
          </style>
        </head>
        <body>
          <h1 class="error">Session Expired</h1>
          <p>This upload link has expired. Please generate a new QR code from Filadex.</p>
        </body>
        </html>
      `);
    }
    
    // Serve a mobile-friendly upload page
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
        <meta name="apple-mobile-web-app-capable" content="yes">
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
        <title>Filadex - Upload Photos</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(180deg, #0f0f1a 0%, #1a1a2e 50%, #16213e 100%);
            min-height: 100vh;
            min-height: -webkit-fill-available;
            color: white;
            padding: 0;
            padding-top: env(safe-area-inset-top);
            padding-bottom: env(safe-area-inset-bottom);
          }
          html {
            height: -webkit-fill-available;
          }
          .container {
            max-width: 100%;
            padding: 24px 20px;
            min-height: 100vh;
            display: flex;
            flex-direction: column;
          }
          .logo {
            text-align: center;
            padding: 20px 0 30px;
          }
          .logo h1 {
            font-size: 32px;
            font-weight: 700;
            margin: 0;
            background: linear-gradient(135deg, #818cf8 0%, #a78bfa 50%, #c084fc 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
          }
          .logo p {
            color: #64748b;
            margin: 8px 0 0;
            font-size: 15px;
            font-weight: 500;
          }
          
          .upload-options {
            display: flex;
            flex-direction: column;
            gap: 12px;
            margin-bottom: 24px;
          }
          
          .upload-btn-large {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 14px;
            background: rgba(99, 102, 241, 0.15);
            border: 1px solid rgba(99, 102, 241, 0.3);
            border-radius: 16px;
            padding: 20px 24px;
            color: white;
            font-size: 17px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s ease;
            -webkit-tap-highlight-color: transparent;
          }
          .upload-btn-large:active {
            background: rgba(99, 102, 241, 0.25);
            transform: scale(0.98);
          }
          .upload-btn-large svg {
            width: 28px;
            height: 28px;
            color: #818cf8;
            flex-shrink: 0;
          }
          .upload-btn-large .btn-text {
            display: flex;
            flex-direction: column;
            align-items: flex-start;
            gap: 2px;
          }
          .upload-btn-large .btn-text span {
            font-size: 13px;
            font-weight: 400;
            color: #94a3b8;
          }
          
          .divider {
            display: flex;
            align-items: center;
            gap: 16px;
            color: #475569;
            font-size: 13px;
            margin: 4px 0;
          }
          .divider::before, .divider::after {
            content: '';
            flex: 1;
            height: 1px;
            background: rgba(255,255,255,0.1);
          }
          
          input[type="file"] {
            display: none;
          }
          
          .preview-section {
            flex: 1;
            display: none;
            flex-direction: column;
          }
          .preview-section.visible {
            display: flex;
          }
          
          .preview-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 16px;
          }
          .photo-count {
            background: rgba(99, 102, 241, 0.2);
            color: #a5b4fc;
            padding: 8px 16px;
            border-radius: 20px;
            font-size: 14px;
            font-weight: 600;
          }
          .clear-btn {
            background: rgba(239, 68, 68, 0.15);
            color: #f87171;
            border: none;
            padding: 8px 16px;
            border-radius: 20px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
          }
          
          .preview-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 8px;
            margin-bottom: 20px;
            flex: 1;
            overflow-y: auto;
            align-content: start;
          }
          .preview-item {
            aspect-ratio: 1;
            border-radius: 12px;
            overflow: hidden;
            position: relative;
            background: rgba(255,255,255,0.05);
          }
          .preview-item img {
            width: 100%;
            height: 100%;
            object-fit: cover;
          }
          .preview-item .remove {
            position: absolute;
            top: 6px;
            right: 6px;
            width: 26px;
            height: 26px;
            background: rgba(0,0,0,0.75);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 18px;
            font-weight: 300;
            cursor: pointer;
            line-height: 1;
          }
          
          .add-more-row {
            display: flex;
            gap: 10px;
            margin-bottom: 16px;
          }
          .add-more-btn {
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            background: rgba(255,255,255,0.08);
            border: 1px solid rgba(255,255,255,0.15);
            border-radius: 12px;
            padding: 14px;
            color: white;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
          }
          .add-more-btn svg {
            width: 20px;
            height: 20px;
          }
          
          .btn {
            display: block;
            width: 100%;
            padding: 18px;
            border: none;
            border-radius: 14px;
            font-size: 17px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
            -webkit-tap-highlight-color: transparent;
          }
          .btn-primary {
            background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
            color: white;
            box-shadow: 0 4px 20px rgba(99, 102, 241, 0.4);
          }
          .btn-primary:disabled {
            opacity: 0.5;
            cursor: not-allowed;
            box-shadow: none;
          }
          .btn-primary:active:not(:disabled) {
            transform: scale(0.98);
          }
          .btn-secondary {
            background: rgba(255,255,255,0.1);
            color: white;
            margin-top: 12px;
          }
          
          .status-section {
            flex: 1;
            display: none;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            text-align: center;
            padding: 40px 20px;
          }
          .status-section.visible {
            display: flex;
          }
          .status-section svg {
            width: 80px;
            height: 80px;
            margin-bottom: 24px;
          }
          .status-section h2 {
            font-size: 24px;
            font-weight: 700;
            margin-bottom: 12px;
          }
          .status-section p {
            color: #94a3b8;
            font-size: 15px;
            line-height: 1.5;
            max-width: 300px;
          }
          .status-section .success-icon { color: #22c55e; }
          
          .progress-bar {
            width: 100%;
            max-width: 280px;
            height: 6px;
            background: rgba(255,255,255,0.1);
            border-radius: 3px;
            overflow: hidden;
            margin: 24px 0;
          }
          .progress-bar .fill {
            height: 100%;
            background: linear-gradient(90deg, #6366f1, #8b5cf6);
            transition: width 0.3s ease;
            border-radius: 3px;
          }
          
          .initial-section {
            flex: 1;
            display: flex;
            flex-direction: column;
          }
          .initial-section.hidden {
            display: none;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="logo">
            <h1>Filadex</h1>
            <p>Upload Filament Photos</p>
          </div>
          
          <!-- Initial Upload Options -->
          <div id="initial-section" class="initial-section">
            <div class="upload-options">
              <button class="upload-btn-large" id="gallery-btn">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <div class="btn-text">
                  Choose from Gallery
                  <span>Select multiple photos at once</span>
                </div>
              </button>
              
              <div class="divider">or</div>
              
              <button class="upload-btn-large" id="camera-btn">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <div class="btn-text">
                  Take Photo
                  <span>Use camera to capture spool</span>
                </div>
              </button>
            </div>
            
            <!-- Hidden file inputs -->
            <input type="file" id="gallery-input" accept="image/*" multiple>
            <input type="file" id="camera-input" accept="image/*" capture="environment">
          </div>
          
          <!-- Preview Section -->
          <div id="preview-section" class="preview-section">
            <div class="preview-header">
              <div class="photo-count" id="photo-count">0 photos</div>
              <button class="clear-btn" id="clear-btn">Clear All</button>
            </div>
            
            <div class="preview-grid" id="preview-grid"></div>
            
            <div class="add-more-row">
              <button class="add-more-btn" id="add-gallery-btn">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                </svg>
                Gallery
              </button>
              <button class="add-more-btn" id="add-camera-btn">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                </svg>
                Camera
              </button>
            </div>
            
            <button class="btn btn-primary" id="upload-btn">Upload Photos</button>
          </div>
          
          <!-- Progress Section -->
          <div id="progress-section" class="status-section">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" style="color: #818cf8; animation: spin 1s linear infinite;">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <style>@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }</style>
            <h2>Uploading...</h2>
            <p id="progress-text">Preparing photos...</p>
            <div class="progress-bar">
              <div class="fill" id="progress-fill" style="width: 0%"></div>
            </div>
          </div>
          
          <!-- Complete Section -->
          <div id="complete-section" class="status-section">
            <svg class="success-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h2>Upload Complete!</h2>
            <p id="complete-message">Return to Filadex on your computer to process and import your photos.</p>
            <button class="btn btn-secondary" onclick="location.reload()" style="margin-top: 24px; max-width: 200px;">Upload More</button>
          </div>
        </div>
        
        <script>
          const token = '${token}';
          const MAX_FILES_PER_BATCH = ${MAX_UPLOAD_FILES};
          const MAX_FILE_SIZE_BYTES = ${MAX_UPLOAD_FILE_SIZE_BYTES};
          const MAX_FILE_SIZE_MB = Math.round(MAX_FILE_SIZE_BYTES / (1024 * 1024));
          let selectedFiles = [];
          let isUploading = false;
          
          // DOM Elements
          const initialSection = document.getElementById('initial-section');
          const previewSection = document.getElementById('preview-section');
          const progressSection = document.getElementById('progress-section');
          const completeSection = document.getElementById('complete-section');
          
          const galleryInput = document.getElementById('gallery-input');
          const cameraInput = document.getElementById('camera-input');
          const galleryBtn = document.getElementById('gallery-btn');
          const cameraBtn = document.getElementById('camera-btn');
          
          const previewGrid = document.getElementById('preview-grid');
          const photoCount = document.getElementById('photo-count');
          const clearBtn = document.getElementById('clear-btn');
          const addGalleryBtn = document.getElementById('add-gallery-btn');
          const addCameraBtn = document.getElementById('add-camera-btn');
          const uploadBtn = document.getElementById('upload-btn');
          
          const progressFill = document.getElementById('progress-fill');
          const progressText = document.getElementById('progress-text');
          const completeMessage = document.getElementById('complete-message');
          
          // Button handlers
          galleryBtn.addEventListener('click', () => galleryInput.click());
          cameraBtn.addEventListener('click', () => cameraInput.click());
          addGalleryBtn.addEventListener('click', () => galleryInput.click());
          addCameraBtn.addEventListener('click', () => cameraInput.click());
          
          // File input handlers
          galleryInput.addEventListener('change', handleFileSelect);
          cameraInput.addEventListener('change', handleFileSelect);
          
          function handleFileSelect(e) {
            const newFiles = Array.from(e.target.files);
            if (newFiles.length > 0) {
              selectedFiles = [...selectedFiles, ...newFiles];
              updatePreview();
            }
            // Reset input so same file can be selected again
            e.target.value = '';
          }
          
          function updatePreview() {
            if (selectedFiles.length > 0) {
              initialSection.classList.add('hidden');
              previewSection.classList.add('visible');
              
              photoCount.textContent = selectedFiles.length + ' photo' + (selectedFiles.length !== 1 ? 's' : '');
              
              previewGrid.innerHTML = '';
              selectedFiles.forEach((file, index) => {
                const div = document.createElement('div');
                div.className = 'preview-item';
                
                const img = document.createElement('img');
                img.src = URL.createObjectURL(file);
                img.onload = () => URL.revokeObjectURL(img.src); // Free memory
                
                const remove = document.createElement('div');
                remove.className = 'remove';
                remove.textContent = '×';
                remove.onclick = (e) => {
                  e.stopPropagation();
                  selectedFiles.splice(index, 1);
                  updatePreview();
                };
                
                div.appendChild(img);
                div.appendChild(remove);
                previewGrid.appendChild(div);
              });
            } else {
              initialSection.classList.remove('hidden');
              previewSection.classList.remove('visible');
            }
          }
          
          // Clear all photos
          clearBtn.addEventListener('click', () => {
            selectedFiles = [];
            updatePreview();
          });
          
          function setProgress(percent, message) {
            const clamped = Math.max(0, Math.min(100, percent));
            progressFill.style.width = clamped + '%';
            progressText.textContent = message;
          }
          
          function bytesForFiles(files) {
            return files.reduce((sum, file) => sum + (file.size || 0), 0);
          }
          
          function parseXhrMessage(xhr) {
            if (xhr.response && xhr.response.message) {
              return xhr.response.message;
            }
            if (xhr.responseText) {
              try {
                const parsed = JSON.parse(xhr.responseText);
                if (parsed && parsed.message) {
                  return parsed.message;
                }
              } catch {
                // ignore parsing errors
              }
            }
            return null;
          }
          
          function uploadBatch(files, onProgress) {
            return new Promise((resolve, reject) => {
              const formData = new FormData();
              files.forEach(file => {
                formData.append('images', file);
              });
              
              const xhr = new XMLHttpRequest();
              xhr.open('POST', '/api/ai/mobile-upload/' + token);
              xhr.responseType = 'json';
              
              xhr.upload.onprogress = (event) => {
                if (onProgress) {
                  onProgress(event);
                }
              };
              
              xhr.onload = () => {
                const ok = xhr.status >= 200 && xhr.status < 300;
                if (ok) {
                  resolve(xhr.response || {});
                  return;
                }
                const message = parseXhrMessage(xhr) || 'Upload failed (' + xhr.status + ')';
                reject(new Error(message));
              };
              
              xhr.onerror = () => {
                reject(new Error('Network error. Please check your connection and try again.'));
              };
              
              xhr.send(formData);
            });
          }
          
          // Upload handler
          uploadBtn.addEventListener('click', async () => {
            if (selectedFiles.length === 0 || isUploading) return;
            
            const oversized = selectedFiles.filter(file => file.size > MAX_FILE_SIZE_BYTES);
            if (oversized.length > 0) {
              alert(oversized.length + ' photo' + (oversized.length !== 1 ? 's are' : ' is') + ' larger than ' + MAX_FILE_SIZE_MB + 'MB. Please remove them and try again.');
              return;
            }
            
            isUploading = true;
            uploadBtn.disabled = true;
            
            // Show progress
            previewSection.classList.remove('visible');
            completeSection.classList.remove('visible');
            progressSection.classList.add('visible');
            
            const totalFiles = selectedFiles.length;
            const totalBytes = bytesForFiles(selectedFiles);
            const batches = [];
            for (let index = 0; index < selectedFiles.length; index += MAX_FILES_PER_BATCH) {
              batches.push(selectedFiles.slice(index, index + MAX_FILES_PER_BATCH));
            }
            const totalBatches = batches.length;
            
            let uploadedFiles = 0;
            let uploadedBytes = 0;
            let totalUploadedFromServer = 0;
            
            setProgress(0, 'Preparing ' + totalFiles + ' photo' + (totalFiles !== 1 ? 's' : '') + '...');
            
            try {
              for (let index = 0; index < batches.length; index += 1) {
                const batch = batches[index];
                const batchBytes = bytesForFiles(batch);
                const batchSuffix = totalBatches > 1 ? ' (batch ' + (index + 1) + ' of ' + totalBatches + ')' : '';
                
                const result = await uploadBatch(batch, (event) => {
                  if (event.lengthComputable && totalBytes > 0) {
                    const overall = (uploadedBytes + event.loaded) / totalBytes;
                    const percent = Math.min(99, Math.round(overall * 100));
                    const batchProgress = event.total > 0 ? event.loaded / event.total : 0;
                    const currentCount = Math.min(totalFiles, uploadedFiles + Math.round(batchProgress * batch.length));
                    setProgress(percent, 'Uploading ' + currentCount + '/' + totalFiles + ' photos' + batchSuffix + '...');
                  } else {
                    const basePercent = totalFiles > 0 ? Math.min(99, Math.round((uploadedFiles / totalFiles) * 100)) : 0;
                    setProgress(basePercent, 'Uploading batch ' + (index + 1) + ' of ' + totalBatches + '...');
                  }
                });
                
                uploadedFiles += batch.length;
                uploadedBytes += batchBytes;
                if (result && typeof result.uploaded === 'number') {
                  totalUploadedFromServer += result.uploaded;
                } else {
                  totalUploadedFromServer += batch.length;
                }
                
                const percentComplete = totalBytes > 0 ? Math.round((uploadedBytes / totalBytes) * 100) : Math.round((uploadedFiles / totalFiles) * 100);
                setProgress(Math.min(99, percentComplete), 'Uploaded ' + uploadedFiles + '/' + totalFiles + ' photos...');
              }
              
              setProgress(100, 'Complete!');
              const uploadedCount = totalUploadedFromServer || uploadedFiles;
              setTimeout(() => {
                progressSection.classList.remove('visible');
                completeSection.classList.add('visible');
                completeMessage.textContent = uploadedCount + ' photo' + (uploadedCount !== 1 ? 's' : '') + ' uploaded! Return to Filadex on your computer to process and import them.';
              }, 400);
            } catch (error) {
              const message = error && error.message ? error.message : 'Upload failed';
              alert('Upload failed: ' + message);
              progressSection.classList.remove('visible');
              previewSection.classList.add('visible');
            } finally {
              isUploading = false;
              uploadBtn.disabled = false;
            }
          });
        </script>
      </body>
      </html>
    `);
  });
}
