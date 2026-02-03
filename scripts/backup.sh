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

# Create backup directory
mkdir -p "${BACKUP_DIR}"
mkdir -p "${BACKUP_PATH}"

# Check if dev database is running
if ! docker ps --format '{{.Names}}' | grep -q 'filadex-db-dev'; then
    echo "❌ Development database is not running. Start it first with ./scripts/run.sh"
    exit 1
fi

# Backup database
echo "💾 Backing up database..."
docker exec filadex-db-dev pg_dump -U filadex_dev -d filadex_dev > "${BACKUP_PATH}/database.sql"

# Backup uploaded images
echo "🖼️  Backing up uploaded images..."
if [ -d "public/uploads/filaments" ] && [ "$(ls -A public/uploads/filaments 2>/dev/null)" ]; then
    cp -r public/uploads/filaments "${BACKUP_PATH}/images"
else
    mkdir -p "${BACKUP_PATH}/images"
    echo "   (No images to backup)"
fi

# Create zip archive
echo "🗜️  Creating zip archive..."
cd "${BACKUP_DIR}"
zip -r "${BACKUP_NAME}.zip" "${BACKUP_NAME}"
rm -rf "${BACKUP_NAME}"
cd ..

echo ""
echo "✅ Backup complete!"
echo "   Location: ${BACKUP_DIR}/${BACKUP_NAME}.zip"
