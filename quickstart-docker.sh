#!/usr/bin/env bash
set -euo pipefail

REPO_URL="https://github.com/CWade3051/Filadex-AI.git"
PROJECT_DIR="Filadex-AI"
SCRIPT_DIR="$(cd -- "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OS_NAME="$(uname -s | tr '[:upper:]' '[:lower:]')"

prompt_yes_no() {
  local prompt="$1"
  local default="${2:-y}"
  local reply=""

  while true; do
    if [[ "$default" == "y" ]]; then
      read -r -p "$prompt [Y/n]: " reply
      reply="${reply:-y}"
    else
      read -r -p "$prompt [y/N]: " reply
      reply="${reply:-n}"
    fi
    case "$reply" in
      y|Y|yes|YES) return 0 ;;
      n|N|no|NO) return 1 ;;
      *) echo "Please enter y or n." ;;
    esac
  done
}

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

get_sudo_cmd() {
  if command_exists sudo; then
    echo "sudo"
  else
    echo ""
  fi
}

require_root_or_sudo() {
  local sudo_cmd
  sudo_cmd=$(get_sudo_cmd)
  if [[ -z "$sudo_cmd" ]] && [[ "$(id -u)" -ne 0 ]]; then
    echo "This step needs sudo/root. Please re-run with sudo or install manually."
    exit 1
  fi
}

detect_host_ip() {
  local ip=""
  if command_exists ipconfig; then
    ip=$(ipconfig getifaddr en0 2>/dev/null || true)
    if [[ -z "$ip" ]]; then
      ip=$(ipconfig getifaddr en1 2>/dev/null || true)
    fi
  fi
  if [[ -z "$ip" ]]; then
    ip=$(hostname -I 2>/dev/null | awk '{print $1}' || true)
  fi
  if [[ -z "$ip" ]] && command_exists ifconfig; then
    ip=$(ifconfig | awk '/inet / && $2 != "127.0.0.1" {print $2; exit}')
  fi
  echo "$ip"
}

set_env_var() {
  local key="$1"
  local value="$2"
  if [[ ! -f .env ]]; then
    touch .env
  fi
  if grep -q "^${key}=" .env; then
    if [[ "$OSTYPE" == "darwin"* ]]; then
      sed -i '' "s|^${key}=.*|${key}=${value}|" .env
    else
      sed -i "s|^${key}=.*|${key}=${value}|" .env
    fi
  else
    echo "${key}=${value}" >> .env
  fi
}

set_env_var_if_missing() {
  local key="$1"
  local value="$2"
  if [[ ! -f .env ]] || ! grep -q "^${key}=" .env; then
    set_env_var "$key" "$value"
  fi
}

ensure_git() {
  if command_exists git; then
    return 0
  fi

  echo "Git was not found."
  if ! prompt_yes_no "Install Git now?" "y"; then
    echo "Git is required. Please install Git and re-run."
    exit 1
  fi

  if [[ "$OS_NAME" == "darwin"* ]]; then
    if command_exists brew; then
      brew install git
    else
      echo "Installing Xcode Command Line Tools (includes Git)..."
      xcode-select --install || true
      echo "Finish the installation, then press Enter to continue."
      read -r
    fi
    return 0
  fi

  if [[ "$OS_NAME" == "linux"* ]]; then
    require_root_or_sudo
    local sudo_cmd
    sudo_cmd=$(get_sudo_cmd)
    if command_exists apt-get; then
      $sudo_cmd apt-get update
      $sudo_cmd apt-get install -y git
    elif command_exists dnf; then
      $sudo_cmd dnf install -y git
    elif command_exists yum; then
      $sudo_cmd yum install -y git
    elif command_exists pacman; then
      $sudo_cmd pacman -Sy --noconfirm git
    else
      echo "Please install git manually and re-run."
      exit 1
    fi
    return 0
  fi

  echo "Please install git manually and re-run."
  exit 1
}

ensure_repo() {
  if [[ -f "docker-compose.template.yml" ]]; then
    return 0
  fi

  if [[ -f "${SCRIPT_DIR}/docker-compose.template.yml" ]]; then
    cd "$SCRIPT_DIR"
    return 0
  fi

  echo "This script can be run from anywhere."
  if prompt_yes_no "Clone the repo into ./${PROJECT_DIR}?" "y"; then
    ensure_git
    local dest=""
    read -r -p "Destination folder [${PROJECT_DIR}]: " dest
    dest="${dest:-$PROJECT_DIR}"
    git clone "$REPO_URL" "$dest"
    cd "$dest"
  else
    exit 1
  fi
}

ensure_docker() {
  if command_exists docker; then
    return 0
  fi

  echo "Docker was not found."
  if ! prompt_yes_no "Install Docker Desktop now?" "y"; then
    echo "Please install Docker Desktop and re-run this script."
    exit 1
  fi

  if [[ "$OS_NAME" == "darwin"* ]]; then
    if command_exists brew; then
      brew install --cask docker
    else
      echo "Homebrew not found. Opening Docker Desktop download page..."
      open "https://www.docker.com/products/docker-desktop/" || true
      echo "Install Docker Desktop, then press Enter to continue."
      read -r
    fi
    return 0
  fi

  if [[ "$OS_NAME" == "linux"* ]]; then
    require_root_or_sudo
    local sudo_cmd
    sudo_cmd=$(get_sudo_cmd)
    echo "Installing Docker using the official convenience script..."
    if ! command_exists curl && ! command_exists wget; then
      if command_exists apt-get; then
        $sudo_cmd apt-get update
        $sudo_cmd apt-get install -y curl
      elif command_exists dnf; then
        $sudo_cmd dnf install -y curl
      elif command_exists yum; then
        $sudo_cmd yum install -y curl
      elif command_exists pacman; then
        $sudo_cmd pacman -Sy --noconfirm curl
      fi
    fi

    if command_exists curl; then
      curl -fsSL https://get.docker.com -o /tmp/get-docker.sh
      $sudo_cmd sh /tmp/get-docker.sh
    elif command_exists wget; then
      wget -qO /tmp/get-docker.sh https://get.docker.com
      $sudo_cmd sh /tmp/get-docker.sh
    else
      echo "curl or wget is required to install Docker. Please install it and re-run."
      exit 1
    fi

    if command_exists systemctl; then
      $sudo_cmd systemctl enable --now docker
    fi

    if command_exists usermod && [[ "$(id -u)" -ne 0 ]]; then
      $sudo_cmd usermod -aG docker "$USER" || true
      echo "Added your user to the docker group. You may need to log out and back in."
    fi
    return 0
  fi

  echo "Please install Docker from https://www.docker.com/products/docker-desktop/"
  echo "Then re-run this script."
  exit 1
}

