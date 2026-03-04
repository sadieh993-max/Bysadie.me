const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs/promises');
const os = require('os');
const crypto = require('crypto');
const { Server } = require('socket.io');
const pty = require('node-pty');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = Number(process.env.PORT || 3000);
const SHELL = process.env.SHELL || (process.platform === 'win32' ? 'powershell.exe' : '/bin/bash');
const ALLOW_ANY_PATH = process.env.ALLOW_ANY_PATH !== 'false';
const HOME_DIR = os.homedir();
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const AUTH_ENABLED = process.env.AUTH_ENABLED === 'true';
const USERS_FILE = process.env.USERS_FILE || path.join(DATA_DIR, 'users.json');
const SSH_FILE = path.join(DATA_DIR, 'ssh-profiles.json');
const SECRETS_FILE = path.join(DATA_DIR, 'secrets.json');
const AUDIT_FILE = path.join(DATA_DIR, 'audit.log');

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const defaultUsers = {
  users: [{ username: 'admin', token: 'changeme', role: 'admin' }]
};

const rolePermissions = {
  viewer: new Set(['file_read', 'file_list', 'ai_query', 'audit_read', 'ssh_read']),
  operator: new Set(['file_read', 'file_list', 'file_write', 'ai_query', 'shell', 'audit_read', 'ssh_read', 'ssh_write']),
  admin: new Set([
    'file_read',
    'file_list',
    'file_write',
    'ai_query',
    'shell',
    'audit_read',
    'ssh_read',
    'ssh_write',
    'secret_read',
    'secret_write'
  ])
};

async function ensureDataFiles() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await ensureJsonFile(USERS_FILE, defaultUsers);
  await ensureJsonFile(SSH_FILE, { profiles: [] });
  await ensureJsonFile(SECRETS_FILE, { secrets: [] });
  await fs.appendFile(AUDIT_FILE, '');
}

async function ensureJsonFile(file, content) {
  try {
    await fs.access(file);
  } catch {
    await fs.writeFile(file, JSON.stringify(content, null, 2));
  }
}

async function readJson(file) {
  const raw = await fs.readFile(file, 'utf8');
  return JSON.parse(raw);
}

async function writeJson(file, value) {
  await fs.writeFile(file, JSON.stringify(value, null, 2));
}

function safeResolve(inputPath = HOME_DIR) {
  const cleaned = String(inputPath || HOME_DIR).replace(/^~(?=$|[\\/])/, HOME_DIR);
  const resolved = path.resolve(cleaned);

  if (ALLOW_ANY_PATH) {
    return resolved;
  }

  if (!resolved.startsWith(HOME_DIR)) {
    return HOME_DIR;
  }

  return resolved;
}

async function logAudit(user, action, target, status, details = '') {
  const line = JSON.stringify({
    at: new Date().toISOString(),
    user,
    action,
    target,
    status,
    details
  });
  await fs.appendFile(AUDIT_FILE, `${line}\n`);
}

async function getAuthContext(req) {
  if (!AUTH_ENABLED) {
    return { username: 'local-admin', role: 'admin' };
  }

  const username = req.header('x-nexus-user');
  const token = req.header('x-nexus-token');

  if (!username || !token) {
    return null;
  }

  const db = await readJson(USERS_FILE);
  const user = db.users.find((u) => u.username === username && u.token === token);
  if (!user) {
    return null;
  }

  return { username: user.username, role: user.role };
}

function requirePermission(permission) {
  return async (req, res, next) => {
    try {
      const auth = await getAuthContext(req);
      if (!auth) {
        return res.status(401).json({ error: 'Unauthorized. Supply x-nexus-user and x-nexus-token headers.' });
      }

      req.auth = auth;
      const allowed = rolePermissions[auth.role] || new Set();
      if (!allowed.has(permission)) {
        await logAudit(auth.username, permission, req.path, 'denied', 'insufficient role');
        return res.status(403).json({ error: `Role ${auth.role} does not allow ${permission}.` });
      }
      return next();
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  };
}

async function listDirectory(targetPath) {
  const resolved = safeResolve(targetPath);
  const stats = await fs.stat(resolved);
  if (!stats.isDirectory()) {
    throw new Error('Path is not a directory');
  }

  const entries = await fs.readdir(resolved, { withFileTypes: true });
  return {
    path: resolved,
    entries: entries
      .map((entry) => ({
        name: entry.name,
        type: entry.isDirectory() ? 'directory' : 'file'
      }))
      .sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === 'directory' ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      })
  };
}

