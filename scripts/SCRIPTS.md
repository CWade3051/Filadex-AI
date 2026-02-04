# Filadex-AI Management Scripts

This folder contains shell scripts for managing both local development and Docker production environments.

## Quick Reference

| Script | Environment | Purpose |
|--------|-------------|---------|
| `setup-local.sh` | Local Dev | Initial setup (prereqs, npm install) |
| `setup-docker.sh` | Docker | Initial Docker setup with IP config |
| `run.sh` | Local Dev | Start development server |
| `run-docker.sh` | Docker | Start production containers |
| `shutdown.sh` | Local Dev | Stop development server |
| `shutdown-docker.sh` | Docker | Stop production containers |
| `backup.sh` | Local Dev | Backup database + images |
| `backup-docker.sh` | Docker | Backup database + images |
| `restore.sh` | Local Dev | Restore from backup |
| `restore-docker.sh` | Docker | Restore from backup |
| `reset.sh` | Local Dev | Reset to fresh state |
| `reset-docker.sh` | Docker | Reset to fresh state |

---

## Setup Scripts

### `setup-local.sh`
**Purpose:** Initial setup for local development environment.

**What it does:**
1. Checks if Node.js v16+ is installed
2. Checks if PostgreSQL client is available
3. Creates `.env` file from `.env.example` if not exists
4. Runs `npm install` to install dependencies
5. Checks if `DATABASE_URL` is configured

**Usage:**
```bash
./scripts/setup-local.sh
```

**When to use:** First time setting up local development on a new machine.

---

### `setup-docker.sh`
**Purpose:** Initial setup for Docker production environment.

**What it does:**
1. Checks if Docker and Docker Compose are installed
2. Creates `docker-compose.yml` from template (or keeps existing)
3. Detects your local IP address for mobile QR code uploads
4. Updates `HOST_IP` in docker-compose.yml
5. Pulls the latest Docker image

**Usage:**
```bash
./scripts/setup-docker.sh
```

**When to use:** First time setting up Docker deployment, or when you need to reconfigure your IP address.

**Interactive prompts:**
- Whether to overwrite existing docker-compose.yml
- Confirm detected IP or enter manually

---

## Run Scripts

### `run.sh`
**Purpose:** Start the local development environment.

**What it does:**
1. Starts the dev PostgreSQL container (`filadex-db-dev`) if not running
2. Waits for database to be ready
3. Kills any process on port 5001 (if occupied)
4. Runs `npm run dev` to start the development server

**Usage:**
```bash
./scripts/run.sh
```

**Access:** http://localhost:5001
**Login:** admin / admin

**Note:** This runs in foreground. Press `Ctrl+C` to stop.

---

### `run-docker.sh`
**Purpose:** Start the Docker production environment.

**What it does:**
1. Pulls the latest Docker image from Docker Hub
2. Starts both `filadex-db-1` (PostgreSQL) and `filadex-app-1` (application) containers
3. Shows container status

**Usage:**
```bash
./scripts/run-docker.sh
```

**Access:** http://localhost:8080
**Login:** admin / admin

---

## Shutdown Scripts

### `shutdown.sh`
**Purpose:** Stop the local development environment.

**What it does:**
1. Kills the development server process on port 5001
2. Stops the dev PostgreSQL container

**Usage:**
```bash
./scripts/shutdown.sh
```

**Note:** Data is preserved. Use `run.sh` to start again.

---

### `shutdown-docker.sh`
**Purpose:** Stop the Docker production containers.

**What it does:**
1. Stops `filadex-app-1` and `filadex-db-1` containers
2. Containers are stopped but not removed

**Usage:**
```bash
./scripts/shutdown-docker.sh
```

**Note:** Data is preserved in Docker volumes. Use `run-docker.sh` to start again.

---

## Backup Scripts

### `backup.sh`
**Purpose:** Create a backup of local development data.

**What it does:**
1. Checks if dev database is running (starts it if needed)
2. Exports database to SQL file using `pg_dump`
3. Copies uploaded images from `public/uploads/filaments/`
4. Creates timestamped zip archive

**Usage:**
```bash
./scripts/backup.sh
```

**Output:** `backups/filadex_dev_backup_YYYYMMDD_HHMMSS.zip`

**Requirements:** Dev database must be running.

---

### `backup-docker.sh`
**Purpose:** Create a backup of Docker production data.

**What it does:**
1. Checks if production containers are running
2. Exports database from Docker container using `pg_dump`
3. Copies uploaded images from Docker volume
4. Creates timestamped zip archive

