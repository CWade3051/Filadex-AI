#!/bin/bash
# =============================================================================
# Restore Local Development Environment from Backup
# =============================================================================

set -e
cd "$(dirname "$0")/.."

BACKUP_DIR="backups"

# List available backups
echo "📦 Available Local Development Backups:"
echo ""

if [ ! -d "${BACKUP_DIR}" ] || [ -z "$(ls -A ${BACKUP_DIR}/*dev*.zip 2>/dev/null)" ]; then
    echo "❌ No backups found in ${BACKUP_DIR}/"
    exit 1
fi

# Show available backups with numbers
i=1
declare -a backups
for backup in ${BACKUP_DIR}/*dev*.zip; do
    backups[$i]="$backup"
    SIZE=$(wc -c < "$backup" | tr -d ' ')
    SIZE_HUMAN=$(numfmt --to=iec-i --suffix=B $SIZE 2>/dev/null || echo "${SIZE} bytes")
    echo "  [$i] $(basename "$backup") ($SIZE_HUMAN)"
    ((i++))
done

echo ""
read -p "Select backup to restore (1-$((i-1))): " selection

if [ -z "${backups[$selection]}" ]; then
    echo "❌ Invalid selection"
    exit 1
fi

BACKUP_FILE="${backups[$selection]}"
echo ""
echo "⚠️  WARNING: This will OVERWRITE all local development data!"
echo "   - All users, filaments, print jobs, history will be replaced"
echo "   - All uploaded images and slicer profiles will be replaced"
echo "   Selected: $(basename "$BACKUP_FILE")"
echo ""
read -p "Are you sure? (type 'yes' to confirm): " confirm

if [ "$confirm" != "yes" ]; then
    echo "❌ Restore cancelled"
    exit 1
fi

echo ""
echo "📦 Restoring from $(basename "$BACKUP_FILE")..."

# Check if dev database is running
if ! docker ps --format '{{.Names}}' | grep -q 'filadex-db-dev'; then
    echo "📦 Starting development database..."
    docker compose -f docker-compose.dev.yml up -d
    sleep 3
fi

# Create temp directory for extraction
TEMP_DIR=$(mktemp -d)
unzip -q "$BACKUP_FILE" -d "$TEMP_DIR"
EXTRACTED_DIR=$(ls "$TEMP_DIR")

# Restore database
echo "💾 Restoring database..."
echo "   Tables: users, filaments, print_jobs, filament_history, slicer_profiles,"
echo "           filament_slicer_profiles, material_compatibility, user_sharing,"
echo "           manufacturers, materials, colors, diameters, storage_locations,"
echo "           backup_history"
docker exec -i filadex-db-dev psql -U filadex_dev -d filadex_dev -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;" > /dev/null 2>&1
docker exec -i filadex-db-dev psql -U filadex_dev -d filadex_dev < "${TEMP_DIR}/${EXTRACTED_DIR}/database.sql" > /dev/null 2>&1
echo "   ✅ Database restored"

# Restore images
echo "🖼️  Restoring uploaded images..."
rm -rf public/uploads/filaments/*
if [ -d "${TEMP_DIR}/${EXTRACTED_DIR}/images" ] && [ "$(ls -A ${TEMP_DIR}/${EXTRACTED_DIR}/images 2>/dev/null)" ]; then
    mkdir -p public/uploads/filaments
    cp -r "${TEMP_DIR}/${EXTRACTED_DIR}/images/"* public/uploads/filaments/
    IMG_COUNT=$(find public/uploads/filaments -type f 2>/dev/null | wc -l | tr -d ' ')
    echo "   ✅ Restored ${IMG_COUNT} filament images"
else
    mkdir -p public/uploads/filaments
    echo "   (No images to restore)"
fi

# Restore slicer profiles
echo "📄 Restoring slicer profiles..."
rm -rf uploads/profiles/*
if [ -d "${TEMP_DIR}/${EXTRACTED_DIR}/profiles" ] && [ "$(ls -A ${TEMP_DIR}/${EXTRACTED_DIR}/profiles 2>/dev/null)" ]; then
    mkdir -p uploads/profiles
    cp -r "${TEMP_DIR}/${EXTRACTED_DIR}/profiles/"* uploads/profiles/
    PROFILE_COUNT=$(find uploads/profiles -type f 2>/dev/null | wc -l | tr -d ' ')
    echo "   ✅ Restored ${PROFILE_COUNT} slicer profiles"
else
    mkdir -p uploads/profiles
    echo "   (No slicer profiles to restore)"
fi

# Cleanup
rm -rf "$TEMP_DIR"

echo ""
echo "✅ Restore complete!"
echo "   Run ./scripts/run.sh to start the development server"
echo ""
echo "💡 TIP: Clear your browser cache/localStorage after restore"
echo "   to avoid conflicts with the previous session."