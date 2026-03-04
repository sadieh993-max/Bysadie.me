# Nexus Terminal (Warp-style for Homelab)

Nexus Terminal is a self-hosted, web-based AI developer terminal inspired by tools like Warp.
It gives you:

- Interactive terminal in browser (real shell using `node-pty`)
- File explorer + basic editor tabs
- AI assistant panel (local Ollama by default, so you can run free on homelab)
- Docker-friendly deployment model

> ⚠️ This is powerful. If you allow full host mounts, the app can read/write your files. Run only in trusted networks.

## 1) Prerequisites

- Docker Desktop (Windows/macOS) or Docker Engine (Linux)
- For non-Docker mode: Node.js 20+
- Optional for free/local AI: [Ollama](https://ollama.com/) and a local model (e.g. `qwen2.5-coder:7b`)

## 2) Quick start (local Node)

```bash
npm install
npm start
```

Open: `http://localhost:3000`

## 3) Free local AI setup (Ollama)

Install and run Ollama, then pull model:

```bash
ollama pull qwen2.5-coder:7b
ollama serve
```

Nexus will auto-call `http://127.0.0.1:11434/api/generate`.

## 4) Docker deployment for homelab

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
      - OLLAMA_URL=http://host.docker.internal:11434/api/generate
      - OLLAMA_MODEL=qwen2.5-coder:7b
      - ALLOW_ANY_PATH=true
    volumes:
      # Linux host full root mount (very permissive)
      - /:/host:rw
      # Add any extra project folders as needed
      # - /srv/projects:/workspace/projects:rw
    stdin_open: true
    tty: true
```

Then run:

```bash
docker compose up -d --build
```

Open `http://<your-homelab-ip>:3000`.

## 5) Windows + Docker Desktop host file access

If running on Docker Desktop Windows, mount Windows paths explicitly:

```yaml
volumes:
  - C:\\:/mnt/c:rw
  - D:\\:/mnt/d:rw
```

Then browse `/mnt/c` or `/mnt/d` in the Nexus explorer.

## 6) Feature map to your request

- **Tabs + code layout**: Terminal / Explorer / Editor / AI tabs.
- **Terminal backend**: Real `/bin/bash` (Linux) or `powershell.exe` (Windows).
- **Read/write files**: Explorer + editor APIs.
- **AI command help**: `/api/ai` route with command-focused system prompt.
- **Large homelab support**: direct shell, direct filesystem browsing.

## 7) Security hardening (recommended)

Before exposing beyond LAN:

- Put behind reverse proxy with auth (Authelia, Traefik forward auth, Cloudflare Access)
- Set `ALLOW_ANY_PATH=false` to restrict to home directory
- Run as non-root in container
- Add command allowlist if sharing with others

## 8) API endpoints

- `GET /api/health` - backend status
- `GET /api/files?path=/some/path` - list directory
- `GET /api/file?path=/some/file` - read file
- `POST /api/file` - write file `{ path, content }`
- `POST /api/ai` - ask AI `{ prompt, cwd }`

## 9) Important limits vs full Warp

Warp has proprietary features (cloud sync, advanced agent workflows, polished native UX).
This project is a **self-hosted open equivalent baseline** you can extend freely.

For next upgrades, add:

- Monaco editor + syntax highlighting
- Multiple terminal tabs/workspaces
- SSH profile manager
- RBAC, command audit logs, and secrets vault integration
