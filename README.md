# Nexus Terminal (Self-Hosted Warp-Style Dev Workspace)

Nexus Terminal is a self-hosted, web-based developer workspace inspired by Warp-style flows.  
This build now includes a **landing page** with tool launch cards and fixed internal navigation links.

## Included Features

- Landing page dashboard with quick links to each workspace section
- Multi-terminal tabs/workspaces (Socket.IO + node-pty)
- Monaco editor + syntax highlighting
- File explorer and file save APIs
- AI assistant endpoint (Ollama by default)
- Ops center:
  - SSH profile manager
  - Secrets manager (baseline)
  - Audit logs
  - Launch configurations
- Warp-drive style data tools:
  - Workflows catalog (saved command templates)
  - Notebooks/runbooks (saved operational notes)
- RBAC roles: `viewer`, `operator`, `admin`

---

## 1) Quick Start (Local)

```bash
npm install
npm start
```

Open:

```text
http://localhost:3000
```

---

## 2) Auth / RBAC

Set environment variables:

- `AUTH_ENABLED=false` (default local bypass)
- `AUTH_ENABLED=true` (requires headers)

Headers used by UI + API:

- `x-nexus-user`
- `x-nexus-token`

Default user database (`data/users.json`):

```json
{
  "users": [
    { "username": "admin", "token": "changeme", "role": "admin" }
  ]
}
```

Change this token immediately in production.

---

## 3) Free AI Backend (Ollama)

```bash
ollama pull qwen2.5-coder:7b
ollama serve
```

Environment variables:

- `OLLAMA_URL=http://127.0.0.1:11434/api/generate`
- `OLLAMA_MODEL=qwen2.5-coder:7b`

---

## 4) Docker / Homelab Deploy

Example `docker-compose.yml`:

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
      - /:/host:rw
    stdin_open: true
    tty: true
```

Run:

```bash
docker compose up -d --build
```

Windows Docker Desktop volume example:

```yaml
volumes:
  - C:\\:/mnt/c:rw
  - D:\\:/mnt/d:rw
```

---

## 5) API Endpoints

Core:

- `GET /api/health`
- `GET /api/files?path=...`
- `GET /api/file?path=...`
- `POST /api/file`
- `POST /api/ai`

Ops:

- `GET/POST/DELETE /api/ssh-profiles`
- `GET/POST/DELETE /api/secrets`
- `GET /api/audit`
- `GET/POST/DELETE /api/launch-configs`

Landing tools:

- `GET/POST/DELETE /api/workflows`
- `GET/POST/DELETE /api/notebooks`

Terminal socket events:

- `terminal:create`
- `terminal:created`
- `terminal:input`
- `terminal:resize`
- `terminal:data`
- `terminal:close`
- `terminal:closed`

---

## 6) Security Notes

- Secrets storage is baseline JSON storage (not HSM/Vault encrypted).
- Put Nexus behind TLS and upstream auth for internet-exposed deployments.
- Prefer `ALLOW_ANY_PATH=false` where possible.
- Restrict host-mounted volumes to least privilege.

