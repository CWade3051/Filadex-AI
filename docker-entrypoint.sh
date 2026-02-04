#!/bin/sh
set -e

# Wait for database readiness
echo "Waiting for the database..."
MAX_RETRIES=30
RETRY_COUNT=0

# Check if all required environment variables are set
echo "Checking DB environment variables..."
echo "PGHOST: ${PGHOST:-not set}"
echo "PGPORT: ${PGPORT:-not set}"
echo "PGUSER: ${PGUSER:-not set}"
echo "PGDATABASE: ${PGDATABASE:-not set}"
echo "DATABASE_URL: ${DATABASE_URL:-not set}"

# Test connection with nc
while ! nc -z ${PGHOST:-db} ${PGPORT:-5432}; do
  RETRY_COUNT=$((RETRY_COUNT + 1))
  if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
    echo "Timeout waiting for the database!"
    exit 1
  fi
  echo "Waiting for the database... Attempt $RETRY_COUNT of $MAX_RETRIES"
  sleep 1
done
echo "Database is accessible!"

# Check the environment variables for the database
echo "Database connection: $PGHOST:$PGPORT $PGDATABASE"

# Explicitly export PGHOST and other PG* variables
export PGHOST=${PGHOST:-db}
export PGPORT=${PGPORT:-5432}
export PGUSER=${PGUSER:-filadex}
export PGPASSWORD=${PGPASSWORD:-filadex}
export PGDATABASE=${PGDATABASE:-filadex}

# Try to see if the database exists
echo "Checking if database $PGDATABASE exists..."
DB_EXISTS=$(PGPASSWORD=$PGPASSWORD psql -h $PGHOST -p $PGPORT -U $PGUSER -tAc "SELECT 1 FROM pg_database WHERE datname='$PGDATABASE'" postgres)
if [ -z "$DB_EXISTS" ]; then
  echo "Database $PGDATABASE does not exist, trying to create..."
  PGPASSWORD=$PGPASSWORD createdb -h $PGHOST -p $PGPORT -U $PGUSER "$PGDATABASE" || echo "Could not create database, trying to continue anyway..."
else
  echo "Database $PGDATABASE already exists."
fi

# Create the schema directly - with additional verification
echo "Creating database schema directly with SQL..."

# Check if we are using the correct database
CURRENT_DB=$(PGPASSWORD=$PGPASSWORD psql -h $PGHOST -p $PGPORT -U $PGUSER -tAc "SELECT current_database()" $PGDATABASE)
echo "Current database: $CURRENT_DB, Target database: $PGDATABASE"

# Check permissions
echo "Checking database permissions..."
HAS_PERMISSION=$(PGPASSWORD=$PGPASSWORD psql -h $PGHOST -p $PGPORT -U $PGUSER -tAc "SELECT has_schema_privilege(current_user, 'public', 'CREATE')" $PGDATABASE)
echo "User has CREATE permission: $HAS_PERMISSION"