app.get('/api/health', async (req, res) => {
  const auth = await getAuthContext(req);
  res.json({
    ok: true,
    shell: SHELL,
    home: HOME_DIR,
    allowAnyPath: ALLOW_ANY_PATH,
    authEnabled: AUTH_ENABLED,
    user: auth?.username || null,
    role: auth?.role || null
  });
});

app.get('/api/files', requirePermission('file_list'), async (req, res) => {
  try {
    const data = await listDirectory(req.query.path);
    await logAudit(req.auth.username, 'file_list', data.path, 'ok');
    res.json(data);
  } catch (error) {
    await logAudit(req.auth.username, 'file_list', req.query.path || '', 'error', error.message);
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/file', requirePermission('file_read'), async (req, res) => {
  try {
    const target = safeResolve(req.query.path);
    const content = await fs.readFile(target, 'utf8');
    await logAudit(req.auth.username, 'file_read', target, 'ok');
    res.json({ path: target, content });
  } catch (error) {
    await logAudit(req.auth.username, 'file_read', req.query.path || '', 'error', error.message);
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/file', requirePermission('file_write'), async (req, res) => {
  try {
    const target = safeResolve(req.body.path);
    await fs.writeFile(target, req.body.content ?? '', 'utf8');
    await logAudit(req.auth.username, 'file_write', target, 'ok');
    res.json({ ok: true, path: target });
  } catch (error) {
    await logAudit(req.auth.username, 'file_write', req.body.path || '', 'error', error.message);
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/ai', requirePermission('ai_query'), async (req, res) => {
  const { prompt, cwd } = req.body || {};

  if (!prompt) {
    return res.status(400).json({ error: 'Prompt is required.' });
  }

  const systemPrompt = [
    'You are Nexus Terminal AI, a concise Linux/devops helper.',
    `Current working directory: ${safeResolve(cwd || HOME_DIR)}.`,
    'Return actionable command suggestions and explain risks when commands are destructive.'
  ].join('\n');

  const ollamaUrl = process.env.OLLAMA_URL || 'http://127.0.0.1:11434/api/generate';
  const model = process.env.OLLAMA_MODEL || 'qwen2.5-coder:7b';

  try {
    const response = await fetch(ollamaUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: false,
        prompt: `${systemPrompt}\n\nUser: ${prompt}\nAssistant:`
      })
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`AI backend error: ${response.status} ${detail}`);
    }

    const data = await response.json();
    await logAudit(req.auth.username, 'ai_query', safeResolve(cwd || HOME_DIR), 'ok');
    return res.json({ reply: data.response || 'No response received from model.' });
  } catch (error) {
    await logAudit(req.auth.username, 'ai_query', safeResolve(cwd || HOME_DIR), 'error', error.message);
    return res.json({
      reply:
        'AI backend not reachable. Install/start Ollama and pull a model, e.g. `ollama pull qwen2.5-coder:7b`.',
      details: error.message
    });
  }
});

app.get('/api/ssh-profiles', requirePermission('ssh_read'), async (_req, res) => {
  const db = await readJson(SSH_FILE);
  res.json(db);
});

app.post('/api/ssh-profiles', requirePermission('ssh_write'), async (req, res) => {
  const { name, host, port, username, keyPath } = req.body || {};
  if (!name || !host || !username) {
    return res.status(400).json({ error: 'name, host, and username are required.' });
  }

  const db = await readJson(SSH_FILE);
  const profile = {
    id: crypto.randomUUID(),
    name,
    host,
    port: Number(port || 22),
    username,
    keyPath: keyPath || '~/.ssh/id_rsa'
  };
  db.profiles = [profile, ...db.profiles.filter((p) => p.name !== name)];
  await writeJson(SSH_FILE, db);
  await logAudit(req.auth.username, 'ssh_write', host, 'ok', `profile ${name}`);
  res.json({ ok: true, profile });
});

