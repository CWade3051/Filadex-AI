# Filadex-AI - 3D Printing Filament Management System

<div align="center">
  <img src="public/logo.svg" alt="Filadex Logo" width="200" height="200" style="color: #4f46e5;">
</div>

Filadex-AI is an enhanced fork of the open-source Filadex filament management system, featuring **AI-powered photo import** capabilities. Upload photos of your filament spools and let AI automatically extract manufacturer, material, color, print settings, and more. This project demonstrates the power of AI-assisted development and AI-powered features for practical applications.

> **Fork of:** [Original Filadex](https://github.com/the-luddite/filadex)
> **AI Features by:** Charles Wade

## 🆕 AI-Powered Features

### 📸 Photo Import with AI Vision
- **Automatic Data Extraction**: Upload photos of filament spools and labels - AI extracts manufacturer, material, color, weight, print temp, print speed, bed temp, and more
- **Brand Recognition**: AI recognizes major filament brands (Bambu Lab, Sunlu, Polymaker, Hatchbox, eSUN, Creality, Snapmaker, etc.) from spool appearance
- **Handwritten Label Reading**: Can read handwritten notes on foil-wrapped spools
- **Bulk Import**: Process multiple photos at once - upload 50+ spool photos and import them all
- **Mobile Upload via QR Code**: Scan a QR code with your phone to upload photos directly from your camera roll
- **Editable Fields**: Review and edit any AI-extracted data before import
- **Smart Dropdowns**: All fields use dropdowns with existing values plus ability to add new entries
- **Image Storage**: Photos are saved with each filament entry for reference

### 🔧 Enhanced Filament Tracking
- **Sealed/Opened Status**: Track whether spools are still sealed or have been opened
- **Last Dried Date**: Optional field for tracking when opened spools were last dried
- **Print Speed Field**: Track recommended print speeds for each filament
- **Storage Location System**: Two-tier storage with main locations and sub-location details
- **Notes Field**: Add any additional notes to filament entries
- **Purchase Price & Date**: Track when and how much you paid for each spool

### 🛠️ Management Scripts
- `./scripts/run.sh` - Start local development server
- `./scripts/shutdown.sh` - Stop local development server
- `./scripts/reset.sh` - Reset local dev environment (destructive)
- `./scripts/run-docker.sh` - Start Docker production containers
- `./scripts/shutdown-docker.sh` - Stop Docker production containers
- `./scripts/reset-docker.sh` - Reset Docker environment (destructive)
- `./scripts/backup.sh` / `./scripts/backup-docker.sh` - Backup data
- `./scripts/restore.sh` / `./scripts/restore-docker.sh` - Restore from backup

## 📸 Screenshots

<div align="center">
  <div style="display: flex; flex-wrap: wrap; gap: 10px; justify-content: center;">
    <div style="flex: 1; min-width: 300px;">
      <p><strong>Light Mode</strong></p>
      <img src="screenshot-white.png" alt="Filadex Light Mode" style="width: 100%; border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.1);">
    </div>
    <div style="flex: 1; min-width: 300px;">
      <p><strong>Dark Mode</strong></p>
      <img src="screenshot-black.png" alt="Filadex Dark Mode" style="width: 100%; border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.1);">
    </div>
  </div>
</div>

## 🌟 Features

### Core Features (from original Filadex)
- **Filament Inventory Management**: Track all your filaments in one place
- **Material & Color Visualization**: See your collection distribution at a glance
- **Detailed Filament Properties**: Record manufacturer, material type, color, weight, and more
- **Usage Tracking**: Monitor remaining filament percentages
- **Statistics Dashboard**: Get insights into your filament collection
- **Filtering & Sorting**: Easily find the filament you need (including min/max remaining filters)
- **Responsive Design**: Works on desktop and mobile devices
- **Self-hosted**: Keep your data private and secure
- **User Management**: Admin interface for managing users
- **Filament Sharing**: Share your filament collection with others
- **Multi-language Support**: English and German

### AI-Enhanced Features (this fork)
- **AI Photo Import**: Extract filament data from photos using OpenAI Vision
- **Mobile QR Upload**: Upload photos from your phone via QR code scan
- **Configurable AI Model**: Choose which OpenAI model to use in settings
- **Secure API Key Storage**: User API keys are encrypted with AES-256-GCM
- **Smart Material Normalization**: AI understands material variants (PLA+, PETG-HF, TPU 95A, etc.)
- **Price Estimation**: AI estimates purchase prices based on brand and material
- **Pan/Zoom Image Preview**: Click any filament image to view full-size with pan and zoom

## 📋 Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- PostgreSQL database
- Docker & Docker Compose (recommended for deployment)
- OpenAI API key (for AI photo import features)

## 🚀 Quick Start with Docker

1. **Clone the repository**
```bash
git clone https://github.com/CWade3051/Filadex-AI.git
cd Filadex-AI
```

2. **Create docker-compose.yml**
```bash
cp docker-compose.template.yml docker-compose.yml
```

3. **Configure your local IP** (required for mobile QR uploads)
Edit `docker-compose.yml` and set `HOST_IP` to your machine's IP address:
```yaml
- HOST_IP=192.168.1.100  # Your local IP
```

4. **Start the containers**
```bash
docker compose up -d
```

5. **Access the application**
- URL: http://localhost:8080
- Default login: `admin` / `admin` (you'll be prompted to change it)

6. **Add your OpenAI API key**
- Go to Settings → OpenAI API Key
- Enter your API key to enable AI photo import

## 🔧 Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Application port | 8080 |
| `HOST_IP` | Your machine's IP (for mobile QR) | Required for mobile |
| `DATABASE_URL` | PostgreSQL connection string | - |
| `OPENAI_API_KEY` | OpenAI API key (fallback) | - |
| `INIT_SAMPLE_DATA` | Seed initial data | true |
| `DEFAULT_LANGUAGE` | Default language (en/de) | en |
| `LOG_LEVEL` | Logging level | INFO |

### Storage Locations

The reset scripts pre-populate these storage locations (customize in the scripts):
- A - Bedroom Shelf (45 spools)
- B - Sealable Storage (12 spools)
- C/D - Sealable Zip-up (24 spools each)
- E - Rod Above Printer (8 spools)
- F - 9-Level Rack (81 spools)
- AMS HT/Pro 2 units
- Dryer units (Creality, Polymaker)

### Pre-seeded Materials

28 material types are pre-populated including:
- PLA variants: PLA, PLA+, PLA Silk, PLA Matte, PLA-CF, PLA Marble, PLA Support, etc.
- PETG variants: PETG, PETG-HF, PETG-CF, PETG Translucent
- TPU variants: TPU, TPU 95A, TPU 80A, TPU for AMS
- Others: ABS, ASA, PA, PC, Support For PLA/PETG

## 📱 Using AI Photo Import

1. **Setup**: Add your OpenAI API key in Settings → OpenAI API Key

2. **Open Import Modal**: Click "Tools" → "Import from Photos"

3. **Upload Photos**:
   - **Desktop**: Drag & drop or click to select files
   - **Mobile**: Scan QR code, then upload from camera or photo gallery

4. **Processing**: AI analyzes each photo and extracts:
   - Brand/Manufacturer
   - Material type
   - Color name and hex code
   - Weight
   - Print temperature, speed, bed temp
   - Sealed/Opened status
   - Estimated price

5. **Review & Edit**: 
   - Each field is editable
   - Dropdowns show existing values with option to add new
   - Click thumbnail for full-size pan/zoom preview

6. **Bulk Storage Location**: Set storage location for all items at once

7. **Import**: Click "Import Selected" to add to your inventory

## 🔒 Security

- **Encrypted API Keys**: User OpenAI API keys are encrypted with AES-256-GCM
- **No Plain Text Storage**: Keys are never stored or transmitted in plain text
- **Per-User Keys**: Each user can have their own API key
- **Session-based Auth**: Secure cookie-based authentication
- **Bcrypt Passwords**: User passwords are securely hashed with bcrypt

## 💾 Backup & Restore

Filadex provides multiple backup options to protect your data:

### Web UI Backup (Tools > Cloud Backup)
- **Local Backup**: Download/upload JSON backup files directly in the browser
- **S3-Compatible Storage**: AWS S3, Backblaze B2, Wasabi, MinIO, etc.
- **WebDAV Storage**: Nextcloud, ownCloud, Synology, etc.
- **Admin Full Backup**: Backup all users' data (admin only)

### Shell Script Backup
```bash
./scripts/backup.sh          # Local development
./scripts/backup-docker.sh   # Docker production
./scripts/restore.sh         # Restore local dev
./scripts/restore-docker.sh  # Restore Docker prod
```

### What's Included in Backups

| Data | User Backup | Admin Backup | Shell Backup |
|------|-------------|--------------|--------------|
| Filaments | ✅ Your filaments | ✅ All users | ✅ All |
| Print Jobs | ✅ Your jobs | ✅ All users | ✅ All |
| Filament History | ✅ Your history | ✅ All users | ✅ All |
| Slicer Profiles | ✅ Your profiles | ✅ All users | ✅ All |
| Material Compatibility | ✅ All | ✅ All | ✅ All |
| User Sharing Settings | ✅ Your settings | ✅ All users | ✅ All |
| Backup History | ✅ Your logs | ✅ All logs | ✅ All |
| Users | ❌ | ✅ (no passwords) | ✅ All |
| Images | ❌ | ❌ | ✅ All |
| Slicer Profile Files | ❌ | ❌ | ✅ All |

**Note**: Admin restore creates new users with temporary password "changeme" and forces password change on first login.

## 🗄️ Database Schema

Filadex uses PostgreSQL with the following tables:

| Table | Purpose |
|-------|---------|
| `users` | User accounts, credentials, and settings |
| `filaments` | Filament inventory with all properties |
| `print_jobs` | Print job logging with filament usage |
| `filament_history` | Filament consumption history over time |
| `slicer_profiles` | Slicer profile configurations |
| `material_compatibility` | Material adhesion compatibility matrix |
| `manufacturers` | Filament brands/manufacturers |
| `materials` | Material types (PLA, PETG, TPU, etc.) |
| `colors` | Color definitions with hex codes |
| `diameters` | Filament diameters (1.75mm, 2.85mm) |
| `storage_locations` | Storage locations with capacity |
| `user_sharing` | Public sharing settings |
| `cloud_backup_configs` | Cloud backup provider configurations |
| `backup_history` | Backup/restore operation logs |

### Key Fields in Filaments Table

| Field | Description |
|-------|-------------|
| `name` | Display name for the spool |
| `manufacturer` | Brand (Bambu Lab, Sunlu, etc.) |
| `material` | Type (PLA, PETG, TPU 95A, etc.) |
| `color_name`, `color_code` | Color and hex code |
| `diameter` | 1.75 or 2.85mm |
| `print_temp`, `bed_temp`, `print_speed` | Print settings |
| `total_weight`, `remaining_percentage` | Weight tracking |
| `status` | "sealed" or "opened" |
| `storage_location`, `location_details` | Where it's stored |
| `image_url` | Path to uploaded photo |
| `notes` | Additional notes |
| `purchase_date`, `purchase_price` | Purchase info |

### Security in Database

| Data | Protection |
|------|------------|
| User passwords | Bcrypt hashed (irreversible) |
| OpenAI API keys | AES-256-GCM encrypted |
| Session tokens | HTTP-only secure cookies |

For complete schema details, see `shared/schema.ts`.

## 🤝 Contributing

Contributions are welcome! Please see our [Contributing Guidelines](CONTRIBUTING.md) for more details.

## 📝 Credits

- **Original Filadex**: Created by Paul Nothaft
- **AI Features**: Added by Charles Wade
- **AI Assistance**: Developed with AI coding assistance

## 📜 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgements

- The original Filadex project and community
- OpenAI for the Vision API
- The 3D printing community for inspiration and feedback
- All contributors who help improve this project

---

<div align="center">
  <p>© 2026 Copyright by Paul Nothaft and AI Features by Charles Wade</p>
  <p>Made with ❤️ for the 3D printing community</p>
</div>
