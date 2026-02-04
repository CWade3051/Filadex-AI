#!/bin/bash
# =============================================================================
# Backup Production Docker Environment
# =============================================================================

set -e
cd "$(dirname "$0")/.."

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="backups"
BACKUP_NAME="filadex_prod_backup_${TIMESTAMP}"
BACKUP_PATH="${BACKUP_DIR}/${BACKUP_NAME}"

echo "📦 Backing up Filadex Production Docker Environment..."
echo ""

# Create backup directory
mkdir -p "${BACKUP_DIR}"
mkdir -p "${BACKUP_PATH}"

# Check if prod database is running
if ! docker ps --format '{{.Names}}' | grep -q 'filadex-db-1'; then
    echo "❌ Production database is not running. Start it first with ./scripts/run-docker.sh"
    exit 1
fi

# Backup database (includes all tables)
echo "💾 Backing up database..."
echo "   Tables: users, filaments, print_jobs, filament_history, slicer_profiles,"
echo "           material_compatibility, user_sharing, manufacturers, materials,"
echo "           colors, diameters, storage_locations, backup_history"
docker exec filadex-db-1 pg_dump -U filadex -d filadex > "${BACKUP_PATH}/database.sql"
DB_SIZE=$(wc -c < "${BACKUP_PATH}/database.sql" | tr -d ' ')
echo "   ✅ Database backup: $(numfmt --to=iec-i --suffix=B $DB_SIZE 2>/dev/null || echo "${DB_SIZE} bytes")"

# Backup uploaded images from Docker volume
echo "🖼️  Backing up uploaded images..."
mkdir -p "${BACKUP_PATH}/images"
if docker cp filadex-app-1:/app/public/uploads/filaments/. "${BACKUP_PATH}/images/" 2>/dev/null; then
    IMG_COUNT=$(find "${BACKUP_PATH}/images" -type f 2>/dev/null | wc -l | tr -d ' ')
    if [ "$IMG_COUNT" -gt 0 ]; then
        echo "   ✅ Filament images: ${IMG_COUNT} files"
    else
        echo "   (No images to backup)"
    fi
else
    echo "   (No images to backup)"
fi

# Backup slicer profiles from Docker volume
echo "📄 Backing up slicer profiles..."
mkdir -p "${BACKUP_PATH}/profiles"
if docker cp filadex-app-1:/app/uploads/profiles/. "${BACKUP_PATH}/profiles/" 2>/dev/null; then
    PROFILE_COUNT=$(find "${BACKUP_PATH}/profiles" -type f 2>/dev/null | wc -l | tr -d ' ')
    if [ "$PROFILE_COUNT" -gt 0 ]; then
        echo "   ✅ Slicer profiles: ${PROFILE_COUNT} files"
    else
        echo "   (No slicer profiles to backup)"
    fi
else
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
