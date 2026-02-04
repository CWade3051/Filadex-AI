#!/bin/bash
# =============================================================================
# Stop Production Docker Environment
# =============================================================================

cd "$(dirname "$0")/.."

echo "🛑 Stopping Filadex Production Docker Environment..."

docker compose -p filadex-prod stop

echo ""
echo "✅ Production Docker containers stopped"
echo "   Data is preserved. Use ./scripts/run-docker.sh to start again."
