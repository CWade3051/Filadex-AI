# Quickstart (Production Docker)

This guide gets Filadex running quickly using the production Docker setup.

## Prerequisites
- Docker Desktop (or Docker Engine) with Docker Compose

## 1) Get the code
```bash
git clone https://github.com/CWade3051/Filadex-AI.git
cd Filadex-AI
```

## 2) Create the Docker Compose file
```bash
cp docker-compose.template.yml docker-compose.yml
```

## 3) (Recommended) Create a `.env` file
This keeps settings out of the compose file. Minimum recommended values:
```bash
cat <<'ENV' > .env
# Required for mobile QR uploads
HOST_IP=192.168.1.100

# Optional: change app port on your host
# APP_PORT=8080

# Optional: enable AI photo import
# OPENAI_API_KEY=sk-...

# Optional: change default admin password on first boot
# DEFAULT_ADMIN_PASSWORD=admin
ENV
```

## 4) Start the production containers
Option A (recommended script):
```bash
./scripts/run-docker.sh
```

Option B (plain Docker Compose):
```bash
docker compose up -d --build
```

## 5) Open the app
- http://localhost:8080
- Default login: `admin` / `admin` (you’ll be prompted to change it)

## 6) Stop or reset
Stop:
```bash
./scripts/shutdown-docker.sh
```

Reset everything (destructive):
```bash
./scripts/reset-docker.sh
```

## Notes
- Mobile QR uploads require `HOST_IP` to be set to your machine’s LAN IP.
- Data is persisted in Docker volumes (PostgreSQL + uploads). Deleting volumes wipes data.
