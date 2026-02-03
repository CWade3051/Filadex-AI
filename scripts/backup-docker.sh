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

# Create backup directory
mkdir -p "${BACKUP_DIR}"
mkdir -p "${BACKUP_PATH}"

# Check if prod database is running
if ! docker ps --format '{{.Names}}' | grep -q 'filadex-db-1'; then
    echo "❌ Production database is not running. Start it first with ./scripts/run-docker.sh"
    exit 1
fi

# Backup database
echo "💾 Backing up database..."
docker exec filadex-db-1 pg_dump -U filadex -d filadex > "${BACKUP_PATH}/database.sql"

# Backup uploaded images from Docker volume
echo "🖼️  Backing up uploaded images..."
mkdir -p "${BACKUP_PATH}/images"
docker cp filadex-app-1:/app/public/uploads/filaments/. "${BACKUP_PATH}/images/" 2>/dev/null || echo "   (No images to backup)"

# Create zip archive
echo "🗜️  Creating zip archive..."
cd "${BACKUP_DIR}"
zip -r "${BACKUP_NAME}.zip" "${BACKUP_NAME}"
rm -rf "${BACKUP_NAME}"
cd ..

echo ""
echo "✅ Backup complete!"
echo "   Location: ${BACKUP_DIR}/${BACKUP_NAME}.zip"