# Create tables with explicit schema
PGPASSWORD=$PGPASSWORD psql -h $PGHOST -p $PGPORT -U $PGUSER -d "$PGDATABASE" -v ON_ERROR_STOP=0 -c "
  CREATE SCHEMA IF NOT EXISTS public;

  -- Only create tables if they don't exist
  -- DO NOT execute DROP commands to preserve data

  -- Create tables

  CREATE TABLE IF NOT EXISTS public.users (
    id SERIAL PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    is_admin BOOLEAN DEFAULT FALSE,
    force_change_password BOOLEAN DEFAULT TRUE,
    language TEXT DEFAULT 'en',
    currency TEXT DEFAULT 'EUR',
    temperature_unit TEXT DEFAULT 'C',
    openai_api_key TEXT,
    openai_model TEXT DEFAULT 'gpt-4o',
    last_login TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
  );



  CREATE TABLE IF NOT EXISTS public.manufacturers (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    sort_order INTEGER DEFAULT 999,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
  );

  CREATE TABLE IF NOT EXISTS public.materials (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    sort_order INTEGER DEFAULT 999,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
  );

  CREATE TABLE IF NOT EXISTS public.colors (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    code TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
  );

  CREATE TABLE IF NOT EXISTS public.diameters (
    id SERIAL PRIMARY KEY,
    value NUMERIC NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
  );

  CREATE TABLE IF NOT EXISTS public.storage_locations (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    capacity INTEGER,
    sort_order INTEGER DEFAULT 999,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
  );

  CREATE TABLE IF NOT EXISTS public.filaments (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    manufacturer TEXT,
    material TEXT NOT NULL,
    color_name TEXT,
    color_code TEXT,
    diameter NUMERIC,
    print_temp TEXT,
    bed_temp TEXT,
    print_speed TEXT,
    total_weight NUMERIC NOT NULL,
    remaining_percentage NUMERIC NOT NULL,
    purchase_date DATE,
    purchase_price NUMERIC,
    status TEXT,
    spool_type TEXT,
    dryer_count INTEGER DEFAULT 0 NOT NULL,
    last_drying_date DATE,
    storage_location TEXT,
    location_details TEXT,
    notes TEXT,
    image_url TEXT,
    user_id INTEGER REFERENCES public.users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS public.user_sharing (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    material_id INTEGER REFERENCES public.materials(id) ON DELETE CASCADE,
    is_public BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
  );

  -- Phase 2: Print Job Logging
  CREATE TABLE IF NOT EXISTS public.print_jobs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES public.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    filament_usages TEXT,
    print_started_at TIMESTAMP WITH TIME ZONE,
    print_completed_at TIMESTAMP WITH TIME ZONE,
    estimated_duration INTEGER,
    actual_duration INTEGER,
    estimated_weight NUMERIC,
    actual_weight NUMERIC,
    status TEXT DEFAULT 'completed',
    failure_reason TEXT,
    gcode_filename TEXT,
    slicer_used TEXT,
    printer_used TEXT,
    thumbnail_url TEXT,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );

  -- Phase 2: Filament Usage History
  CREATE TABLE IF NOT EXISTS public.filament_history (
    id SERIAL PRIMARY KEY,
    filament_id INTEGER REFERENCES public.filaments(id) ON DELETE CASCADE,
    remaining_percentage NUMERIC,
    current_weight NUMERIC,
    change_type TEXT,
    change_amount NUMERIC,
    print_job_id INTEGER REFERENCES public.print_jobs(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );

  -- Phase 3: Material Compatibility Matrix
  CREATE TABLE IF NOT EXISTS public.material_compatibility (
    id SERIAL PRIMARY KEY,
    material1 TEXT NOT NULL,
    material2 TEXT NOT NULL,
    compatibility_level TEXT NOT NULL,
    notes TEXT,
    interface_strength TEXT,
    recommended_settings TEXT,
    source TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );

  -- Phase 3: Slicer Profiles
  CREATE TABLE IF NOT EXISTS public.slicer_profiles (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES public.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    manufacturer TEXT,
    material TEXT,
    file_url TEXT,
    original_filename TEXT,
    file_type TEXT,
    parsed_settings TEXT,
    slicer_version TEXT,
    printer_model TEXT,
    notes TEXT,
    is_public BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );

  -- Phase 3: Cloud Backup Configuration
  CREATE TABLE IF NOT EXISTS public.cloud_backup_configs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES public.users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    access_token TEXT,
    refresh_token TEXT,
    token_expires_at TIMESTAMP WITH TIME ZONE,
    is_enabled BOOLEAN DEFAULT FALSE,
    backup_frequency TEXT,
    last_backup_at TIMESTAMP WITH TIME ZONE,
    folder_path TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );

  -- Phase 3: Backup History
  CREATE TABLE IF NOT EXISTS public.backup_history (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES public.users(id) ON DELETE CASCADE,
    provider TEXT,
    status TEXT,
    file_size INTEGER,
    cloud_file_id TEXT,
    error_message TEXT,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE
  );
"

# Check if the tables were created
for TABLE in users manufacturers materials colors diameters storage_locations filaments user_sharing print_jobs filament_history material_compatibility slicer_profiles cloud_backup_configs backup_history; do
  EXISTS=$(PGPASSWORD=$PGPASSWORD psql -h $PGHOST -p $PGPORT -U $PGUSER -d "$PGDATABASE" -tAc "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '$TABLE')")
  echo "Table $TABLE created: $EXISTS"
done

echo "Database schema created!"

