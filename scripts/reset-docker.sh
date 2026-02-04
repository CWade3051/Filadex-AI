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

# Pull latest image and start fresh
echo "📦 Pulling latest Docker images..."
docker compose pull

echo "📦 Starting fresh Docker environment..."
docker compose up -d

# Wait for the database to be ready
echo "⏳ Waiting for database to initialize..."
sleep 10

# Seed initial data (materials, storage locations, diameters)
echo "🌱 Seeding initial data..."
docker compose exec -T db psql -U filadex -d filadex -c "
  -- Materials
  INSERT INTO materials (name) VALUES ('PLA') ON CONFLICT DO NOTHING;
  INSERT INTO materials (name) VALUES ('PLA Basic') ON CONFLICT DO NOTHING;
  INSERT INTO materials (name) VALUES ('PLA+') ON CONFLICT DO NOTHING;
  INSERT INTO materials (name) VALUES ('PLA Support') ON CONFLICT DO NOTHING;
  INSERT INTO materials (name) VALUES ('PLA Silk') ON CONFLICT DO NOTHING;
  INSERT INTO materials (name) VALUES ('PLA Matte') ON CONFLICT DO NOTHING;
  INSERT INTO materials (name) VALUES ('PLA-CF') ON CONFLICT DO NOTHING;
  INSERT INTO materials (name) VALUES ('PLA Marble') ON CONFLICT DO NOTHING;
  INSERT INTO materials (name) VALUES ('PLA Metal') ON CONFLICT DO NOTHING;
  INSERT INTO materials (name) VALUES ('PLA Sparkle') ON CONFLICT DO NOTHING;
  INSERT INTO materials (name) VALUES ('PLA Galaxy') ON CONFLICT DO NOTHING;
  INSERT INTO materials (name) VALUES ('PLA Glow') ON CONFLICT DO NOTHING;
  INSERT INTO materials (name) VALUES ('PLA Wood') ON CONFLICT DO NOTHING;
  INSERT INTO materials (name) VALUES ('PLA Translucent') ON CONFLICT DO NOTHING;
  INSERT INTO materials (name) VALUES ('PETG') ON CONFLICT DO NOTHING;
  INSERT INTO materials (name) VALUES ('PETG Basic') ON CONFLICT DO NOTHING;
  INSERT INTO materials (name) VALUES ('PETG-HF') ON CONFLICT DO NOTHING;
  INSERT INTO materials (name) VALUES ('PETG-CF') ON CONFLICT DO NOTHING;
  INSERT INTO materials (name) VALUES ('PETG Translucent') ON CONFLICT DO NOTHING;
  INSERT INTO materials (name) VALUES ('ABS') ON CONFLICT DO NOTHING;
  INSERT INTO materials (name) VALUES ('ASA') ON CONFLICT DO NOTHING;
  INSERT INTO materials (name) VALUES ('TPU') ON CONFLICT DO NOTHING;
  INSERT INTO materials (name) VALUES ('TPU 95A') ON CONFLICT DO NOTHING;
  INSERT INTO materials (name) VALUES ('TPU 80A') ON CONFLICT DO NOTHING;
  INSERT INTO materials (name) VALUES ('TPU for AMS') ON CONFLICT DO NOTHING;
  INSERT INTO materials (name) VALUES ('PA') ON CONFLICT DO NOTHING;
  INSERT INTO materials (name) VALUES ('PC') ON CONFLICT DO NOTHING;
  INSERT INTO materials (name) VALUES ('Support For PLA/PETG') ON CONFLICT DO NOTHING;
  
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
" 2>/dev/null || echo "Note: Some seed data may already exist"

echo ""
echo "✅ Production Docker environment reset complete!"
echo "   Access at http://localhost:8080"
echo "   Login: admin / admin"
echo ""
echo "💡 TIP: Clear your browser cache/localStorage to remove any"
echo "   cached review data from the previous session."
echo "   (In Chrome: Developer Tools > Application > Local Storage > Clear)"
