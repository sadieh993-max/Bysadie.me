const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs/promises');
const os = require('os');
const { Server } = require('socket.io');
const pty = require('node-pty');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = Number(process.env.PORT || 3000);
const SHELL = process.env.SHELL || (process.platform === 'win32' ? 'powershell.exe' : '/bin/bash');
const ALLOW_ANY_PATH = process.env.ALLOW_ANY_PATH !== 'false';
const HOME_DIR = os.homedir();

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function safeResolve(inputPath = HOME_DIR) {
  const cleaned = (inputPath || HOME_DIR).replace(/^~(?=$|[\\/])/, HOME_DIR);
  const resolved = path.resolve(cleaned);

  if (ALLOW_ANY_PATH) {
    return resolved;
  }

  if (!resolved.startsWith(HOME_DIR)) {
    return HOME_DIR;
  }

  return resolved;
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

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, shell: SHELL, home: HOME_DIR, allowAnyPath: ALLOW_ANY_PATH });
});

app.get('/api/files', async (req, res) => {
  try {
    const data = await listDirectory(req.query.path);
    res.json(data);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/file', async (req, res) => {
  try {
    const target = safeResolve(req.query.path);
    const content = await fs.readFile(target, 'utf8');
    res.json({ path: target, content });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/file', async (req, res) => {
  try {
    const target = safeResolve(req.body.path);
    await fs.writeFile(target, req.body.content ?? '', 'utf8');
    res.json({ ok: true, path: target });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/ai', async (req, res) => {
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
    return res.json({ reply: data.response || 'No response received from model.' });
  } catch (error) {
    return res.json({
      reply:
        'AI backend not reachable. Install/start Ollama and pull a model, e.g. `ollama pull qwen2.5-coder:7b`.',
      details: error.message
    });
  }
});

io.on('connection', (socket) => {
  const shellProcess = pty.spawn(SHELL, [], {
    name: 'xterm-color',
    cols: 120,
    rows: 30,
    cwd: HOME_DIR,
    env: process.env
  });

  shellProcess.onData((data) => {
    socket.emit('terminal:data', data);
  });

  socket.on('terminal:input', (input) => {
    shellProcess.write(input);
  });

  socket.on('terminal:resize', ({ cols, rows }) => {
    shellProcess.resize(cols, rows);
  });

  socket.on('disconnect', () => {
    shellProcess.kill();
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Nexus Terminal running at http://0.0.0.0:${PORT}`);
});