app.delete('/api/ssh-profiles/:id', requirePermission('ssh_write'), async (req, res) => {
  const db = await readJson(SSH_FILE);
  const before = db.profiles.length;
  db.profiles = db.profiles.filter((p) => p.id !== req.params.id);
  await writeJson(SSH_FILE, db);
  await logAudit(req.auth.username, 'ssh_write', req.params.id, 'ok', 'delete');
  res.json({ ok: true, removed: before - db.profiles.length });
});

app.get('/api/secrets', requirePermission('secret_read'), async (_req, res) => {
  const db = await readJson(SECRETS_FILE);
  res.json({ secrets: db.secrets.map((s) => ({ id: s.id, name: s.name, updatedAt: s.updatedAt })) });
});

app.post('/api/secrets', requirePermission('secret_write'), async (req, res) => {
  const { name, value } = req.body || {};
  if (!name || !value) {
    return res.status(400).json({ error: 'name and value required' });
  }
  const db = await readJson(SECRETS_FILE);
  const item = { id: crypto.randomUUID(), name, value, updatedAt: new Date().toISOString() };
  db.secrets = [item, ...db.secrets.filter((s) => s.name !== name)];
  await writeJson(SECRETS_FILE, db);
  await logAudit(req.auth.username, 'secret_write', name, 'ok');
  res.json({ ok: true });
});

app.delete('/api/secrets/:id', requirePermission('secret_write'), async (req, res) => {
  const db = await readJson(SECRETS_FILE);
  const before = db.secrets.length;
  db.secrets = db.secrets.filter((s) => s.id !== req.params.id);
  await writeJson(SECRETS_FILE, db);
  await logAudit(req.auth.username, 'secret_write', req.params.id, 'ok', 'delete');
  res.json({ ok: true, removed: before - db.secrets.length });
});

app.get('/api/audit', requirePermission('audit_read'), async (req, res) => {
  const limit = Number(req.query.limit || 200);
  const text = await fs.readFile(AUDIT_FILE, 'utf8');
  const lines = text
    .trim()
    .split('\n')
    .filter(Boolean)
    .slice(-limit)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return { raw: line };
      }
    })
    .reverse();
  await logAudit(req.auth.username, 'audit_read', 'audit.log', 'ok', `limit=${limit}`);
  res.json({ entries: lines });
});

io.on('connection', (socket) => {
  const terminals = new Map();

  function createTerminal(opts = {}) {
    const id = crypto.randomUUID();
    const shellProcess = pty.spawn(opts.shell || SHELL, [], {
      name: 'xterm-color',
      cols: opts.cols || 120,
      rows: opts.rows || 30,
      cwd: safeResolve(opts.cwd || HOME_DIR),
      env: process.env
    });

    terminals.set(id, shellProcess);
    shellProcess.onData((data) => {
      socket.emit('terminal:data', { id, data });
    });

    socket.emit('terminal:created', { id });
    return id;
  }

  createTerminal();

  socket.on('terminal:create', (opts = {}) => {
    createTerminal(opts);
  });

  socket.on('terminal:input', ({ id, input }) => {
    const t = terminals.get(id);
    if (t) t.write(input);
  });

  socket.on('terminal:resize', ({ id, cols, rows }) => {
    const t = terminals.get(id);
    if (t && Number.isFinite(cols) && Number.isFinite(rows)) {
      t.resize(cols, rows);
    }
  });

  socket.on('terminal:close', ({ id }) => {
    const t = terminals.get(id);
    if (t) {
      t.kill();
      terminals.delete(id);
      socket.emit('terminal:closed', { id });
    }
  });

  socket.on('disconnect', () => {
    for (const t of terminals.values()) {
      t.kill();
    }
    terminals.clear();
  });
});

ensureDataFiles().then(() => {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Nexus Terminal running at http://0.0.0.0:${PORT}`);
  });
});
