#!/bin/bash
# =============================================================================
# Start Local Development Environment
# =============================================================================

set -e
cd "$(dirname "$0")/.."

echo "🚀 Starting Filadex Local Development Environment..."

# Start dev database if not running
if ! docker ps --format '{{.Names}}' | grep -q 'filadex-db-dev'; then
    echo "📦 Starting development database..."
    docker compose -f docker-compose.dev.yml up -d
    echo "⏳ Waiting for database to be ready..."
    sleep 3
else
    echo "✅ Development database already running"
fi

# Check if port 5001 is in use
if lsof -ti:5001 > /dev/null 2>&1; then
    echo "⚠️  Port 5001 is in use. Killing existing process..."
    lsof -ti:5001 | xargs kill -9 2>/dev/null || true
    sleep 1
fi

echo "🔧 Starting development server..."
echo ""
echo "=========================================="
echo "  Development server starting on:"
echo "  http://localhost:5001"
echo ""
echo "  Login: admin / admin"
echo "  Press Ctrl+C to stop"
echo "=========================================="
echo ""

npm run dev
