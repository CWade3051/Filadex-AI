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

# Seed initial data
echo "🌱 Seeding initial data..."
PGPASSWORD=filadex_dev psql -h localhost -p 5433 -U filadex_dev -d filadex_dev -v ON_ERROR_STOP=0 -c "
  -- Materials
  INSERT INTO materials (name) VALUES ('PLA') ON CONFLICT DO NOTHING;
  INSERT INTO materials (name) VALUES ('PLA+') ON CONFLICT DO NOTHING;
  INSERT INTO materials (name) VALUES ('PLA Support') ON CONFLICT DO NOTHING;
  INSERT INTO materials (name) VALUES ('PLA Silk') ON CONFLICT DO NOTHING;
  INSERT INTO materials (name) VALUES ('PLA Matte') ON CONFLICT DO NOTHING;
  INSERT INTO materials (name) VALUES ('PETG') ON CONFLICT DO NOTHING;
  INSERT INTO materials (name) VALUES ('PETG-HF') ON CONFLICT DO NOTHING;
  INSERT INTO materials (name) VALUES ('ABS') ON CONFLICT DO NOTHING;
  INSERT INTO materials (name) VALUES ('ASA') ON CONFLICT DO NOTHING;
  INSERT INTO materials (name) VALUES ('TPU') ON CONFLICT DO NOTHING;
  INSERT INTO materials (name) VALUES ('PA') ON CONFLICT DO NOTHING;
  INSERT INTO materials (name) VALUES ('PC') ON CONFLICT DO NOTHING;
  
  -- Diameters
  INSERT INTO diameters (value) VALUES (1.75) ON CONFLICT DO NOTHING;
  INSERT INTO diameters (value) VALUES (2.85) ON CONFLICT DO NOTHING;
  
  -- Storage Locations
  INSERT INTO storage_locations (name, description, capacity) VALUES ('A - Bedroom Shelf', '2 shelves: top has 3 rows x 5 high, bottom has 2 rows x 10', 45) ON CONFLICT DO NOTHING;
  INSERT INTO storage_locations (name, description, capacity) VALUES ('B - Sealable Storage', '1 row deep, 2 rows high, 6 spools each', 12) ON CONFLICT DO NOTHING;
  INSERT INTO storage_locations (name, description, capacity) VALUES ('C - Sealable Zip-up', '2 rows deep, 2 high, 6 spools each', 24) ON CONFLICT DO NOTHING;
  INSERT INTO storage_locations (name, description, capacity) VALUES ('D - Sealable Zip-up', '2 rows deep, 2 high, 6 spools each', 24) ON CONFLICT DO NOTHING;
  INSERT INTO storage_locations (name, description, capacity) VALUES ('E - Rod Above Printer', '1 row, 8 spools', 8) ON CONFLICT DO NOTHING;
  INSERT INTO storage_locations (name, description, capacity) VALUES ('F - 9-Level Rack', '9 rows high, 6 spools each (1 row for mini spools)', 81) ON CONFLICT DO NOTHING;
  INSERT INTO storage_locations (name, description, capacity) VALUES ('AMS HT - H2C 1', 'AMS HT unit connected to H2C, acts as dryer', 1) ON CONFLICT DO NOTHING;
  INSERT INTO storage_locations (name, description, capacity) VALUES ('AMS HT - H2C 2', 'AMS HT unit connected to H2C, acts as dryer', 1) ON CONFLICT DO NOTHING;
  INSERT INTO storage_locations (name, description, capacity) VALUES ('AMS HT - P2S', 'AMS HT unit connected to P2S, acts as dryer', 1) ON CONFLICT DO NOTHING;
  INSERT INTO storage_locations (name, description, capacity) VALUES ('AMS Pro 2 - H2C 1', 'AMS Pro 2 unit connected to H2C, acts as dryer', 4) ON CONFLICT DO NOTHING;
  INSERT INTO storage_locations (name, description, capacity) VALUES ('AMS Pro 2 - H2C 2', 'AMS Pro 2 unit connected to H2C, acts as dryer', 4) ON CONFLICT DO NOTHING;
  INSERT INTO storage_locations (name, description, capacity) VALUES ('AMS Pro 2 - P2S', 'AMS Pro 2 unit connected to P2S, acts as dryer', 4) ON CONFLICT DO NOTHING;
  INSERT INTO storage_locations (name, description, capacity) VALUES ('FLSUN S1 Pro', 'Spool attached to FLSUN S1 Pro printer, acts as dryer', 1) ON CONFLICT DO NOTHING;
  INSERT INTO storage_locations (name, description, capacity) VALUES ('Creality Dryer', 'Creality dryer unit, holds up to 2 spools', 2) ON CONFLICT DO NOTHING;
  INSERT INTO storage_locations (name, description, capacity) VALUES ('Polymaker Dryer', 'Polymaker dryer unit, holds 1 spool', 1) ON CONFLICT DO NOTHING;
"

echo ""
echo "✅ Local development environment reset complete!"
echo "   Run ./scripts/run.sh to start the development server"
echo "   Login: admin / admin"
echo ""
echo "💡 TIP: Clear your browser cache/localStorage to remove any"
echo "   cached review data from the previous session."
echo "   (In Chrome: Developer Tools > Application > Local Storage > Clear)"