# Add language column if it doesn't exist
LANGUAGE_COLUMN_EXISTS=$(PGPASSWORD=$PGPASSWORD psql -h $PGHOST -p $PGPORT -U $PGUSER -d "$PGDATABASE" -tAc "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'language')")
if [ "$LANGUAGE_COLUMN_EXISTS" = "f" ]; then
  echo "Adding language column to users table..."
  PGPASSWORD=$PGPASSWORD psql -h $PGHOST -p $PGPORT -U $PGUSER -d "$PGDATABASE" -v ON_ERROR_STOP=0 -c "ALTER TABLE public.users ADD COLUMN language TEXT DEFAULT 'en';"
  echo "Language column added."
else
  echo "Language column already exists."
fi

# Add currency column if it doesn't exist
CURRENCY_COLUMN_EXISTS=$(PGPASSWORD=$PGPASSWORD psql -h $PGHOST -p $PGPORT -U $PGUSER -d "$PGDATABASE" -tAc "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'currency')")
if [ "$CURRENCY_COLUMN_EXISTS" = "f" ]; then
  echo "Adding currency column to users table..."
  PGPASSWORD=$PGPASSWORD psql -h $PGHOST -p $PGPORT -U $PGUSER -d "$PGDATABASE" -v ON_ERROR_STOP=0 -c "ALTER TABLE public.users ADD COLUMN currency TEXT DEFAULT 'EUR';"
  echo "Currency column added."
else
  echo "Currency column already exists."
fi

# Add temperature_unit column if it doesn't exist
TEMPERATURE_COLUMN_EXISTS=$(PGPASSWORD=$PGPASSWORD psql -h $PGHOST -p $PGPORT -U $PGUSER -d "$PGDATABASE" -tAc "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'temperature_unit')")
if [ "$TEMPERATURE_COLUMN_EXISTS" = "f" ]; then
  echo "Adding temperature_unit column to users table..."
  PGPASSWORD=$PGPASSWORD psql -h $PGHOST -p $PGPORT -U $PGUSER -d "$PGDATABASE" -v ON_ERROR_STOP=0 -c "ALTER TABLE public.users ADD COLUMN temperature_unit TEXT DEFAULT 'C';"
  echo "Temperature unit column added."
else
  echo "Temperature unit column already exists."
fi

# Add openai_api_key column if it doesn't exist
OPENAI_KEY_EXISTS=$(PGPASSWORD=$PGPASSWORD psql -h $PGHOST -p $PGPORT -U $PGUSER -d "$PGDATABASE" -tAc "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'openai_api_key')")
if [ "$OPENAI_KEY_EXISTS" = "f" ]; then
  echo "Adding openai_api_key column to users table..."
  PGPASSWORD=$PGPASSWORD psql -h $PGHOST -p $PGPORT -U $PGUSER -d "$PGDATABASE" -v ON_ERROR_STOP=0 -c "ALTER TABLE public.users ADD COLUMN openai_api_key TEXT;"
  echo "OpenAI API key column added."
fi

# Add openai_model column if it doesn't exist
OPENAI_MODEL_EXISTS=$(PGPASSWORD=$PGPASSWORD psql -h $PGHOST -p $PGPORT -U $PGUSER -d "$PGDATABASE" -tAc "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'openai_model')")
if [ "$OPENAI_MODEL_EXISTS" = "f" ]; then
  echo "Adding openai_model column to users table..."
  PGPASSWORD=$PGPASSWORD psql -h $PGHOST -p $PGPORT -U $PGUSER -d "$PGDATABASE" -v ON_ERROR_STOP=0 -c "ALTER TABLE public.users ADD COLUMN openai_model TEXT DEFAULT 'gpt-4o';"
  echo "OpenAI model column added."
fi

# Add filament columns if they don't exist
echo "Checking filament table columns..."

PRINT_SPEED_EXISTS=$(PGPASSWORD=$PGPASSWORD psql -h $PGHOST -p $PGPORT -U $PGUSER -d "$PGDATABASE" -tAc "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'filaments' AND column_name = 'print_speed')")
if [ "$PRINT_SPEED_EXISTS" = "f" ]; then
  PGPASSWORD=$PGPASSWORD psql -h $PGHOST -p $PGPORT -U $PGUSER -d "$PGDATABASE" -v ON_ERROR_STOP=0 -c "ALTER TABLE public.filaments ADD COLUMN print_speed TEXT;"
  echo "print_speed column added."
fi