ensure_docker_running() {
  if docker info >/dev/null 2>&1; then
    return 0
  fi

  echo "Starting Docker..."
  if [[ "$OS_NAME" == "darwin"* ]]; then
    open -a Docker || true
  elif [[ "$OS_NAME" == "linux"* ]]; then
    local sudo_cmd
    sudo_cmd=$(get_sudo_cmd)
    if command_exists systemctl; then
      $sudo_cmd systemctl start docker || true
    fi
  fi

  echo "Waiting for Docker to start..."
  for _ in {1..30}; do
    if docker info >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done

  echo "Docker did not become ready. Please start Docker Desktop and re-run."
  exit 1
}

ensure_compose() {
  if docker compose version >/dev/null 2>&1; then
    echo "Using docker compose"
    return 0
  fi
  if command_exists docker-compose; then
    echo "Using docker-compose"
    return 0
  fi
  echo "Docker Compose was not found. Please install Docker Desktop and re-run."
  exit 1
}

get_compose_cmd() {
  if docker compose version >/dev/null 2>&1; then
    echo "docker compose"
  else
    echo "docker-compose"
  fi
}

ensure_env() {
  local keep_env="n"
  if [[ -f .env && -s .env ]]; then
    if prompt_yes_no "Found existing .env. Keep current values?" "y"; then
      keep_env="y"
    fi
  fi

  local jwt_secret=""
  if command_exists openssl; then
    jwt_secret=$(openssl rand -hex 32)
  elif command_exists python3; then
    jwt_secret=$(python3 - <<'PY'
import secrets
print(secrets.token_hex(32))
PY
)
  elif command_exists uuidgen; then
    jwt_secret=$(uuidgen | tr -d '-' | tr '[:upper:]' '[:lower:]')
  else
    jwt_secret="changeme-$(date +%s)"
  fi

  if [[ "$keep_env" == "y" ]]; then
    set_env_var_if_missing "JWT_SECRET" "$jwt_secret"
    return 0
  fi

  echo "Configuring environment..."

  if prompt_yes_no "Enable mobile QR uploads? (requires LAN IP)" "y"; then
    local detected_ip
    detected_ip=$(detect_host_ip)
    if [[ -n "$detected_ip" ]] && prompt_yes_no "Use detected HOST_IP: $detected_ip ?" "y"; then
      set_env_var "HOST_IP" "$detected_ip"
    else
      read -r -p "Enter your HOST_IP (LAN IP): " manual_ip
      if [[ -n "$manual_ip" ]]; then
        set_env_var "HOST_IP" "$manual_ip"
      fi
    fi
  else
    set_env_var_if_missing "HOST_IP" ""
  fi

  read -r -p "Change app port? (default 8080) Enter to keep: " app_port
  if [[ -n "$app_port" ]]; then
    set_env_var "APP_PORT" "$app_port"
  fi

  read -r -p "Set default admin password? (Enter to keep 'admin'): " admin_password
  if [[ -n "$admin_password" ]]; then
    set_env_var "DEFAULT_ADMIN_PASSWORD" "$admin_password"
  fi

  if prompt_yes_no "Add OpenAI API key now? (optional)" "n"; then
    read -r -p "Enter OPENAI_API_KEY: " openai_key
    if [[ -n "$openai_key" ]]; then
      set_env_var "OPENAI_API_KEY" "$openai_key"
    fi
  fi

  set_env_var_if_missing "JWT_SECRET" "$jwt_secret"
}

ensure_compose_file() {
  if [[ ! -f docker-compose.yml ]]; then
    cp docker-compose.template.yml docker-compose.yml
  fi
}

start_containers() {
  local compose_cmd
  compose_cmd=$(get_compose_cmd)
  $compose_cmd -p filadex-prod up -d --build
  $compose_cmd -p filadex-prod ps
}

wait_for_app() {
  local port="8080"
  if [[ -f .env ]]; then
    port=$(grep '^APP_PORT=' .env | cut -d'=' -f2- || echo "8080")
    port="${port:-8080}"
  fi

  echo "Waiting for app to respond on http://localhost:${port} ..."
  for _ in {1..30}; do
    if command_exists curl; then
      if curl -fs "http://localhost:${port}" >/dev/null 2>&1; then
        echo "App is running."
        return 0
      fi
    else
      if nc -z localhost "$port" >/dev/null 2>&1; then
        echo "App is running."
        return 0
      fi
    fi
    sleep 2
  done

  echo "App did not respond yet. It may still be starting."
}

main() {
  ensure_repo
  ensure_docker
  ensure_docker_running
  ensure_compose
  ensure_env
  ensure_compose_file
  start_containers
  wait_for_app

  echo ""
  echo "Done. Open: http://localhost:8080"
  echo "Default login: admin / admin"
  echo ""
}

main "$@"
