#!/usr/bin/env bash
set -euo pipefail

python3.11 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -e .[dev]
cp -n .env.example .env || true

echo "Bootstrap complete."
echo "Next: run docker compose -f infra/docker-compose.yml up -d"
