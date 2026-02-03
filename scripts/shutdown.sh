#!/bin/bash
# =============================================================================
# Stop Local Development Environment
# =============================================================================

cd "$(dirname "$0")/.."

echo "🛑 Stopping Filadex Local Development Environment..."

# Kill dev server on port 5001
if lsof -ti:5001 > /dev/null 2>&1; then
    echo "📴 Stopping development server..."
    lsof -ti:5001 | xargs kill -9 2>/dev/null || true
    echo "✅ Development server stopped"
else
    echo "ℹ️  Development server not running"
fi

# Stop dev database container
if docker ps --format '{{.Names}}' | grep -q 'filadex-db-dev'; then
    echo "📦 Stopping development database..."
    docker compose -f docker-compose.dev.yml stop
    echo "✅ Development database stopped"
else
    echo "ℹ️  Development database not running"
fi

echo ""
echo "✅ Local development environment stopped"
echo "   Data is preserved. Use ./scripts/run.sh to start again."
