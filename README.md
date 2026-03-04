# Nexus Terminal (Self-Hosted Warp-Style Dev Workspace)

Nexus Terminal is a self-hosted AI-enabled terminal workspace you can run in your homelab.

It now includes these requested upgrades:
- Monaco editor + syntax highlighting
- Multiple terminal tabs/workspaces
- SSH profile manager
- RBAC + audit logging + secrets vault baseline

---

## 1) What this gives you

- **Terminal workspaces**: Multiple shell tabs over websocket + `node-pty`
- **Explorer + editor**: Browse files and edit with Monaco
- **AI assistant**: Ask devops/coding questions from inside the app (Ollama local by default)
- **Ops center**:
  - SSH profile CRUD
  - Secrets metadata + storage
  - Audit event feed
- **Role model**:
  - `viewer`: read + AI + audit + read SSH profiles
  - `operator`: viewer + shell + file writes + SSH writes
  - `admin`: operator + secrets management

---

## 2) Prerequisites

- Docker Desktop / Docker Engine
- Node.js 20+ (if running directly)
- Optional local AI backend: Ollama

---

## 3) Local run

```bash
npm install
npm start
```

Open `http://localhost:3000`

---

## 4) Initial auth (RBAC)

RBAC is controlled by env var:

- `AUTH_ENABLED=false` (default): local admin bypass for single-user homelab
- `AUTH_ENABLED=true`: API requires headers:
  - `x-nexus-user`
  - `x-nexus-token`

Default user store is `data/users.json` (auto-created):

```json
{
  "users": [
    { "username": "admin", "token": "changeme", "role": "admin" }
  ]
}
```

Change token immediately.

---

## 5) Free/local AI setup (Ollama)

```bash
ollama pull qwen2.5-coder:7b
ollama serve
```

Nexus default endpoint:
- `OLLAMA_URL=http://127.0.0.1:11434/api/generate`
- `OLLAMA_MODEL=qwen2.5-coder:7b`

---

## 6) Docker deploy (homelab)

Create `docker-compose.yml`:

```yaml
version: "3.8"
services:
  nexus-terminal:
    build: .
    container_name: nexus-terminal
    ports:
      - "3000:3000"
    environment:
      - PORT=3000
      - AUTH_ENABLED=true
      - OLLAMA_URL=http://host.docker.internal:11434/api/generate
      - OLLAMA_MODEL=qwen2.5-coder:7b
      - ALLOW_ANY_PATH=true
      - DATA_DIR=/app/data
    volumes:
      - ./data:/app/data
      # Linux host (very permissive)
      - /:/host:rw
    stdin_open: true
    tty: true
```

Then:

```bash
docker compose up -d --build
```

---

## 7) Windows + Docker Desktop host mounts

```yaml
volumes:
  - C:\\:/mnt/c:rw
  - D:\\:/mnt/d:rw
```

Browse those from Explorer.

---

## 8) API surface

- `GET /api/health`
- `GET /api/files?path=...`
- `GET /api/file?path=...`
- `POST /api/file`
- `POST /api/ai`
- `GET/POST/DELETE /api/ssh-profiles`
- `GET/POST/DELETE /api/secrets`
- `GET /api/audit`

---

## 9) Terminal workspace events (Socket.IO)

- `terminal:create`
- `terminal:created`
- `terminal:input`
- `terminal:resize`
- `terminal:data`
- `terminal:close`
- `terminal:closed`

---

## 10) Security notes (important)

- Secrets are baseline storage (not hardware-backed vault encryption).
- Do not expose without an upstream auth gateway + TLS.
- Prefer `ALLOW_ANY_PATH=false` for safer path scope.
- Restrict Docker host mounts to only required directories.

---

## 11) Next recommended hardening

- Replace simple token store with OIDC + JWT + signed sessions
- Encrypt secrets at rest using external KMS/Vault
- Add audit export to Loki/Elastic/SIEM
- Add SSH execution broker with command allowlists and approvals
