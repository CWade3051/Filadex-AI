#!/bin/bash
# =============================================================================
# Backup Local Development Environment
# =============================================================================

set -e
cd "$(dirname "$0")/.."

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="backups"
BACKUP_NAME="filadex_dev_backup_${TIMESTAMP}"
BACKUP_PATH="${BACKUP_DIR}/${BACKUP_NAME}"

echo "📦 Backing up Filadex Local Development Environment..."
echo ""

# Create backup directory
mkdir -p "${BACKUP_DIR}"
mkdir -p "${BACKUP_PATH}"

# Check if dev database is running
if ! docker ps --format '{{.Names}}' | grep -q 'filadex-db-dev'; then
    echo "❌ Development database is not running. Start it first with ./scripts/run.sh"
    exit 1
fi

# Backup database (includes all tables)
echo "💾 Backing up database..."
echo "   Tables: users, filaments, print_jobs, filament_history, slicer_profiles,"
echo "           filament_slicer_profiles, upload_sessions, pending_uploads,"
echo "           material_compatibility, user_sharing, manufacturers, materials,"
echo "           colors, diameters, storage_locations, backup_history"
docker exec filadex-db-dev pg_dump -U filadex_dev -d filadex_dev > "${BACKUP_PATH}/database.sql"
DB_SIZE=$(wc -c < "${BACKUP_PATH}/database.sql" | tr -d ' ')
echo "   ✅ Database backup: $(numfmt --to=iec-i --suffix=B $DB_SIZE 2>/dev/null || echo "${DB_SIZE} bytes")"

# Backup uploaded images
echo "🖼️  Backing up uploaded images..."
if [ -d "public/uploads/filaments" ] && [ "$(ls -A public/uploads/filaments 2>/dev/null)" ]; then
    cp -r public/uploads/filaments "${BACKUP_PATH}/images"
    IMG_COUNT=$(find "${BACKUP_PATH}/images" -type f 2>/dev/null | wc -l | tr -d ' ')
    echo "   ✅ Filament images: ${IMG_COUNT} files"
else
    mkdir -p "${BACKUP_PATH}/images"
    echo "   (No images to backup)"
fi

# Backup slicer profiles
echo "📄 Backing up slicer profiles..."
if [ -d "uploads/profiles" ] && [ "$(ls -A uploads/profiles 2>/dev/null)" ]; then
    cp -r uploads/profiles "${BACKUP_PATH}/profiles"
    PROFILE_COUNT=$(find "${BACKUP_PATH}/profiles" -type f 2>/dev/null | wc -l | tr -d ' ')
    echo "   ✅ Slicer profiles: ${PROFILE_COUNT} files"
else
    mkdir -p "${BACKUP_PATH}/profiles"
    echo "   (No slicer profiles to backup)"
fi

# Create zip archive
echo "🗜️  Creating zip archive..."
cd "${BACKUP_DIR}"
zip -rq "${BACKUP_NAME}.zip" "${BACKUP_NAME}"
rm -rf "${BACKUP_NAME}"
cd ..

ZIP_SIZE=$(wc -c < "${BACKUP_DIR}/${BACKUP_NAME}.zip" | tr -d ' ')
echo ""
echo "✅ Backup complete!"
echo "   Location: ${BACKUP_DIR}/${BACKUP_NAME}.zip"
echo "   Size: $(numfmt --to=iec-i --suffix=B $ZIP_SIZE 2>/dev/null || echo "${ZIP_SIZE} bytes")"