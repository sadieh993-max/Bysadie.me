const socket = io();

const state = {
  cwd: '~',
  currentPath: '',
  openedFile: '',
  terminals: new Map(),
  activeTerminalId: null,
  editor: null,
  auth: {
    user: localStorage.getItem('nexus.user') || 'admin',
    token: localStorage.getItem('nexus.token') || 'changeme'
  }
};

const cwdLabel = document.getElementById('cwdLabel');
const fileTree = document.getElementById('fileTree');
const explorerPath = document.getElementById('explorerPath');
const explorerList = document.getElementById('explorerList');
const editorPath = document.getElementById('editorPath');
const terminalArea = document.getElementById('terminalArea');
const terminalTabs = document.getElementById('terminalTabs');

const authUser = document.getElementById('authUser');
const authToken = document.getElementById('authToken');
authUser.value = state.auth.user;
authToken.value = state.auth.token;

document.getElementById('saveAuthBtn').addEventListener('click', () => {
  state.auth.user = authUser.value.trim();
  state.auth.token = authToken.value.trim();
  localStorage.setItem('nexus.user', state.auth.user);
  localStorage.setItem('nexus.token', state.auth.token);
  loadDirectory(state.currentPath || '');
  refreshOps();
});

function apiFetch(url, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'x-nexus-user': state.auth.user,
    'x-nexus-token': state.auth.token,
    ...(options.headers || {})
  };

  return fetch(url, { ...options, headers });
}

for (const tab of document.querySelectorAll('.tab')) {
  tab.addEventListener('click', () => {
    for (const t of document.querySelectorAll('.tab')) t.classList.remove('active');
    for (const panel of document.querySelectorAll('.panel')) panel.classList.remove('active');
    tab.classList.add('active');
    document.getElementById(`panel-${tab.dataset.tab}`).classList.add('active');
  });
}

function createTerminalPane(id) {
  const pane = document.createElement('div');
  pane.className = 'term-pane';
  pane.id = `term-${id}`;
  terminalArea.append(pane);

  const term = new Terminal({
    cursorBlink: true,
    convertEol: true,
    theme: { background: '#0b1220', foreground: '#d9e2ff' }
  });
  term.open(pane);
  term.onData((input) => {
    socket.emit('terminal:input', { id, input });
  });

  state.terminals.set(id, { term, pane });
  renderTerminalTabs();
  activateTerminal(id);
}

function renderTerminalTabs() {
  terminalTabs.innerHTML = '';
  for (const [id] of state.terminals) {
    const btn = document.createElement('button');
    btn.textContent = id.slice(0, 8);
    if (id === state.activeTerminalId) btn.classList.add('active');
    btn.onclick = () => activateTerminal(id);
    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'x';
    closeBtn.onclick = () => socket.emit('terminal:close', { id });
    const holder = document.createElement('span');
    holder.append(btn, closeBtn);
    terminalTabs.append(holder);
  }
}

function activateTerminal(id) {
  state.activeTerminalId = id;
  for (const [tid, data] of state.terminals) {
    data.pane.classList.toggle('active', tid === id);
  }
  renderTerminalTabs();
  resizeTerminal(id);
}

function resizeTerminal(id = state.activeTerminalId) {
  if (!id) return;
  const cols = Math.max(40, Math.floor((window.innerWidth - 360) / 9));
  const rows = Math.max(10, Math.floor((window.innerHeight - 260) / 18));
  socket.emit('terminal:resize', { id, cols, rows });
}

window.addEventListener('resize', () => resizeTerminal());

document.getElementById('newTerminalBtn').addEventListener('click', () => {
  socket.emit('terminal:create', { cwd: state.cwd });
});

socket.on('terminal:created', ({ id }) => {
  createTerminalPane(id);
});

socket.on('terminal:data', ({ id, data }) => {
  const terminal = state.terminals.get(id);
  if (terminal) terminal.term.write(data);
});

socket.on('terminal:closed', ({ id }) => {
  const terminal = state.terminals.get(id);
  if (!terminal) return;
  terminal.pane.remove();
  terminal.term.dispose();
  state.terminals.delete(id);
  const next = state.terminals.keys().next().value || null;
  if (next) activateTerminal(next);
  else state.activeTerminalId = null;
  renderTerminalTabs();
});

async function loadDirectory(targetPath = '') {
  const res = await apiFetch(`/api/files?path=${encodeURIComponent(targetPath)}`);
  const data = await res.json();

  if (data.error) {
    explorerPath.textContent = `Error: ${data.error}`;
    return;
  }

  state.currentPath = data.path;
  state.cwd = data.path;
  cwdLabel.textContent = data.path;
  explorerPath.textContent = `Current path: ${data.path}`;

  fileTree.innerHTML = '';
  explorerList.innerHTML = '';

  if (data.path !== '/' && data.path !== 'C:\\') {
    const upBtn = document.createElement('button');
    upBtn.textContent = '⬆ ..';
    upBtn.onclick = () => loadDirectory(`${data.path}/..`);
    fileTree.append(upBtn);
  }

  for (const entry of data.entries) {
    const fullPath = `${data.path}/${entry.name}`;
    const itemBtn = document.createElement('button');
    itemBtn.textContent = `${entry.type === 'directory' ? '📁' : '📄'} ${entry.name}`;
    itemBtn.onclick = () => (entry.type === 'directory' ? loadDirectory(fullPath) : openFile(fullPath));
    fileTree.append(itemBtn);

    const li = document.createElement('li');
    li.textContent = `${entry.type === 'directory' ? '📁' : '📄'} ${entry.name}`;
    explorerList.append(li);
  }
}

