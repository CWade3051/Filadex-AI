#!/bin/bash
# =============================================================================
# Start Production Docker Environment
# =============================================================================

set -e
cd "$(dirname "$0")/.."

echo "🚀 Starting Filadex Production Docker Environment..."

# Pull latest image
echo "📦 Pulling latest Docker image..."
docker compose pull

# Start containers
echo "🐳 Starting Docker containers..."
docker compose up -d

echo ""
echo "=========================================="
echo "  Production server running on:"
echo "  http://localhost:8080"
echo ""
echo "  Use ./scripts/shutdown-docker.sh to stop"
echo "=========================================="
echo ""

# Show container status
docker compose ps