**Usage:**
```bash
./scripts/backup-docker.sh
```

---

### What's Included in Backups

Both backup scripts create a zip archive containing:

```
filadex_backup_YYYYMMDD_HHMMSS/
├── database.sql    # Full PostgreSQL dump (all tables below)
└── images/         # All uploaded filament photos
    ├── filament-xxxxx.jpeg
    └── ...
```

#### Database Tables Included

| Table | Description | Key Fields |
|-------|-------------|------------|
| `users` | User accounts | username, password (bcrypt hashed), is_admin, openai_api_key (AES encrypted), settings |
| `filaments` | Filament inventory | name, manufacturer, material, color, weight, temps, storage location, image_url, notes |
| `manufacturers` | Manufacturer list | name, sort_order |
| `materials` | Material types | name, sort_order |
| `colors` | Color definitions | name, hex code |
| `diameters` | Filament diameters | value (1.75, 2.85) |
| `storage_locations` | Storage locations | name, description, capacity |
| `user_sharing` | Sharing settings | user_id, material_id, is_public |

#### Users Table Details

| Field | Description | Security |
|-------|-------------|----------|
| `id` | Unique user ID | - |
| `username` | Login username | Plain text |
| `password` | Login password | **Bcrypt hashed** (cannot be reversed) |
| `is_admin` | Admin privileges | Boolean |
| `force_change_password` | Must change password on login | Boolean |
| `language` | UI language preference | en, de |
| `currency` | Currency setting | EUR, USD, etc. |
| `temperature_unit` | Temp display unit | C or F |
| `openai_api_key` | User's OpenAI API key | **AES-256-GCM encrypted** |
| `openai_model` | Selected AI model | gpt-4o, etc. |
| `last_login` | Last login timestamp | DateTime |
| `created_at` | Account creation date | DateTime |

#### Filaments Table Details

| Field | Description |
|-------|-------------|
| `id` | Unique filament ID |
| `name` | Display name |
| `manufacturer` | Brand/manufacturer |
| `material` | Material type (PLA, PETG, etc.) |
| `color_name` | Color name |
| `color_code` | Hex color code |
| `diameter` | Filament diameter (1.75, 2.85) |
| `print_temp` | Recommended print temperature |
| `bed_temp` | Recommended bed temperature |
| `print_speed` | Recommended print speed |
| `total_weight` | Spool weight in grams |
| `remaining_percentage` | Percentage remaining |
| `purchase_date` | When purchased |
| `purchase_price` | Purchase cost |
| `status` | sealed/opened |
| `spool_type` | Spool type info |
| `dryer_count` | Times dried |
| `last_drying_date` | Last dried date |
| `storage_location` | Main storage location |
| `location_details` | Sub-location details |
| `notes` | Additional notes |
| `image_url` | Path to spool photo |
| `user_id` | Owner user ID |
| `created_at` | Entry creation date |
| `updated_at` | Last modified date |

#### Security Notes

- **Passwords are bcrypt hashed** - Even with database access, passwords cannot be recovered
- **API keys are AES-256-GCM encrypted** - Secure even if backup file is compromised
- **Backup files are gitignored** - Never committed to repository
- **Keep backups secure** - They contain all user data

**Output:** `backups/filadex_prod_backup_YYYYMMDD_HHMMSS.zip`

**Backup contents:**
- `database.sql` - Full database dump
- `images/` - All uploaded filament photos

**Requirements:** Docker containers must be running.

---

## Restore Scripts

### `restore.sh`
**Purpose:** Restore local development environment from a backup.

**What it does:**
1. Lists available dev backups (`*dev*.zip`)
2. Prompts user to select a backup
3. Starts dev database if not running
4. Drops and recreates database schema
5. Imports database from backup SQL
6. Restores images to `public/uploads/filaments/`

**Usage:**
```bash
./scripts/restore.sh
```

**Interactive prompts:**
- Select backup number (1, 2, 3, etc.)
- Confirm with "yes"

**⚠️ Warning:** This OVERWRITES all local development data!

---

### `restore-docker.sh`
**Purpose:** Restore Docker production environment from a backup.

**What it does:**
1. Lists available prod backups (`*prod*.zip`)
2. Prompts user to select a backup
3. Starts containers if not running
4. Drops and recreates database schema
5. Imports database from backup SQL
6. Restores images to Docker volume

**Usage:**
```bash
./scripts/restore-docker.sh
```

**Interactive prompts:**
- Select backup number (1, 2, 3, etc.)
- Confirm with "RESTORE PRODUCTION"

