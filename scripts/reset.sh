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

# Check if dev server was running (to restart it later)
SERVER_WAS_RUNNING=false
if lsof -ti:5001 > /dev/null 2>&1; then
    SERVER_WAS_RUNNING=true
    echo "📴 Stopping development server..."
    lsof -ti:5001 | xargs kill -9 2>/dev/null || true
fi

# Stop and remove dev database with volumes
echo "📦 Removing development database and data..."
docker compose -f docker-compose.dev.yml down -v

# Clear local uploads folder
echo "🖼️  Clearing local uploads..."
rm -rf public/uploads/filaments/*
rm -rf uploads/profiles/*

# Generate new JWT secret to invalidate all existing sessions
echo "🔐 Generating new session secret (invalidating old sessions)..."
NEW_JWT_SECRET=$(openssl rand -hex 32)
if [ -f ".env" ]; then
    # Remove any existing JWT_SECRET line first
    if grep -q "^JWT_SECRET=" .env; then
        if [[ "$OSTYPE" == "darwin"* ]]; then
            sed -i '' '/^JWT_SECRET=/d' .env
        else
            sed -i '/^JWT_SECRET=/d' .env
        fi
    fi
    # Append new JWT_SECRET (with newline before if file doesn't end with one)
    if [ -n "$(tail -c 1 .env)" ]; then
        echo "" >> .env
    fi
    echo "JWT_SECRET=$NEW_JWT_SECRET" >> .env
else
    # Create .env with JWT_SECRET
    echo "JWT_SECRET=$NEW_JWT_SECRET" > .env
fi
# Verify it was added
if grep -q "^JWT_SECRET=" .env; then
    echo "   ✅ New session secret generated - old sessions will be invalidated"
else
    echo "   ⚠️  Warning: Could not add JWT_SECRET to .env"
fi

# Start fresh database
echo "📦 Starting fresh development database..."
docker compose -f docker-compose.dev.yml up -d

# Wait for database to be ready (not just started)
echo "⏳ Waiting for database to be ready..."
MAX_RETRIES=30
RETRY_COUNT=0
until PGPASSWORD=filadex_dev psql -h localhost -p 5433 -U filadex_dev -d filadex_dev -c '\q' 2>/dev/null; do
    RETRY_COUNT=$((RETRY_COUNT + 1))
    if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
        echo "   ❌ Database failed to start after $MAX_RETRIES attempts"
        exit 1
    fi
    echo "   Waiting for database... (attempt $RETRY_COUNT/$MAX_RETRIES)"
    sleep 1
done
echo "   ✅ Database is ready"

# Push schema
echo "🔧 Creating database schema..."
npx drizzle-kit push --verbose

# Verify tables were created
echo "   Verifying schema..."
TABLE_COUNT=$(PGPASSWORD=filadex_dev psql -h localhost -p 5433 -U filadex_dev -d filadex_dev -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';" 2>/dev/null | tr -d ' ')
if [ "$TABLE_COUNT" -gt 0 ]; then
    echo "   ✅ Schema created ($TABLE_COUNT tables)"
else
    echo "   ❌ Schema push failed - no tables created"
    exit 1
fi

# Seed initial data
echo "🌱 Seeding initial data..."
PGPASSWORD=filadex_dev psql -h localhost -p 5433 -U filadex_dev -d filadex_dev -v ON_ERROR_STOP=0 << 'EOF'
  -- =========================================
  -- Materials (comprehensive list)
  -- =========================================
  INSERT INTO materials (name, sort_order) VALUES ('PLA', 1) ON CONFLICT DO NOTHING;
  INSERT INTO materials (name, sort_order) VALUES ('PLA Basic', 2) ON CONFLICT DO NOTHING;
  INSERT INTO materials (name, sort_order) VALUES ('PLA+', 3) ON CONFLICT DO NOTHING;
  INSERT INTO materials (name, sort_order) VALUES ('PLA Support', 4) ON CONFLICT DO NOTHING;
  INSERT INTO materials (name, sort_order) VALUES ('PLA Silk', 5) ON CONFLICT DO NOTHING;
  INSERT INTO materials (name, sort_order) VALUES ('PLA Matte', 6) ON CONFLICT DO NOTHING;
  INSERT INTO materials (name, sort_order) VALUES ('PLA-CF', 7) ON CONFLICT DO NOTHING;
  INSERT INTO materials (name, sort_order) VALUES ('PLA Marble', 8) ON CONFLICT DO NOTHING;
  INSERT INTO materials (name, sort_order) VALUES ('PLA Metal', 9) ON CONFLICT DO NOTHING;
  INSERT INTO materials (name, sort_order) VALUES ('PLA Sparkle', 10) ON CONFLICT DO NOTHING;
  INSERT INTO materials (name, sort_order) VALUES ('PLA Galaxy', 11) ON CONFLICT DO NOTHING;
  INSERT INTO materials (name, sort_order) VALUES ('PLA Glow', 12) ON CONFLICT DO NOTHING;
  INSERT INTO materials (name, sort_order) VALUES ('PLA Wood', 13) ON CONFLICT DO NOTHING;
  INSERT INTO materials (name, sort_order) VALUES ('PLA Translucent', 14) ON CONFLICT DO NOTHING;
  INSERT INTO materials (name, sort_order) VALUES ('PETG', 20) ON CONFLICT DO NOTHING;
  INSERT INTO materials (name, sort_order) VALUES ('PETG Basic', 21) ON CONFLICT DO NOTHING;
  INSERT INTO materials (name, sort_order) VALUES ('PETG-HF', 22) ON CONFLICT DO NOTHING;
  INSERT INTO materials (name, sort_order) VALUES ('PETG-CF', 23) ON CONFLICT DO NOTHING;
  INSERT INTO materials (name, sort_order) VALUES ('PETG Translucent', 24) ON CONFLICT DO NOTHING;
  INSERT INTO materials (name, sort_order) VALUES ('ABS', 30) ON CONFLICT DO NOTHING;
  INSERT INTO materials (name, sort_order) VALUES ('ASA', 31) ON CONFLICT DO NOTHING;
  INSERT INTO materials (name, sort_order) VALUES ('TPU', 40) ON CONFLICT DO NOTHING;
  INSERT INTO materials (name, sort_order) VALUES ('TPU 95A', 41) ON CONFLICT DO NOTHING;
  INSERT INTO materials (name, sort_order) VALUES ('TPU 80A', 42) ON CONFLICT DO NOTHING;
  INSERT INTO materials (name, sort_order) VALUES ('TPU for AMS', 43) ON CONFLICT DO NOTHING;
  INSERT INTO materials (name, sort_order) VALUES ('PA', 50) ON CONFLICT DO NOTHING;
  INSERT INTO materials (name, sort_order) VALUES ('PA-CF', 51) ON CONFLICT DO NOTHING;
  INSERT INTO materials (name, sort_order) VALUES ('PC', 60) ON CONFLICT DO NOTHING;
  INSERT INTO materials (name, sort_order) VALUES ('Support For PLA/PETG', 70) ON CONFLICT DO NOTHING;
  
  -- =========================================
  -- Diameters
  -- =========================================
  INSERT INTO diameters (value) VALUES (1.75) ON CONFLICT DO NOTHING;
  INSERT INTO diameters (value) VALUES (2.85) ON CONFLICT DO NOTHING;
  
  -- =========================================
  -- Manufacturers (comprehensive list)
  -- =========================================
  INSERT INTO manufacturers (name, sort_order) VALUES ('Bambu Lab', 1) ON CONFLICT DO NOTHING;
  INSERT INTO manufacturers (name, sort_order) VALUES ('Sunlu', 2) ON CONFLICT DO NOTHING;
  INSERT INTO manufacturers (name, sort_order) VALUES ('Polymaker', 3) ON CONFLICT DO NOTHING;
  INSERT INTO manufacturers (name, sort_order) VALUES ('Hatchbox', 4) ON CONFLICT DO NOTHING;
  INSERT INTO manufacturers (name, sort_order) VALUES ('eSUN', 5) ON CONFLICT DO NOTHING;
  INSERT INTO manufacturers (name, sort_order) VALUES ('Overture', 6) ON CONFLICT DO NOTHING;
  INSERT INTO manufacturers (name, sort_order) VALUES ('Prusament', 7) ON CONFLICT DO NOTHING;
  INSERT INTO manufacturers (name, sort_order) VALUES ('Prusa', 8) ON CONFLICT DO NOTHING;
  INSERT INTO manufacturers (name, sort_order) VALUES ('Inland', 9) ON CONFLICT DO NOTHING;
  INSERT INTO manufacturers (name, sort_order) VALUES ('Creality', 10) ON CONFLICT DO NOTHING;
  INSERT INTO manufacturers (name, sort_order) VALUES ('Snapmaker', 11) ON CONFLICT DO NOTHING;
  INSERT INTO manufacturers (name, sort_order) VALUES ('Elegoo', 12) ON CONFLICT DO NOTHING;
  INSERT INTO manufacturers (name, sort_order) VALUES ('Eryone', 13) ON CONFLICT DO NOTHING;
  INSERT INTO manufacturers (name, sort_order) VALUES ('TTYT3D', 14) ON CONFLICT DO NOTHING;
  INSERT INTO manufacturers (name, sort_order) VALUES ('Duramic', 15) ON CONFLICT DO NOTHING;
  INSERT INTO manufacturers (name, sort_order) VALUES ('Amazon Basics', 16) ON CONFLICT DO NOTHING;
  INSERT INTO manufacturers (name, sort_order) VALUES ('MatterHackers', 17) ON CONFLICT DO NOTHING;
  INSERT INTO manufacturers (name, sort_order) VALUES ('ColorFabb', 18) ON CONFLICT DO NOTHING;
  INSERT INTO manufacturers (name, sort_order) VALUES ('Fillamentum', 19) ON CONFLICT DO NOTHING;
  INSERT INTO manufacturers (name, sort_order) VALUES ('3DFuel', 20) ON CONFLICT DO NOTHING;
  
  -- =========================================
  -- Colors (comprehensive list with hex codes)
  -- =========================================
  INSERT INTO colors (name, code) VALUES ('Black', '#000000') ON CONFLICT DO NOTHING;
  INSERT INTO colors (name, code) VALUES ('White', '#FFFFFF') ON CONFLICT DO NOTHING;
  INSERT INTO colors (name, code) VALUES ('Red', '#FF0000') ON CONFLICT DO NOTHING;
  INSERT INTO colors (name, code) VALUES ('Blue', '#0000FF') ON CONFLICT DO NOTHING;
  INSERT INTO colors (name, code) VALUES ('Green', '#00FF00') ON CONFLICT DO NOTHING;
  INSERT INTO colors (name, code) VALUES ('Yellow', '#FFFF00') ON CONFLICT DO NOTHING;
  INSERT INTO colors (name, code) VALUES ('Orange', '#FFA500') ON CONFLICT DO NOTHING;
  INSERT INTO colors (name, code) VALUES ('Purple', '#800080') ON CONFLICT DO NOTHING;
  INSERT INTO colors (name, code) VALUES ('Pink', '#FFC0CB') ON CONFLICT DO NOTHING;
  INSERT INTO colors (name, code) VALUES ('Gray', '#808080') ON CONFLICT DO NOTHING;
  INSERT INTO colors (name, code) VALUES ('Silver', '#C0C0C0') ON CONFLICT DO NOTHING;
  INSERT INTO colors (name, code) VALUES ('Gold', '#FFD700') ON CONFLICT DO NOTHING;
  INSERT INTO colors (name, code) VALUES ('Brown', '#8B4513') ON CONFLICT DO NOTHING;
  INSERT INTO colors (name, code) VALUES ('Magenta', '#FF00FF') ON CONFLICT DO NOTHING;
  INSERT INTO colors (name, code) VALUES ('Cyan', '#00FFFF') ON CONFLICT DO NOTHING;
  INSERT INTO colors (name, code) VALUES ('Transparent', '#FFFFFF') ON CONFLICT DO NOTHING;
  INSERT INTO colors (name, code) VALUES ('Natural', '#F5F5DC') ON CONFLICT DO NOTHING;
  INSERT INTO colors (name, code) VALUES ('Navy', '#000080') ON CONFLICT DO NOTHING;
  INSERT INTO colors (name, code) VALUES ('Teal', '#008080') ON CONFLICT DO NOTHING;
  INSERT INTO colors (name, code) VALUES ('Lime', '#32CD32') ON CONFLICT DO NOTHING;
  INSERT INTO colors (name, code) VALUES ('Olive', '#808000') ON CONFLICT DO NOTHING;
  INSERT INTO colors (name, code) VALUES ('Maroon', '#800000') ON CONFLICT DO NOTHING;
  INSERT INTO colors (name, code) VALUES ('Beige', '#F5F5DC') ON CONFLICT DO NOTHING;
  INSERT INTO colors (name, code) VALUES ('Ivory', '#FFFFF0') ON CONFLICT DO NOTHING;
  INSERT INTO colors (name, code) VALUES ('Coral', '#FF7F50') ON CONFLICT DO NOTHING;
  INSERT INTO colors (name, code) VALUES ('Salmon', '#FA8072') ON CONFLICT DO NOTHING;
  INSERT INTO colors (name, code) VALUES ('Turquoise', '#40E0D0') ON CONFLICT DO NOTHING;
  INSERT INTO colors (name, code) VALUES ('Lavender', '#E6E6FA') ON CONFLICT DO NOTHING;
  INSERT INTO colors (name, code) VALUES ('Peach', '#FFDAB9') ON CONFLICT DO NOTHING;
  INSERT INTO colors (name, code) VALUES ('Mint', '#98FF98') ON CONFLICT DO NOTHING;
  
  -- =========================================
  -- Storage Locations (sorted alphabetically with proper naming)
  -- =========================================
  INSERT INTO storage_locations (name, description, capacity, sort_order) VALUES ('A - Bedroom Shelf', '2 shelves: top has 3 rows x 5 high, bottom has 2 rows x 10', 45, 1) ON CONFLICT DO NOTHING;
  INSERT INTO storage_locations (name, description, capacity, sort_order) VALUES ('B - Sealable Storage', '1 row deep, 2 rows high, 6 spools each', 12, 2) ON CONFLICT DO NOTHING;
  INSERT INTO storage_locations (name, description, capacity, sort_order) VALUES ('C - Sealable Zip Up Large 1', '2 rows deep, 2 high, 6 spools each', 24, 3) ON CONFLICT DO NOTHING;
  INSERT INTO storage_locations (name, description, capacity, sort_order) VALUES ('D - Sealable Zip Up Large 2', '2 rows deep, 2 high, 6 spools each', 24, 4) ON CONFLICT DO NOTHING;
  INSERT INTO storage_locations (name, description, capacity, sort_order) VALUES ('E - Sealable Zip Up Small', '1 row deep, 2 high, 4 spools each', 8, 5) ON CONFLICT DO NOTHING;
  INSERT INTO storage_locations (name, description, capacity, sort_order) VALUES ('F - Rod Above Printer', '1 row, 8 spools', 8, 6) ON CONFLICT DO NOTHING;
  INSERT INTO storage_locations (name, description, capacity, sort_order) VALUES ('G - 9-Level Rack', '9 rows high, 6 spools each (1 row for mini spools)', 81, 7) ON CONFLICT DO NOTHING;
  INSERT INTO storage_locations (name, description, capacity, sort_order) VALUES ('AMS HT - H2C 1', 'AMS HT unit connected to H2C, acts as dryer', 1, 100) ON CONFLICT DO NOTHING;
  INSERT INTO storage_locations (name, description, capacity, sort_order) VALUES ('AMS HT - H2C 2', 'AMS HT unit connected to H2C, acts as dryer', 1, 101) ON CONFLICT DO NOTHING;
  INSERT INTO storage_locations (name, description, capacity, sort_order) VALUES ('AMS HT - P2S', 'AMS HT unit connected to P2S, acts as dryer', 1, 102) ON CONFLICT DO NOTHING;
  INSERT INTO storage_locations (name, description, capacity, sort_order) VALUES ('AMS Pro 2 - H2C 1', 'AMS Pro 2 unit connected to H2C, acts as dryer', 4, 103) ON CONFLICT DO NOTHING;
  INSERT INTO storage_locations (name, description, capacity, sort_order) VALUES ('AMS Pro 2 - H2C 2', 'AMS Pro 2 unit connected to H2C, acts as dryer', 4, 104) ON CONFLICT DO NOTHING;
  INSERT INTO storage_locations (name, description, capacity, sort_order) VALUES ('AMS Pro 2 - P2S', 'AMS Pro 2 unit connected to P2S, acts as dryer', 4, 105) ON CONFLICT DO NOTHING;
  INSERT INTO storage_locations (name, description, capacity, sort_order) VALUES ('FLSUN S1 Pro', 'Spool attached to FLSUN S1 Pro printer, acts as dryer', 1, 200) ON CONFLICT DO NOTHING;
  INSERT INTO storage_locations (name, description, capacity, sort_order) VALUES ('Creality Dryer', 'Creality dryer unit, holds up to 2 spools', 2, 201) ON CONFLICT DO NOTHING;
  INSERT INTO storage_locations (name, description, capacity, sort_order) VALUES ('Polymaker Dryer', 'Polymaker dryer unit, holds 1 spool', 1, 202) ON CONFLICT DO NOTHING;
  
  -- =========================================
  -- Printers
  -- =========================================
  INSERT INTO printers (name, sort_order) VALUES ('Bambu Lab P2S', 1) ON CONFLICT DO NOTHING;
  INSERT INTO printers (name, sort_order) VALUES ('Bambu Lab H2C', 2) ON CONFLICT DO NOTHING;
  INSERT INTO printers (name, sort_order) VALUES ('FLSun S1 Pro', 3) ON CONFLICT DO NOTHING;
  INSERT INTO printers (name, sort_order) VALUES ('SnapMaker U1', 4) ON CONFLICT DO NOTHING;
  
  -- =========================================
  -- Slicers (popular slicer software)
  -- =========================================
  INSERT INTO slicers (name, sort_order) VALUES ('Bambu Studio', 1) ON CONFLICT DO NOTHING;
  INSERT INTO slicers (name, sort_order) VALUES ('Orca Slicer', 2) ON CONFLICT DO NOTHING;
  INSERT INTO slicers (name, sort_order) VALUES ('PrusaSlicer', 3) ON CONFLICT DO NOTHING;
  INSERT INTO slicers (name, sort_order) VALUES ('Cura', 4) ON CONFLICT DO NOTHING;
  INSERT INTO slicers (name, sort_order) VALUES ('SuperSlicer', 5) ON CONFLICT DO NOTHING;
  INSERT INTO slicers (name, sort_order) VALUES ('Simplify3D', 6) ON CONFLICT DO NOTHING;
  INSERT INTO slicers (name, sort_order) VALUES ('IdeaMaker', 7) ON CONFLICT DO NOTHING;
  INSERT INTO slicers (name, sort_order) VALUES ('FlashPrint', 8) ON CONFLICT DO NOTHING;
  INSERT INTO slicers (name, sort_order) VALUES ('Creality Print', 9) ON CONFLICT DO NOTHING;
  INSERT INTO slicers (name, sort_order) VALUES ('FLSUN Slicer', 10) ON CONFLICT DO NOTHING;
EOF

# Check for OPENAI_API_KEY in .env and add to admin user if present
if [ -f ".env" ]; then
    OPENAI_KEY=$(grep "^OPENAI_API_KEY=" .env | cut -d'=' -f2-)
    if [ -n "$OPENAI_KEY" ] && [ "$OPENAI_KEY" != "" ]; then
        echo "🔑 Found OPENAI_API_KEY in .env, encrypting and adding to admin user..."
        # Run the Node.js script to encrypt and store the key (also creates admin if needed)
        npx tsx scripts/set-admin-openai-key.ts "$OPENAI_KEY" || {
            echo "   ⚠️  Could not set key automatically. You can add it in Settings > AI Configuration"
        }
    fi
fi

echo ""
echo "✅ Local development environment reset complete!"
echo "   Login: admin / admin"
echo ""
echo "💡 TIP: Clear your browser cache/localStorage to remove any"
echo "   cached review data from the previous session."
echo "   (You can also use Settings > Data > Clear Cache in the app)"
echo ""
echo "📝 Note: All existing sessions have been invalidated."
echo "   Refresh your browser to be redirected to the login page."
echo ""

# Restart server if it was running before reset
if [ "$SERVER_WAS_RUNNING" = true ]; then
    echo "🚀 Restarting development server..."
    npm run dev &
    sleep 3
    echo ""
    echo "✅ Server is running at http://localhost:5001"
    echo "   You can log in now with admin / admin"
else
    echo "   Run ./scripts/run.sh to start the development server"
fi