function getLangFromPath(filePath) {
  const ext = (filePath.split('.').pop() || '').toLowerCase();
  const map = {
    js: 'javascript',
    ts: 'typescript',
    json: 'json',
    md: 'markdown',
    py: 'python',
    sh: 'shell',
    yml: 'yaml',
    yaml: 'yaml',
    html: 'html',
    css: 'css'
  };
  return map[ext] || 'plaintext';
}

async function openFile(filePath) {
  const res = await apiFetch(`/api/file?path=${encodeURIComponent(filePath)}`);
  const data = await res.json();
  if (data.error) {
    editorPath.textContent = `Error: ${data.error}`;
    return;
  }
  state.openedFile = data.path;
  editorPath.textContent = data.path;

  if (state.editor) {
    state.editor.setValue(data.content);
    monaco.editor.setModelLanguage(state.editor.getModel(), getLangFromPath(filePath));
  }
}

document.getElementById('saveBtn').addEventListener('click', async () => {
  if (!state.openedFile || !state.editor) return;
  const res = await apiFetch('/api/file', {
    method: 'POST',
    body: JSON.stringify({ path: state.openedFile, content: state.editor.getValue() })
  });

  const data = await res.json();
  alert(data.error ? `Save failed: ${data.error}` : 'Saved.');
});

document.getElementById('askAiBtn').addEventListener('click', async () => {
  const prompt = document.getElementById('aiPrompt').value.trim();
  if (!prompt) return;

  document.getElementById('aiOutput').textContent = 'Thinking...';
  const res = await apiFetch('/api/ai', {
    method: 'POST',
    body: JSON.stringify({ prompt, cwd: state.cwd })
  });

  const data = await res.json();
  document.getElementById('aiOutput').textContent = data.reply || data.error;
});

async function refreshAudit() {
  const res = await apiFetch('/api/audit?limit=100');
  const data = await res.json();
  document.getElementById('auditOutput').textContent = JSON.stringify(data.entries || data, null, 2);
}

async function refreshSsh() {
  const res = await apiFetch('/api/ssh-profiles');
  const data = await res.json();
  const list = document.getElementById('sshList');
  list.innerHTML = '';
  for (const profile of data.profiles || []) {
    const li = document.createElement('li');
    li.textContent = `${profile.name}: ${profile.username}@${profile.host}:${profile.port}`;
    const del = document.createElement('button');
    del.textContent = 'Delete';
    del.onclick = async () => {
      await apiFetch(`/api/ssh-profiles/${profile.id}`, { method: 'DELETE' });
      refreshSsh();
    };
    li.append(' ', del);
    list.append(li);
  }
}

async function refreshSecrets() {
  const res = await apiFetch('/api/secrets');
  const data = await res.json();
  const list = document.getElementById('secretList');
  list.innerHTML = '';
  for (const secret of data.secrets || []) {
    const li = document.createElement('li');
    li.textContent = `${secret.name} (updated ${secret.updatedAt})`;
    const del = document.createElement('button');
    del.textContent = 'Delete';
    del.onclick = async () => {
      await apiFetch(`/api/secrets/${secret.id}`, { method: 'DELETE' });
      refreshSecrets();
    };
    li.append(' ', del);
    list.append(li);
  }
}

async function refreshOps() {
  await Promise.all([refreshSsh(), refreshSecrets(), refreshAudit()]);
}

document.getElementById('refreshAuditBtn').addEventListener('click', refreshAudit);

document.getElementById('sshForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.target);
  await apiFetch('/api/ssh-profiles', {
    method: 'POST',
    body: JSON.stringify(Object.fromEntries(form.entries()))
  });
  event.target.reset();
  refreshSsh();
});

document.getElementById('secretForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.target);
  await apiFetch('/api/secrets', {
    method: 'POST',
    body: JSON.stringify(Object.fromEntries(form.entries()))
  });
  event.target.reset();
  refreshSecrets();
});

window.require.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs' } });
window.require(['vs/editor/editor.main'], () => {
  state.editor = monaco.editor.create(document.getElementById('editorArea'), {
    value: '// Open file from explorer to edit',
    language: 'javascript',
    theme: 'vs-dark',
    automaticLayout: true,
    minimap: { enabled: true }
  });
});

loadDirectory('');
refreshOps();
