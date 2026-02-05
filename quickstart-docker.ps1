$ErrorActionPreference = "Stop"

$RepoUrl = "https://github.com/CWade3051/Filadex-AI.git"
$ProjectDir = "Filadex-AI"
$ComposeMode = ""
$ScriptRoot = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }

function Prompt-YesNo {
  param(
    [string]$Message,
    [bool]$DefaultYes = $true
  )
  $default = if ($DefaultYes) { "Y/n" } else { "y/N" }
  while ($true) {
    $reply = Read-Host "$Message [$default]"
    if ([string]::IsNullOrWhiteSpace($reply)) {
      return $DefaultYes
    }
    switch ($reply.ToLower()) {
      "y" { return $true }
      "yes" { return $true }
      "n" { return $false }
      "no" { return $false }
      default { Write-Host "Please enter y or n." }
    }
  }
}

function Command-Exists {
  param([string]$Name)
  return $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

function Ensure-Git {
  if (Command-Exists "git") {
    return
  }

  Write-Host "Git was not found."
  if (-not (Prompt-YesNo "Install Git now?" $true)) {
    Write-Host "Git is required. Please install Git and re-run."
    exit 1
  }

  if (Command-Exists "winget") {
    winget install -e --id Git.Git --accept-package-agreements --accept-source-agreements
  } else {
    Start-Process "https://git-scm.com/downloads"
    Write-Host "Install Git, then re-run this script."
    exit 1
  }
}

function Ensure-Repo {
  if (Test-Path "docker-compose.template.yml") {
    return
  }

  if ($ScriptRoot -and (Test-Path (Join-Path $ScriptRoot "docker-compose.template.yml"))) {
    Set-Location $ScriptRoot
    return
  }

  Write-Host "This script can be run from anywhere."
  if (-not (Prompt-YesNo "Clone the repo into .\\$ProjectDir?" $true)) {
    exit 1
  }

  Ensure-Git

  $dest = Read-Host "Destination folder [$ProjectDir]"
  if ([string]::IsNullOrWhiteSpace($dest)) {
    $dest = $ProjectDir
  }

  git clone $RepoUrl $dest
  Set-Location $dest
}

function Ensure-Docker {
  if (Command-Exists "docker") {
    return
  }

  Write-Host "Docker was not found."
  if (-not (Prompt-YesNo "Install Docker Desktop now?" $true)) {
    Write-Host "Please install Docker Desktop and re-run this script."
    exit 1
  }

  if (Command-Exists "winget") {
    winget install -e --id Docker.DockerDesktop --accept-package-agreements --accept-source-agreements
  } else {
    Start-Process "https://www.docker.com/products/docker-desktop/"
    Write-Host "Install Docker Desktop, then re-run this script."
    exit 1
  }
}

function Ensure-DockerRunning {
  try {
    docker info | Out-Null
    return
  } catch {}

  Write-Host "Starting Docker Desktop..."
  $dockerDesktopPath = Join-Path $Env:ProgramFiles "Docker\Docker\Docker Desktop.exe"
  if (Test-Path $dockerDesktopPath) {
    Start-Process $dockerDesktopPath | Out-Null
  } else {
    Start-Process "Docker Desktop" | Out-Null
  }

  Write-Host "Waiting for Docker to start..."
  for ($i = 0; $i -lt 30; $i++) {
    try {
      docker info | Out-Null
      return
    } catch {
      Start-Sleep -Seconds 2
    }
  }

  Write-Host "Docker did not become ready. Please start Docker Desktop and re-run."
  exit 1
}

function Ensure-Compose {
  try {
    docker compose version | Out-Null
    $script:ComposeMode = "docker compose"
    return
  } catch {}

  if (Command-Exists "docker-compose") {
    $script:ComposeMode = "docker-compose"
    return
  }

  Write-Host "Docker Compose was not found. Please install Docker Desktop and re-run."
  exit 1
}

function Invoke-Compose {
  param([string[]]$Args)
  if ($script:ComposeMode -eq "docker compose") {
    docker compose @Args
  } else {
    docker-compose @Args
  }
}

function Set-EnvVar {
  param([string]$Key, [string]$Value)
  if (-not (Test-Path ".env")) {
    New-Item -ItemType File -Path ".env" | Out-Null
  }
  $lines = Get-Content ".env" -ErrorAction SilentlyContinue
  if ($lines -match "^$Key=") {
    $lines = $lines | ForEach-Object { if ($_ -match "^$Key=") { "$Key=$Value" } else { $_ } }
    Set-Content ".env" $lines
  } else {
    Add-Content ".env" "$Key=$Value"
  }
}

function Set-EnvVarIfMissing {
  param([string]$Key, [string]$Value)
  if (-not (Test-Path ".env")) {
    Set-EnvVar $Key $Value
    return
  }
  $lines = Get-Content ".env" -ErrorAction SilentlyContinue
  if (-not ($lines -match "^$Key=")) {
    Add-Content ".env" "$Key=$Value"
  }
}

function Detect-HostIp {
  $ip = Get-NetIPAddress -AddressFamily IPv4 | Where-Object {
    $_.IPAddress -notlike "169.254*" -and $_.IPAddress -ne "127.0.0.1"
  } | Select-Object -First 1 -ExpandProperty IPAddress

  return $ip
}

function Ensure-Env {
  $keepEnv = $false
  if (Test-Path ".env") {
    $content = Get-Content ".env" -ErrorAction SilentlyContinue
    if ($content.Count -gt 0) {
      $keepEnv = Prompt-YesNo "Found existing .env. Keep current values?" $true
    }
  }

  $jwtSecret = [guid]::NewGuid().ToString("N")

  if ($keepEnv) {
    Set-EnvVarIfMissing "JWT_SECRET" $jwtSecret
    return
  }

  Write-Host "Configuring environment..."

  if (Prompt-YesNo "Enable mobile QR uploads? (requires LAN IP)" $true) {
    $detectedIp = Detect-HostIp
    if ($detectedIp -and (Prompt-YesNo "Use detected HOST_IP: $detectedIp ?" $true)) {
      Set-EnvVar "HOST_IP" $detectedIp
    } else {
      $manualIp = Read-Host "Enter your HOST_IP (LAN IP)"
      if ($manualIp) {
        Set-EnvVar "HOST_IP" $manualIp
      }
    }
  } else {
    Set-EnvVarIfMissing "HOST_IP" ""
  }

  $appPort = Read-Host "Change app port? (default 8080) Enter to keep"
  if ($appPort) {
    Set-EnvVar "APP_PORT" $appPort
  }

  $adminPassword = Read-Host "Set default admin password? (Enter to keep 'admin')"
  if ($adminPassword) {
    Set-EnvVar "DEFAULT_ADMIN_PASSWORD" $adminPassword
  }

  if (Prompt-YesNo "Add OpenAI API key now? (optional)" $false) {
    $openaiKey = Read-Host "Enter OPENAI_API_KEY"
    if ($openaiKey) {
      Set-EnvVar "OPENAI_API_KEY" $openaiKey
    }
  }

  Set-EnvVarIfMissing "JWT_SECRET" $jwtSecret
}

function Ensure-ComposeFile {
  if (-not (Test-Path "docker-compose.yml")) {
    Copy-Item "docker-compose.template.yml" "docker-compose.yml"
  }
}

function Start-Containers {
  Invoke-Compose @("-p","filadex-prod","up","-d","--build")
  Invoke-Compose @("-p","filadex-prod","ps")
}

function Wait-ForApp {
  $port = 8080
  if (Test-Path ".env") {
    $line = Get-Content ".env" | Where-Object { $_ -match "^APP_PORT=" } | Select-Object -First 1
    if ($line) {
      $port = $line.Split("=",2)[1]
      if (-not $port) { $port = 8080 }
    }
  }

  Write-Host "Waiting for app to respond on http://localhost:$port ..."
  for ($i = 0; $i -lt 30; $i++) {
    $result = Test-NetConnection -ComputerName "localhost" -Port $port -WarningAction SilentlyContinue
    if ($result.TcpTestSucceeded) {
      Write-Host "App is running."
      return
    }
    Start-Sleep -Seconds 2
  }

  Write-Host "App did not respond yet. It may still be starting."
}

Ensure-Repo
Ensure-Docker
Ensure-DockerRunning
Ensure-Compose
Ensure-Env
Ensure-ComposeFile
Start-Containers
Wait-ForApp

Write-Host ""
Write-Host "Done. Open: http://localhost:8080"
Write-Host "Default login: admin / admin"
Write-Host ""
