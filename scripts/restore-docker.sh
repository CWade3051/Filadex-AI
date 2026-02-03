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
    echo "  [$i] $(basename "$backup")"
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
docker exec -i filadex-db-1 psql -U filadex -d filadex -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;" > /dev/null 2>&1
docker exec -i filadex-db-1 psql -U filadex -d filadex < "${TEMP_DIR}/${EXTRACTED_DIR}/database.sql" > /dev/null 2>&1

# Restore images to Docker volume
echo "🖼️  Restoring uploaded images..."
docker exec filadex-app-1 rm -rf /app/public/uploads/filaments/* 2>/dev/null || true
if [ -d "${TEMP_DIR}/${EXTRACTED_DIR}/images" ] && [ "$(ls -A ${TEMP_DIR}/${EXTRACTED_DIR}/images 2>/dev/null)" ]; then
    docker cp "${TEMP_DIR}/${EXTRACTED_DIR}/images/." filadex-app-1:/app/public/uploads/filaments/
fi

# Cleanup
rm -rf "$TEMP_DIR"

echo ""
echo "✅ Restore complete!"
echo "   Access at http://localhost:8080"
