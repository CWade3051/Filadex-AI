#!/bin/bash
# =============================================================================
# Reset Local Development Environment (DESTRUCTIVE)
# =============================================================================

cd "$(dirname "$0")/.."

echo "⚠️  WARNING: This will DELETE all local development data!"
echo "   - All filaments will be deleted"
echo "   - All uploaded images will be deleted"
echo "   - Admin user will be reset to admin/admin"
echo ""
read -p "Are you sure you want to reset? (type 'yes' to confirm): " confirm

if [ "$confirm" != "yes" ]; then
    echo "❌ Reset cancelled"
    exit 1
fi

echo ""
echo "🗑️  Resetting Local Development Environment..."

# Stop dev server if running
if lsof -ti:5001 > /dev/null 2>&1; then
    echo "📴 Stopping development server..."
    lsof -ti:5001 | xargs kill -9 2>/dev/null || true
fi

# Stop and remove dev database with volumes
echo "📦 Removing development database and data..."
docker compose -f docker-compose.dev.yml down -v

# Clear local uploads folder
echo "🖼️  Clearing local uploads..."
rm -rf public/uploads/filaments/*

# Start fresh database
echo "📦 Starting fresh development database..."
docker compose -f docker-compose.dev.yml up -d
sleep 3

# Push schema
echo "🔧 Creating database schema..."
npx drizzle-kit push

echo ""
echo "✅ Local development environment reset complete!"
echo "   Run ./scripts/run.sh to start the development server"
echo "   Login: admin / admin"
echo ""
echo "💡 TIP: Clear your browser cache/localStorage to remove any"
echo "   cached review data from the previous session."
echo "   (In Chrome: Developer Tools > Application > Local Storage > Clear)"