**⚠️ Warning:** This OVERWRITES all production data!

---

## Reset Scripts

### `reset.sh`
**Purpose:** Reset local development environment to fresh state.

**What it does:**
1. Stops dev server if running
2. Removes dev database container and volume
3. Clears uploaded images from `public/uploads/filaments/`
4. Starts fresh database container
5. Runs `npx drizzle-kit push` to create schema
6. Seeds initial data:
   - 28 materials (PLA, PETG, TPU variants, etc.)
   - 2 diameters (1.75mm, 2.85mm)
   - 15 storage locations
   - 15 manufacturers
   - 16 colors

**Usage:**
```bash
./scripts/reset.sh
```

**Interactive prompt:** Confirm with "yes"

**⚠️ Warning:** This DELETES all local development data!

**After reset:**
- Login: admin / admin
- Clear browser localStorage for clean state

---

### `reset-docker.sh`
**Purpose:** Reset Docker production environment to fresh state.

**What it does:**
1. Stops and removes all containers
2. Removes Docker volumes (database + uploads)
3. Pulls latest Docker image
4. Starts fresh containers
5. Waits for database initialization
6. Seeds initial data:
   - 28 materials (PLA, PETG, TPU variants, etc.)
   - 2 diameters (1.75mm, 2.85mm)
   - 15 storage locations
   - 15 manufacturers
   - 16 colors

**Usage:**
```bash
./scripts/reset-docker.sh
```

**Interactive prompt:** Confirm with "RESET PRODUCTION"

**⚠️ Warning:** This DELETES all production data!

**After reset:**
- Access: http://localhost:8080
- Login: admin / admin
- Clear browser localStorage for clean state

---

## Seeded Data After Reset

Both reset scripts seed the following data:

### Materials (28)
- **PLA variants:** PLA, PLA Basic, PLA+, PLA Support, PLA Silk, PLA Matte, PLA-CF, PLA Marble, PLA Metal, PLA Sparkle, PLA Galaxy, PLA Glow, PLA Wood, PLA Translucent
- **PETG variants:** PETG, PETG Basic, PETG-HF, PETG-CF, PETG Translucent
- **TPU variants:** TPU, TPU 95A, TPU 80A, TPU for AMS
- **Others:** ABS, ASA, PA, PC, Support For PLA/PETG

### Diameters (2)
- 1.75mm
- 2.85mm

### Storage Locations (15)
- A - Bedroom Shelf (45 capacity)
- B - Sealable Storage (12 capacity)
- C - Sealable Zip-up (24 capacity)
- D - Sealable Zip-up (24 capacity)
- E - Rod Above Printer (8 capacity)
- F - 9-Level Rack (81 capacity)
- AMS HT - H2C 1, H2C 2, P2S (1 each)
- AMS Pro 2 - H2C 1, H2C 2, P2S (4 each)
- FLSUN S1 Pro (1 capacity)
- Creality Dryer (2 capacity)
- Polymaker Dryer (1 capacity)

### Manufacturers (15)
Bambu Lab, Sunlu, Polymaker, Hatchbox, eSUN, Overture, Prusament, Inland, Creality, Snapmaker, Elegoo, Eryone, TTYT3D, Duramic, Amazon Basics

### Colors (16)
Black, White, Red, Blue, Green, Yellow, Orange, Purple, Pink, Gray, Silver, Gold, Brown, Magenta, Cyan, Transparent

---

## Backup File Location

All backups are stored in the `backups/` folder at the project root:

```
filadex/
├── backups/
│   ├── filadex_dev_backup_20260204_103000.zip   # Dev backup
│   ├── filadex_prod_backup_20260204_103000.zip  # Prod backup
│   └── .gitkeep
```

**Note:** Backups are gitignored and not committed to the repository.

---

## Common Workflows

### Fresh Start (Docker)
```bash
./scripts/setup-docker.sh    # First time setup
./scripts/run-docker.sh      # Start the application
```

### Daily Development (Local)
```bash
./scripts/run.sh             # Start development
# ... make changes ...
# Ctrl+C to stop
./scripts/shutdown.sh        # Or just Ctrl+C
```

### Before Major Changes
```bash
./scripts/backup-docker.sh   # Backup first!
# ... make changes ...
# If something goes wrong:
./scripts/restore-docker.sh  # Restore backup
```

### Starting Fresh
```bash
./scripts/reset-docker.sh    # Wipe and reseed
# Clear browser localStorage
# Login with admin/admin
```
