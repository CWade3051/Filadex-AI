import type { Express, Request, Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import os from "os";
import QRCode from "qrcode";
import { authenticate } from "../auth";
import { storage } from "../storage";
import { logger } from "../utils/logger";
import { encrypt, decrypt, maskApiKey, isValidOpenAIKeyFormat } from "../utils/encryption";
import { extractFilamentDataFromImage, extractFilamentDataFromImages, validateOpenAIKey, ExtractedFilamentData, VISION_MODELS } from "../utils/openai-vision";

/**
 * Get the local network IP address for the server
 * This allows mobile devices on the same network to connect
 */
function getLocalNetworkIP(): string {
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
    fileSize: 10 * 1024 * 1024, // 10MB max
    files: 50, // Max 50 files at once
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

// In-memory store for upload sessions (in production, use Redis or DB)
const uploadSessions = new Map<string, {
  userId: number;
  createdAt: Date;
  expiresAt: Date;
  status: "pending" | "uploading" | "processing" | "completed" | "expired";
  images: { filename: string; imageUrl: string; extractedData?: ExtractedFilamentData; error?: string }[];
}>();

// Clean up expired sessions every 5 minutes
setInterval(() => {
  const now = new Date();
  for (const [token, session] of uploadSessions.entries()) {
    if (session.expiresAt < now) {
      uploadSessions.delete(token);
    }
  }
}, 5 * 60 * 1000);

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
  app.post("/api/ai/extract-bulk", authenticate, upload.array("images", 50), async (req: Request, res: Response) => {
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
      
      // Convert files to base64 array
      const images = files.map((file) => ({
        base64: fs.readFileSync(file.path).toString("base64"),
        filename: file.filename,
        originalName: file.originalname,
      }));
      
      // Extract data from all images
      const results = await extractFilamentDataFromImages(
        images.map((img) => ({ base64: img.base64, filename: img.filename })),
        apiKey,
        model
      );
      
      // Build response with image URLs
      const processedResults = results.map((result, index) => ({
        imageUrl: `/uploads/filaments/${images[index].filename}`,
        originalName: images[index].originalName,
        extractedData: result.data,
        error: result.error,
      }));
      
      res.json({
        success: true,
        total: files.length,
        processed: processedResults.filter((r) => !r.error).length,
        failed: processedResults.filter((r) => r.error).length,
        results: processedResults,
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
      
      // Store session
      uploadSessions.set(sessionToken, {
        userId: req.userId,
        createdAt: new Date(),
        expiresAt,
        status: "pending",
        images: [],
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
      const { token } = req.params;
      const session = uploadSessions.get(token);
      
      if (!session) {
        return res.status(404).json({ message: "Session not found or expired" });
      }
      
      if (session.userId !== req.userId) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      if (session.expiresAt < new Date()) {
        uploadSessions.delete(token);
        return res.status(410).json({ message: "Session expired" });
      }
      
      res.json({
        status: session.status,
        imageCount: session.images.length,
        images: session.images,
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
  app.post("/api/ai/mobile-upload/:token", upload.array("images", 50), async (req: Request, res: Response) => {
    try {
      const { token } = req.params;
      const session = uploadSessions.get(token);
      
      if (!session) {
        return res.status(404).json({ message: "Session not found or expired" });
      }
      
      if (session.expiresAt < new Date()) {
        uploadSessions.delete(token);
        return res.status(410).json({ message: "Session expired" });
      }
      
      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        return res.status(400).json({ message: "No images provided" });
      }
      
      // Update session status
      session.status = "uploading";
      
      // Add uploaded images to session
      for (const file of files) {
        session.images.push({
          filename: file.filename,
          imageUrl: `/uploads/filaments/${file.filename}`,
        });
      }
      
      res.json({
        success: true,
        uploaded: files.length,
        total: session.images.length,
      });
    } catch (error) {
      logger.error("Error in mobile upload:", error);
      res.status(500).json({ message: "Failed to upload images" });
    }
  });
  
  /**
   * Process images from an upload session
   */
  app.post("/api/ai/upload-session/:token/process", authenticate, async (req: Request, res: Response) => {
    try {
      const { token } = req.params;
      const session = uploadSessions.get(token);
      
      if (!session) {
        return res.status(404).json({ message: "Session not found or expired" });
      }
      
      if (session.userId !== req.userId) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      if (session.images.length === 0) {
        return res.status(400).json({ message: "No images to process" });
      }
      
      const apiKey = await getOpenAIKey(req.userId);
      if (!apiKey) {
        return res.status(400).json({
          message: "OpenAI API key not configured. Please add your API key in Settings.",
        });
      }
      
      session.status = "processing";
      
      // Process all images
      for (const image of session.images) {
        try {
          const imagePath = path.join(uploadDir, image.filename);
          const imageBuffer = fs.readFileSync(imagePath);
          const base64Image = imageBuffer.toString("base64");
          
          const extractedData = await extractFilamentDataFromImage(base64Image, apiKey);
          image.extractedData = extractedData;
        } catch (error) {
          image.error = error instanceof Error ? error.message : "Failed to process image";
        }
      }
      
      session.status = "completed";
      
      res.json({
        success: true,
        results: session.images,
      });
    } catch (error) {
      logger.error("Error processing session images:", error);
      res.status(500).json({ message: "Failed to process images" });
    }
  });
  
  /**
   * Delete an upload session
   */
  app.delete("/api/ai/upload-session/:token", authenticate, async (req: Request, res: Response) => {
    try {
      const { token } = req.params;
      const session = uploadSessions.get(token);
      
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }
      
      if (session.userId !== req.userId) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      // Optionally clean up uploaded files that weren't imported
      // (we keep them for now in case user wants to retry)
      
      uploadSessions.delete(token);
      
      res.json({ success: true });
    } catch (error) {
      logger.error("Error deleting session:", error);
      res.status(500).json({ message: "Failed to delete session" });
    }
  });
  
  // ===== MOBILE UPLOAD PAGE =====
  
  /**
   * Serve a simple mobile upload page
   */
  app.get("/mobile-upload/:token", async (req: Request, res: Response) => {
    const { token } = req.params;
    const session = uploadSessions.get(token);
    
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
          let selectedFiles = [];
          
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
          
          // Upload handler
          uploadBtn.addEventListener('click', async () => {
            if (selectedFiles.length === 0) return;
            
            // Show progress
            previewSection.classList.remove('visible');
            progressSection.classList.add('visible');
            progressText.textContent = 'Preparing ' + selectedFiles.length + ' photo' + (selectedFiles.length !== 1 ? 's' : '') + '...';
            
            const formData = new FormData();
            selectedFiles.forEach(file => {
              formData.append('images', file);
            });
            
            try {
              // Animate progress
              let progress = 0;
              const interval = setInterval(() => {
                progress += Math.random() * 8;
                if (progress > 85) {
                  clearInterval(interval);
                  progress = 85;
                }
                progressFill.style.width = progress + '%';
                progressText.textContent = 'Uploading... ' + Math.round(progress) + '%';
              }, 150);
              
              const response = await fetch('/api/ai/mobile-upload/' + token, {
                method: 'POST',
                body: formData
              });
              
              clearInterval(interval);
              progressFill.style.width = '100%';
              progressText.textContent = 'Complete!';
              
              if (response.ok) {
                const result = await response.json();
                setTimeout(() => {
                  progressSection.classList.remove('visible');
                  completeSection.classList.add('visible');
                  completeMessage.textContent = result.uploaded + ' photo' + (result.uploaded !== 1 ? 's' : '') + ' uploaded! Return to Filadex on your computer to process and import them.';
                }, 600);
              } else {
                const error = await response.json();
                alert('Upload failed: ' + (error.message || 'Unknown error'));
                progressSection.classList.remove('visible');
                previewSection.classList.add('visible');
              }
            } catch (error) {
              alert('Upload failed: ' + error.message);
              progressSection.classList.remove('visible');
              previewSection.classList.add('visible');
            }
          });
        </script>
      </body>
      </html>
    `);
  });
}