BED_TEMP_EXISTS=$(PGPASSWORD=$PGPASSWORD psql -h $PGHOST -p $PGPORT -U $PGUSER -d "$PGDATABASE" -tAc "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'filaments' AND column_name = 'bed_temp')")
if [ "$BED_TEMP_EXISTS" = "f" ]; then
  PGPASSWORD=$PGPASSWORD psql -h $PGHOST -p $PGPORT -U $PGUSER -d "$PGDATABASE" -v ON_ERROR_STOP=0 -c "ALTER TABLE public.filaments ADD COLUMN bed_temp TEXT;"
  echo "bed_temp column added."
fi

NOTES_EXISTS=$(PGPASSWORD=$PGPASSWORD psql -h $PGHOST -p $PGPORT -U $PGUSER -d "$PGDATABASE" -tAc "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'filaments' AND column_name = 'notes')")
if [ "$NOTES_EXISTS" = "f" ]; then
  PGPASSWORD=$PGPASSWORD psql -h $PGHOST -p $PGPORT -U $PGUSER -d "$PGDATABASE" -v ON_ERROR_STOP=0 -c "ALTER TABLE public.filaments ADD COLUMN notes TEXT;"
  echo "notes column added."
fi

IMAGE_URL_EXISTS=$(PGPASSWORD=$PGPASSWORD psql -h $PGHOST -p $PGPORT -U $PGUSER -d "$PGDATABASE" -tAc "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'filaments' AND column_name = 'image_url')")
if [ "$IMAGE_URL_EXISTS" = "f" ]; then
  PGPASSWORD=$PGPASSWORD psql -h $PGHOST -p $PGPORT -U $PGUSER -d "$PGDATABASE" -v ON_ERROR_STOP=0 -c "ALTER TABLE public.filaments ADD COLUMN image_url TEXT;"
  echo "image_url column added."
fi

LOCATION_DETAILS_EXISTS=$(PGPASSWORD=$PGPASSWORD psql -h $PGHOST -p $PGPORT -U $PGUSER -d "$PGDATABASE" -tAc "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'filaments' AND column_name = 'location_details')")
if [ "$LOCATION_DETAILS_EXISTS" = "f" ]; then
  PGPASSWORD=$PGPASSWORD psql -h $PGHOST -p $PGPORT -U $PGUSER -d "$PGDATABASE" -v ON_ERROR_STOP=0 -c "ALTER TABLE public.filaments ADD COLUMN location_details TEXT;"
  echo "location_details column added."
fi

# Add storage_locations columns if they don't exist
STORAGE_DESC_EXISTS=$(PGPASSWORD=$PGPASSWORD psql -h $PGHOST -p $PGPORT -U $PGUSER -d "$PGDATABASE" -tAc "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'storage_locations' AND column_name = 'description')")
if [ "$STORAGE_DESC_EXISTS" = "f" ]; then
  PGPASSWORD=$PGPASSWORD psql -h $PGHOST -p $PGPORT -U $PGUSER -d "$PGDATABASE" -v ON_ERROR_STOP=0 -c "ALTER TABLE public.storage_locations ADD COLUMN description TEXT;"
  echo "storage_locations.description column added."
fi

STORAGE_CAP_EXISTS=$(PGPASSWORD=$PGPASSWORD psql -h $PGHOST -p $PGPORT -U $PGUSER -d "$PGDATABASE" -tAc "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'storage_locations' AND column_name = 'capacity')")
if [ "$STORAGE_CAP_EXISTS" = "f" ]; then
  PGPASSWORD=$PGPASSWORD psql -h $PGHOST -p $PGPORT -U $PGUSER -d "$PGDATABASE" -v ON_ERROR_STOP=0 -c "ALTER TABLE public.storage_locations ADD COLUMN capacity INTEGER;"
  echo "storage_locations.capacity column added."
fi

# Phase 1: Weight tracking columns
EMPTY_SPOOL_WEIGHT_EXISTS=$(PGPASSWORD=$PGPASSWORD psql -h $PGHOST -p $PGPORT -U $PGUSER -d "$PGDATABASE" -tAc "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'filaments' AND column_name = 'empty_spool_weight')")
if [ "$EMPTY_SPOOL_WEIGHT_EXISTS" = "f" ]; then
  PGPASSWORD=$PGPASSWORD psql -h $PGHOST -p $PGPORT -U $PGUSER -d "$PGDATABASE" -v ON_ERROR_STOP=0 -c "ALTER TABLE public.filaments ADD COLUMN empty_spool_weight NUMERIC;"
  echo "empty_spool_weight column added."
