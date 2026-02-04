#!/bin/bash
# =============================================================================
# Setup Docker Production Environment
# =============================================================================

set -e
cd "$(dirname "$0")/.."

echo "🐳 Filadex-AI Docker Setup"
echo "=========================="
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    echo "   Visit: https://docs.docker.com/get-docker/"
    exit 1
fi
echo "✅ Docker detected: $(docker --version | head -1)"

# Check if Docker Compose is available
if ! docker compose version &> /dev/null; then
    echo "❌ Docker Compose is not available."
    echo "   Please install Docker Compose or update Docker."
    exit 1
fi
echo "✅ Docker Compose detected"

# Check if docker-compose.yml exists
if [ -f "docker-compose.yml" ]; then
    echo ""
    echo "⚠️  docker-compose.yml already exists."
    read -p "   Overwrite with fresh template? (y/n): " overwrite
    if [ "$overwrite" != "y" ]; then
        echo "   Keeping existing docker-compose.yml"
    else
        cp docker-compose.template.yml docker-compose.yml
        echo "✅ docker-compose.yml created from template"
    fi
else
    cp docker-compose.template.yml docker-compose.yml
    echo "✅ docker-compose.yml created from template"
fi

# Get local IP for QR code functionality
echo ""
echo "📱 Mobile Upload Setup"
echo "   For mobile QR code uploads to work, we need your local IP address."
echo ""

# Try to detect local IP
if command -v ifconfig &> /dev/null; then
    DETECTED_IP=$(ifconfig | grep "inet " | grep -v 127.0.0.1 | head -1 | awk '{print $2}')
elif command -v ip &> /dev/null; then
    DETECTED_IP=$(ip route get 1 | awk '{print $7}' | head -1)
fi

if [ -n "$DETECTED_IP" ]; then
    echo "   Detected IP: $DETECTED_IP"
    read -p "   Use this IP? (y/n): " use_detected
    if [ "$use_detected" = "y" ]; then
        LOCAL_IP="$DETECTED_IP"
    fi
fi

if [ -z "$LOCAL_IP" ]; then
    read -p "   Enter your local IP address (e.g., 192.168.1.100): " LOCAL_IP
fi

if [ -n "$LOCAL_IP" ]; then
    # Update HOST_IP in docker-compose.yml
    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "s/HOST_IP=.*/HOST_IP=$LOCAL_IP/" docker-compose.yml
    else
        sed -i "s/HOST_IP=.*/HOST_IP=$LOCAL_IP/" docker-compose.yml
    fi
    echo "✅ HOST_IP set to $LOCAL_IP"
else
    echo "⚠️  No IP set. Mobile QR uploads may not work."
fi

# Pull the latest Docker image
echo ""
echo "📥 Pulling latest Docker image..."
docker compose pull

echo ""
echo "✅ Docker setup complete!"
echo ""
echo "📋 Next steps:"
echo "   1. Start the application:  ./scripts/run-docker.sh"
echo "   2. Access at:              http://localhost:8080"
echo "   3. Login with:             admin / admin"
echo "   4. Add OpenAI API key in Settings for AI photo import"
echo ""
echo "📚 Other useful commands:"
echo "   ./scripts/shutdown-docker.sh  - Stop the application"
echo "   ./scripts/backup-docker.sh    - Backup your data"
echo "   ./scripts/restore-docker.sh   - Restore from backup"
echo "   ./scripts/reset-docker.sh     - Reset to fresh state"
echo ""
