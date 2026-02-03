#!/bin/bash
# =============================================================================
# Reset Production Docker Environment (DESTRUCTIVE)
# =============================================================================

cd "$(dirname "$0")/.."

echo "⚠️  WARNING: This will DELETE all PRODUCTION data!"
echo "   - All filaments will be deleted"
echo "   - All uploaded images will be deleted"  
echo "   - All user accounts will be deleted"
echo "   - Admin user will be reset to admin/admin"
echo ""
echo "🔴 THIS AFFECTS YOUR PRODUCTION DATA!"
echo ""
read -p "Are you sure you want to reset PRODUCTION? (type 'RESET PRODUCTION' to confirm): " confirm

if [ "$confirm" != "RESET PRODUCTION" ]; then
    echo "❌ Reset cancelled"
    exit 1
fi

echo ""
echo "🗑️  Resetting Production Docker Environment..."

# Stop and remove containers with volumes
echo "📦 Removing Docker containers and volumes..."
docker compose down -v

# Start fresh
echo "📦 Starting fresh Docker environment..."
docker compose up -d

echo ""
echo "✅ Production Docker environment reset complete!"
echo "   Access at http://localhost:8080"
echo "   Login: admin / admin"