fi

CURRENT_WEIGHT_EXISTS=$(PGPASSWORD=$PGPASSWORD psql -h $PGHOST -p $PGPORT -U $PGUSER -d "$PGDATABASE" -tAc "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'filaments' AND column_name = 'current_weight')")
if [ "$CURRENT_WEIGHT_EXISTS" = "f" ]; then
  PGPASSWORD=$PGPASSWORD psql -h $PGHOST -p $PGPORT -U $PGUSER -d "$PGDATABASE" -v ON_ERROR_STOP=0 -c "ALTER TABLE public.filaments ADD COLUMN current_weight NUMERIC;"
  echo "current_weight column added."
fi

LAST_WEIGHED_AT_EXISTS=$(PGPASSWORD=$PGPASSWORD psql -h $PGHOST -p $PGPORT -U $PGUSER -d "$PGDATABASE" -tAc "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'filaments' AND column_name = 'last_weighed_at')")
if [ "$LAST_WEIGHED_AT_EXISTS" = "f" ]; then
  PGPASSWORD=$PGPASSWORD psql -h $PGHOST -p $PGPORT -U $PGUSER -d "$PGDATABASE" -v ON_ERROR_STOP=0 -c "ALTER TABLE public.filaments ADD COLUMN last_weighed_at TIMESTAMP WITH TIME ZONE;"
  echo "last_weighed_at column added."
fi

# Phase 1: Archive columns
IS_ARCHIVED_EXISTS=$(PGPASSWORD=$PGPASSWORD psql -h $PGHOST -p $PGPORT -U $PGUSER -d "$PGDATABASE" -tAc "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'filaments' AND column_name = 'is_archived')")
if [ "$IS_ARCHIVED_EXISTS" = "f" ]; then
  PGPASSWORD=$PGPASSWORD psql -h $PGHOST -p $PGPORT -U $PGUSER -d "$PGDATABASE" -v ON_ERROR_STOP=0 -c "ALTER TABLE public.filaments ADD COLUMN is_archived BOOLEAN DEFAULT FALSE;"
  echo "is_archived column added."
fi

ARCHIVED_AT_EXISTS=$(PGPASSWORD=$PGPASSWORD psql -h $PGHOST -p $PGPORT -U $PGUSER -d "$PGDATABASE" -tAc "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'filaments' AND column_name = 'archived_at')")
if [ "$ARCHIVED_AT_EXISTS" = "f" ]; then
  PGPASSWORD=$PGPASSWORD psql -h $PGHOST -p $PGPORT -U $PGUSER -d "$PGDATABASE" -v ON_ERROR_STOP=0 -c "ALTER TABLE public.filaments ADD COLUMN archived_at TIMESTAMP WITH TIME ZONE;"
  echo "archived_at column added."
fi

ARCHIVE_REASON_EXISTS=$(PGPASSWORD=$PGPASSWORD psql -h $PGHOST -p $PGPORT -U $PGUSER -d "$PGDATABASE" -tAc "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'filaments' AND column_name = 'archive_reason')")
if [ "$ARCHIVE_REASON_EXISTS" = "f" ]; then
  PGPASSWORD=$PGPASSWORD psql -h $PGHOST -p $PGPORT -U $PGUSER -d "$PGDATABASE" -v ON_ERROR_STOP=0 -c "ALTER TABLE public.filaments ADD COLUMN archive_reason TEXT;"
  echo "archive_reason column added."
fi

echo "All column migrations completed."

# Insert sample data, but only if explicitly requested via INIT_SAMPLE_DATA environment variable
echo "Checking for existing data..."

# Create a lock file to prevent data from being initialized multiple times
LOCK_FILE="/app/.init_done"

if [ -f "$LOCK_FILE" ]; then
  echo "Initialization already completed (lock file exists). Skipping data insertion."
