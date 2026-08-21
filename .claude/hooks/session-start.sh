#!/bin/bash
set -euo pipefail

# Only relevant for Claude Code on the web (remote sandboxed containers).
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# --- 1. Install JS dependencies ---
if command -v pnpm >/dev/null 2>&1; then
  pnpm install
else
  npm install -g pnpm@10.15.1
  pnpm install
fi

# --- 2. MariaDB (MySQL-compatible) local dev database ---
if ! command -v mysqld >/dev/null 2>&1 && ! command -v mariadbd >/dev/null 2>&1; then
  apt-get update -qq
  apt-get install -y -qq mariadb-server >/dev/null
fi

mkdir -p /run/mysqld
chown mysql:mysql /run/mysqld

if ! mysqladmin ping --silent 2>/dev/null; then
  mysqld_safe --user=mysql > /tmp/mysqld.log 2>&1 &
  for i in $(seq 1 30); do
    if mysqladmin ping --silent 2>/dev/null; then
      break
    fi
    sleep 1
  done
fi

mysql -u root -e "
CREATE DATABASE IF NOT EXISTS evte_pro CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'evte'@'localhost' IDENTIFIED BY 'evte_dev_pw';
GRANT ALL PRIVILEGES ON evte_pro.* TO 'evte'@'localhost';
FLUSH PRIVILEGES;
"

# --- 3. Env vars for this session ---
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  echo 'export DATABASE_URL="mysql://evte:evte_dev_pw@localhost:3306/evte_pro"' >> "$CLAUDE_ENV_FILE"
  echo 'export JWT_SECRET="dev-local-secret-change-in-production"' >> "$CLAUDE_ENV_FILE"
fi

if [ ! -f .env ]; then
  cat > .env << 'ENVEOF'
DATABASE_URL=mysql://evte:evte_dev_pw@localhost:3306/evte_pro
NODE_ENV=development
JWT_SECRET=dev-local-secret-change-in-production
ENVEOF
fi

# --- 4. Apply Drizzle migrations (idempotent) ---
export DATABASE_URL="mysql://evte:evte_dev_pw@localhost:3306/evte_pro"
pnpm db:push
