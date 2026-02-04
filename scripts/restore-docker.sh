#!/bin/bash
# =============================================================================
# Restore Production Docker Environment from Backup
# =============================================================================

set -e
cd "$(dirname "$0")/.."

BACKUP_DIR="backups"

# List available backups
echo "📦 Available Production Docker Backups:"
echo ""

if [ ! -d "${BACKUP_DIR}" ] || [ -z "$(ls -A ${BACKUP_DIR}/*prod*.zip 2>/dev/null)" ]; then
    echo "❌ No production backups found in ${BACKUP_DIR}/"
    exit 1
fi

# Show available backups with numbers
i=1
declare -a backups
for backup in ${BACKUP_DIR}/*prod*.zip; do
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
echo "🔴 WARNING: This will OVERWRITE all PRODUCTION data!"
echo "   - All users, filaments, print jobs, history will be replaced"
echo "   - All uploaded images and slicer profiles will be replaced"
echo "   Selected: $(basename "$BACKUP_FILE")"
echo ""
read -p "Are you sure? (type 'RESTORE PRODUCTION' to confirm): " confirm

if [ "$confirm" != "RESTORE PRODUCTION" ]; then
    echo "❌ Restore cancelled"
    exit 1
fi

echo ""
echo "📦 Restoring from $(basename "$BACKUP_FILE")..."

# Check if prod containers are running
if ! docker ps --format '{{.Names}}' | grep -q 'filadex-db-1'; then
    echo "📦 Starting production containers..."
    docker compose up -d
    sleep 5
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
docker exec -i filadex-db-1 psql -U filadex -d filadex -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;" > /dev/null 2>&1
docker exec -i filadex-db-1 psql -U filadex -d filadex < "${TEMP_DIR}/${EXTRACTED_DIR}/database.sql" > /dev/null 2>&1
echo "   ✅ Database restored"

# Restore images to Docker volume
echo "🖼️  Restoring uploaded images..."
docker exec filadex-app-1 rm -rf /app/public/uploads/filaments/* 2>/dev/null || true
docker exec filadex-app-1 mkdir -p /app/public/uploads/filaments 2>/dev/null || true
if [ -d "${TEMP_DIR}/${EXTRACTED_DIR}/images" ] && [ "$(ls -A ${TEMP_DIR}/${EXTRACTED_DIR}/images 2>/dev/null)" ]; then
    docker cp "${TEMP_DIR}/${EXTRACTED_DIR}/images/." filadex-app-1:/app/public/uploads/filaments/
    IMG_COUNT=$(find "${TEMP_DIR}/${EXTRACTED_DIR}/images" -type f 2>/dev/null | wc -l | tr -d ' ')
    echo "   ✅ Restored ${IMG_COUNT} filament images"
else
    echo "   (No images to restore)"
fi

# Restore slicer profiles to Docker volume
echo "📄 Restoring slicer profiles..."
docker exec filadex-app-1 rm -rf /app/uploads/profiles/* 2>/dev/null || true
docker exec filadex-app-1 mkdir -p /app/uploads/profiles 2>/dev/null || true
if [ -d "${TEMP_DIR}/${EXTRACTED_DIR}/profiles" ] && [ "$(ls -A ${TEMP_DIR}/${EXTRACTED_DIR}/profiles 2>/dev/null)" ]; then
    docker cp "${TEMP_DIR}/${EXTRACTED_DIR}/profiles/." filadex-app-1:/app/uploads/profiles/
    PROFILE_COUNT=$(find "${TEMP_DIR}/${EXTRACTED_DIR}/profiles" -type f 2>/dev/null | wc -l | tr -d ' ')
    echo "   ✅ Restored ${PROFILE_COUNT} slicer profiles"
else
    echo "   (No slicer profiles to restore)"
fi

# Cleanup
rm -rf "$TEMP_DIR"

echo ""
echo "✅ Restore complete!"
echo "   Access at http://localhost:8080"
echo ""
echo "💡 TIP: Clear your browser cache/localStorage after restore"
echo "   to avoid conflicts with the previous session."