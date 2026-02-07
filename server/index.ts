import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import multer from "multer";
import cookieParser from "cookie-parser";
import { registerRoutes } from "./routes/index";
import { setupVite, serveStatic, log } from "./vite";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    let status = err.status || err.statusCode || 500;
    let message = err.message || "Internal Server Error";
    
    if (err instanceof multer.MulterError) {
      status = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
      if (err.code === "LIMIT_FILE_COUNT") {
        message =
          typeof err.limit === "number"
            ? `Too many files uploaded at once. Please upload up to ${err.limit} files per batch.`
            : "Too many files uploaded at once. Please upload fewer files per batch.";
      } else if (err.code === "LIMIT_FILE_SIZE") {
        message =
          typeof err.limit === "number"
            ? `File too large. Max size is ${Math.round(err.limit / (1024 * 1024))}MB.`
            : "File too large.";
      } else if (err.code === "LIMIT_UNEXPECTED_FILE") {
        message = "Unexpected file field in upload.";
      }
    } else if (typeof message === "string" && message.startsWith("Invalid file type")) {
      status = 400;
    }

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // Use PORT environment variable or default to 5000
  // For local Docker deployment, use port 10200
  const port = parseInt(process.env.PORT || "5000", 10);
  server.listen(port, "0.0.0.0", () => {
    log(`serving on port ${port}`);
  });
})();
