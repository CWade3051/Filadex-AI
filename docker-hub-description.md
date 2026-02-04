# Filadex-AI - 3D Printing Filament Management with AI Photo Import

Filadex-AI is an enhanced fork of Filadex with **AI-powered photo import** capabilities. Upload photos of your filament spools and let AI automatically extract manufacturer, material, color, print settings, and more.

![Filadex Logo](https://raw.githubusercontent.com/CWade3051/Filadex-AI/main/public/logo.svg)

## 🆕 AI-Powered Features

- **📸 Photo Import**: Upload spool photos, AI extracts all data automatically
- **📱 Mobile Upload**: Scan QR code to upload photos from your phone
- **🏷️ Brand Recognition**: Recognizes Bambu Lab, Sunlu, Polymaker, Hatchbox, and more
- **✍️ Handwritten Labels**: Reads handwritten notes on foil-wrapped spools
- **📦 Bulk Import**: Process 50+ photos at once
- **🔒 Secure API Keys**: Your OpenAI key is encrypted with AES-256-GCM

## Screenshots

| Light Mode | Dark Mode |
|------------|-----------|
| ![Light Mode](https://raw.githubusercontent.com/CWade3051/Filadex-AI/main/screenshot-white.png) | ![Dark Mode](https://raw.githubusercontent.com/CWade3051/Filadex-AI/main/screenshot-black.png) |

## Features

### Core Features
- **Filament Inventory Management**: Track all your filaments in one place
- **Material & Color Visualization**: See your collection distribution at a glance
- **Usage Tracking**: Monitor remaining filament percentages with min/max filters
- **Statistics Dashboard**: Get insights into your filament collection
- **Self-hosted**: Keep your data private and secure
- **User Management**: Admin interface for managing users
- **Multi-language Support**: English and German

### AI-Enhanced Features
- **AI Photo Import**: Extract data from photos using OpenAI Vision
- **Mobile QR Upload**: Upload from phone via QR code
- **Configurable AI Model**: Choose your preferred OpenAI model
- **Smart Material Normalization**: Understands PLA+, PETG-HF, TPU 95A, etc.
- **Sealed/Opened Tracking**: AI detects if spool is still sealed
- **Storage Location System**: Two-tier storage with pre-defined locations

## Quick Start

```yaml
# docker-compose.yml
services:
  db:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: filadex
      POSTGRES_PASSWORD: filadex
      POSTGRES_DB: filadex
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U filadex"]
      interval: 5s
      timeout: 5s
      retries: 5

  app:
    image: cwade3051/filadex-ai:latest
    environment:
      - NODE_ENV=production
      - PORT=8080
      - PGHOST=db
      - PGPORT=5432
      - PGUSER=filadex
      - PGPASSWORD=filadex
      - PGDATABASE=filadex
      - DATABASE_URL=postgres://filadex:filadex@db:5432/filadex
      - INIT_SAMPLE_DATA=true
      - HOST_IP=YOUR_LOCAL_IP  # Required for mobile QR uploads
    depends_on:
      db:
        condition: service_healthy
    ports:
      - "8080:8080"
    volumes:
      - filament_uploads:/app/public/uploads

volumes:
  postgres_data:
  filament_uploads:
```

```bash
docker compose up -d
```

Access at http://localhost:8080
- Username: `admin`
- Password: `admin` (change on first login)

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Application port | 8080 |
| `HOST_IP` | Your LAN IP (for mobile QR) | Required |
| `INIT_SAMPLE_DATA` | Seed materials, locations | true |
| `OPENAI_API_KEY` | OpenAI API key (optional) | - |
| `DEFAULT_LANGUAGE` | Default language (en/de) | en |
| `LOG_LEVEL` | Logging level | INFO |

## Using AI Photo Import

1. **Add API Key**: Settings → OpenAI API Key
2. **Open Import**: Tools → Import from Photos
3. **Upload Photos**: Drag-drop or scan QR code for mobile
4. **Review Data**: AI extracts all fields, edit as needed
5. **Import**: Click "Import Selected"

## Project Links

- **GitHub**: [https://github.com/CWade3051/Filadex-AI](https://github.com/CWade3051/Filadex-AI)
- **Original Filadex**: [https://github.com/the-luddite/filadex](https://github.com/the-luddite/filadex)

## Credits

- **Original Filadex**: Paul Nothaft
- **AI Features**: Charles Wade

## License

MIT License

---

© 2026 Copyright by Paul Nothaft and AI Features by Charles Wade
Made with ❤️ for the 3D printing community