else
  COUNT=$(PGPASSWORD=$PGPASSWORD psql -h $PGHOST -p $PGPORT -U $PGUSER -d "$PGDATABASE" -t -c "SELECT COUNT(*) FROM public.manufacturers" 2>/dev/null | tr -d ' ' || echo "0")

  if [ "$COUNT" = "0" ]; then
    # Only add sample data if INIT_SAMPLE_DATA is set to "true"
    if [ "${INIT_SAMPLE_DATA}" = "true" ]; then
      echo "INIT_SAMPLE_DATA is set to true. Adding sample data..."
      PGPASSWORD=$PGPASSWORD psql -h $PGHOST -p $PGPORT -U $PGUSER -d "$PGDATABASE" -v ON_ERROR_STOP=0 -c "
        INSERT INTO public.manufacturers (name) VALUES ('Bambu Lab') ON CONFLICT DO NOTHING;
        -- Base materials
        INSERT INTO public.materials (name) VALUES ('PLA') ON CONFLICT DO NOTHING;
        INSERT INTO public.materials (name) VALUES ('PLA Basic') ON CONFLICT DO NOTHING;
        INSERT INTO public.materials (name) VALUES ('PLA+') ON CONFLICT DO NOTHING;
        INSERT INTO public.materials (name) VALUES ('PLA Support') ON CONFLICT DO NOTHING;
        INSERT INTO public.materials (name) VALUES ('PLA Silk') ON CONFLICT DO NOTHING;
        INSERT INTO public.materials (name) VALUES ('PLA Matte') ON CONFLICT DO NOTHING;
        INSERT INTO public.materials (name) VALUES ('PLA-CF') ON CONFLICT DO NOTHING;
        INSERT INTO public.materials (name) VALUES ('PLA Marble') ON CONFLICT DO NOTHING;
        INSERT INTO public.materials (name) VALUES ('PLA Metal') ON CONFLICT DO NOTHING;
        INSERT INTO public.materials (name) VALUES ('PLA Sparkle') ON CONFLICT DO NOTHING;
        INSERT INTO public.materials (name) VALUES ('PLA Galaxy') ON CONFLICT DO NOTHING;
        INSERT INTO public.materials (name) VALUES ('PLA Glow') ON CONFLICT DO NOTHING;
        INSERT INTO public.materials (name) VALUES ('PLA Wood') ON CONFLICT DO NOTHING;
        INSERT INTO public.materials (name) VALUES ('PLA Translucent') ON CONFLICT DO NOTHING;
        INSERT INTO public.materials (name) VALUES ('PETG') ON CONFLICT DO NOTHING;
        INSERT INTO public.materials (name) VALUES ('PETG Basic') ON CONFLICT DO NOTHING;
        INSERT INTO public.materials (name) VALUES ('PETG-HF') ON CONFLICT DO NOTHING;
        INSERT INTO public.materials (name) VALUES ('PETG-CF') ON CONFLICT DO NOTHING;
        INSERT INTO public.materials (name) VALUES ('PETG Translucent') ON CONFLICT DO NOTHING;
        INSERT INTO public.materials (name) VALUES ('ABS') ON CONFLICT DO NOTHING;
        INSERT INTO public.materials (name) VALUES ('ASA') ON CONFLICT DO NOTHING;
        INSERT INTO public.materials (name) VALUES ('TPU') ON CONFLICT DO NOTHING;
        INSERT INTO public.materials (name) VALUES ('TPU 95A') ON CONFLICT DO NOTHING;
        INSERT INTO public.materials (name) VALUES ('TPU 80A') ON CONFLICT DO NOTHING;
        INSERT INTO public.materials (name) VALUES ('TPU for AMS') ON CONFLICT DO NOTHING;
        INSERT INTO public.materials (name) VALUES ('PA') ON CONFLICT DO NOTHING;
        INSERT INTO public.materials (name) VALUES ('PC') ON CONFLICT DO NOTHING;
        INSERT INTO public.materials (name) VALUES ('Support For PLA/PETG') ON CONFLICT DO NOTHING;
        INSERT INTO public.diameters (value) VALUES ('1.75') ON CONFLICT DO NOTHING;
        INSERT INTO public.diameters (value) VALUES ('2.85') ON CONFLICT DO NOTHING;
        
        -- Storage Locations
        INSERT INTO public.storage_locations (name, description, capacity) VALUES ('A - Bedroom Shelf', '2 shelves: top has 3 rows x 5 high, bottom has 2 rows x 10', 45) ON CONFLICT DO NOTHING;
        INSERT INTO public.storage_locations (name, description, capacity) VALUES ('B - Sealable Storage', '1 row deep, 2 rows high, 6 spools each', 12) ON CONFLICT DO NOTHING;
        INSERT INTO public.storage_locations (name, description, capacity) VALUES ('C - Sealable Zip-up', '2 rows deep, 2 high, 6 spools each', 24) ON CONFLICT DO NOTHING;
        INSERT INTO public.storage_locations (name, description, capacity) VALUES ('D - Sealable Zip-up', '2 rows deep, 2 high, 6 spools each', 24) ON CONFLICT DO NOTHING;
        INSERT INTO public.storage_locations (name, description, capacity) VALUES ('E - Rod Above Printer', '1 row, 8 spools', 8) ON CONFLICT DO NOTHING;
        INSERT INTO public.storage_locations (name, description, capacity) VALUES ('F - 9-Level Rack', '9 rows high, 6 spools each (1 row for mini spools)', 81) ON CONFLICT DO NOTHING;
        INSERT INTO public.storage_locations (name, description, capacity) VALUES ('AMS HT - H2C 1', 'AMS HT unit connected to H2C, acts as dryer', 1) ON CONFLICT DO NOTHING;
        INSERT INTO public.storage_locations (name, description, capacity) VALUES ('AMS HT - H2C 2', 'AMS HT unit connected to H2C, acts as dryer', 1) ON CONFLICT DO NOTHING;
        INSERT INTO public.storage_locations (name, description, capacity) VALUES ('AMS HT - P2S', 'AMS HT unit connected to P2S, acts as dryer', 1) ON CONFLICT DO NOTHING;
        INSERT INTO public.storage_locations (name, description, capacity) VALUES ('AMS Pro 2 - H2C 1', 'AMS Pro 2 unit connected to H2C, acts as dryer', 4) ON CONFLICT DO NOTHING;
        INSERT INTO public.storage_locations (name, description, capacity) VALUES ('AMS Pro 2 - H2C 2', 'AMS Pro 2 unit connected to H2C, acts as dryer', 4) ON CONFLICT DO NOTHING;
        INSERT INTO public.storage_locations (name, description, capacity) VALUES ('AMS Pro 2 - P2S', 'AMS Pro 2 unit connected to P2S, acts as dryer', 4) ON CONFLICT DO NOTHING;
        INSERT INTO public.storage_locations (name, description, capacity) VALUES ('FLSUN S1 Pro', 'Spool attached to FLSUN S1 Pro printer, acts as dryer', 1) ON CONFLICT DO NOTHING;
        INSERT INTO public.storage_locations (name, description, capacity) VALUES ('Creality Dryer', 'Creality dryer unit, holds up to 2 spools', 2) ON CONFLICT DO NOTHING;
        INSERT INTO public.storage_locations (name, description, capacity) VALUES ('Polymaker Dryer', 'Polymaker dryer unit, holds 1 spool', 1) ON CONFLICT DO NOTHING;
      "
      echo "Basic data inserted!"

      echo "Adding sample colors..."
      PGPASSWORD=$PGPASSWORD psql -h $PGHOST -p $PGPORT -U $PGUSER -d "$PGDATABASE" -v ON_ERROR_STOP=0 -c "
        INSERT INTO public.colors (name, code) VALUES ('Dark Gray (Bambu Lab)', '#545454') ON CONFLICT DO NOTHING;
        INSERT INTO public.colors (name, code) VALUES ('Black (Bambu Lab)', '#000000') ON CONFLICT DO NOTHING;
        INSERT INTO public.colors (name, code) VALUES ('White (Bambu Lab)', '#FFFFFF') ON CONFLICT DO NOTHING;
        INSERT INTO public.colors (name, code) VALUES ('Red (Bambu Lab)', '#C12E1F') ON CONFLICT DO NOTHING;
        INSERT INTO public.colors (name, code) VALUES ('Blue (Bambu Lab)', '#0A2989') ON CONFLICT DO NOTHING;
      "
      echo "Sample colors inserted!"
    else
      echo "INIT_SAMPLE_DATA is not set to true. Skipping sample data insertion."
    fi

    # Create the lock file after initialization
    touch "$LOCK_FILE"
    echo "Initialization completed and lock file created."
  else
    echo "Data already exists, skipping initialization."
    touch "$LOCK_FILE"
  fi
fi

# Run the migration to add user_id column
echo "Running migration to add user_id column to filaments table..."
npx tsx run-migration.ts || echo "Migration failed, but continuing..."

# Start the application
echo "Starting application..."
exec "$@"
