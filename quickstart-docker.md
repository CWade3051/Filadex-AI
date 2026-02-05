# Quickstart (Production Docker)

## One-Command Setup (Recommended)
If you just want it to work and don’t want to learn Docker yet, use the helper script. It checks for Docker, installs it if you want, asks a few questions, and starts the app.

### macOS / Linux
```bash
chmod +x quickstart-docker.sh
./quickstart-docker.sh
```

### Windows (PowerShell)
```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\quickstart-docker.ps1
```

These scripts can run from the repo root, or if you run them elsewhere they will offer to clone the repo for you.
If Docker Desktop or Git is missing, they will offer to install it (or open the download page) and then continue.

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
