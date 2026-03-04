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

function openTab(tabName) {
  for (const tab of document.querySelectorAll('.tab')) {
    tab.classList.toggle('active', tab.dataset.tab === tabName);
  }
  for (const panel of document.querySelectorAll('.panel')) {
    panel.classList.toggle('active', panel.id === `panel-${tabName}`);
  }
}

for (const tab of document.querySelectorAll('.tab')) {
  tab.addEventListener('click', () => openTab(tab.dataset.tab));
}

for (const btn of document.querySelectorAll('[data-open-tab]')) {
  btn.addEventListener('click', () => openTab(btn.dataset.openTab));
}

document.getElementById('saveAuthBtn').addEventListener('click', () => {
  state.auth.user = authUser.value.trim();
  state.auth.token = authToken.value.trim();
  localStorage.setItem('nexus.user', state.auth.user);
  localStorage.setItem('nexus.token', state.auth.token);
  loadDirectory(state.currentPath || '');
  refreshOps();
  refreshHomeTools();
});

async function apiFetch(url, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'x-nexus-user': state.auth.user,
    'x-nexus-token': state.auth.token,
    ...(options.headers || {})
  };

  const response = await fetch(url, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `${response.status} ${response.statusText}`);
  }
  return data;
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
  term.onData((input) => socket.emit('terminal:input', { id, input }));

  state.terminals.set(id, { term, pane });
  renderTerminalTabs();
  activateTerminal(id);
}

function renderTerminalTabs() {
  terminalTabs.innerHTML = '';
  for (const [id] of state.terminals) {
    const tabShell = document.createElement('span');
    const btn = document.createElement('button');
    btn.textContent = id.slice(0, 8);
    btn.className = id === state.activeTerminalId ? 'active' : '';
    btn.onclick = () => activateTerminal(id);

    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'x';
    closeBtn.onclick = () => socket.emit('terminal:close', { id });
    tabShell.append(btn, closeBtn);
    terminalTabs.append(tabShell);
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

socket.on('terminal:created', ({ id }) => createTerminalPane(id));
socket.on('terminal:data', ({ id, data }) => state.terminals.get(id)?.term.write(data));
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
  try {
    const data = await apiFetch(`/api/files?path=${encodeURIComponent(targetPath)}`);
    state.currentPath = data.path;
    state.cwd = data.path;
    cwdLabel.textContent = data.path;
    explorerPath.textContent = `Current path: ${data.path}`;

    fileTree.innerHTML = '';
    explorerList.innerHTML = '';

    const upBtn = document.createElement('button');
    upBtn.textContent = '⬆ ..';
    upBtn.onclick = () => loadDirectory(`${data.path}/..`);
    fileTree.append(upBtn);

    for (const entry of data.entries) {
      const fullPath = `${data.path}/${entry.name}`;
      const itemBtn = document.createElement('button');
      itemBtn.textContent = `${entry.type === 'directory' ? '📁' : '📄'} ${entry.name}`;
      itemBtn.onclick = () => (entry.type === 'directory' ? loadDirectory(fullPath) : openFile(fullPath));
      fileTree.append(itemBtn);

      const li = document.createElement('li');
      const openBtn = document.createElement('button');
      openBtn.textContent = `${entry.type === 'directory' ? '📁' : '📄'} ${entry.name}`;
      openBtn.onclick = () => (entry.type === 'directory' ? loadDirectory(fullPath) : openFile(fullPath));
      li.append(openBtn);
      explorerList.append(li);
    }
  } catch (error) {
    explorerPath.textContent = `Error: ${error.message}`;
  }
}

function getLangFromPath(filePath) {
  const ext = (filePath.split('.').pop() || '').toLowerCase();
  const map = {
    js: 'javascript', ts: 'typescript', json: 'json', md: 'markdown', py: 'python',
    sh: 'shell', yml: 'yaml', yaml: 'yaml', html: 'html', css: 'css', rs: 'rust'
  };
  return map[ext] || 'plaintext';
}

async function openFile(filePath) {
  try {
    const data = await apiFetch(`/api/file?path=${encodeURIComponent(filePath)}`);
    state.openedFile = data.path;
    editorPath.textContent = data.path;
    openTab('editor');
    if (state.editor) {
      state.editor.setValue(data.content);
      monaco.editor.setModelLanguage(state.editor.getModel(), getLangFromPath(filePath));
    }
  } catch (error) {
    editorPath.textContent = `Error: ${error.message}`;
  }
}

document.getElementById('saveBtn').addEventListener('click', async () => {
  if (!state.openedFile || !state.editor) return;
  try {
    await apiFetch('/api/file', {
      method: 'POST',
      body: JSON.stringify({ path: state.openedFile, content: state.editor.getValue() })
    });
    alert('Saved.');
  } catch (error) {
    alert(`Save failed: ${error.message}`);
  }
});

document.getElementById('askAiBtn').addEventListener('click', async () => {
  const prompt = document.getElementById('aiPrompt').value.trim();
  if (!prompt) return;
  document.getElementById('aiOutput').textContent = 'Thinking...';
  try {
    const data = await apiFetch('/api/ai', { method: 'POST', body: JSON.stringify({ prompt, cwd: state.cwd }) });
    document.getElementById('aiOutput').textContent = data.reply || 'No response.';
  } catch (error) {
    document.getElementById('aiOutput').textContent = error.message;
  }
});

async function refreshAudit() {
  try {
    const data = await apiFetch('/api/audit?limit=100');
    document.getElementById('auditOutput').textContent = JSON.stringify(data.entries || [], null, 2);
  } catch (error) {
    document.getElementById('auditOutput').textContent = error.message;
  }
}

async function refreshCollection(url, listId, renderLine, deleteBase) {
  try {
    const data = await apiFetch(url);
    const list = document.getElementById(listId);
    list.innerHTML = '';
    const entries = Object.values(data)[0] || [];
    for (const item of entries) {
      const li = document.createElement('li');
      li.textContent = renderLine(item);
      const del = document.createElement('button');
      del.textContent = 'Delete';
      del.onclick = async () => {
        await apiFetch(`${deleteBase}/${item.id}`, { method: 'DELETE' });
        refreshOps();
        refreshHomeTools();
      };
      li.append(' ', del);
      list.append(li);
    }
  } catch (error) {
    document.getElementById(listId).innerHTML = `<li>Error: ${error.message}</li>`;
  }
}

async function refreshOps() {
  await Promise.all([
    refreshCollection('/api/ssh-profiles', 'sshList', (p) => `${p.name}: ${p.username}@${p.host}:${p.port}`, '/api/ssh-profiles'),
    refreshCollection('/api/secrets', 'secretList', (s) => `${s.name} (updated ${s.updatedAt})`, '/api/secrets'),
    refreshCollection('/api/launch-configs', 'launchList', (l) => `${l.name} | ${l.cwd} | ${l.command}`, '/api/launch-configs'),
    refreshAudit()
  ]);
}

async function refreshHomeTools() {
  await Promise.all([
    refreshCollection('/api/workflows', 'workflowList', (w) => `${w.name}: ${w.command}`, '/api/workflows'),
    refreshCollection('/api/notebooks', 'notebookList', (n) => `${n.title} (updated ${n.updatedAt})`, '/api/notebooks')
  ]);
}

document.getElementById('refreshAuditBtn').addEventListener('click', refreshAudit);

function bindForm(formId, endpoint, refreshFn) {
  document.getElementById(formId).addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.target);
    try {
      await apiFetch(endpoint, { method: 'POST', body: JSON.stringify(Object.fromEntries(form.entries())) });
      event.target.reset();
      refreshFn();
    } catch (error) {
      alert(error.message);
    }
  });
}

bindForm('sshForm', '/api/ssh-profiles', refreshOps);
bindForm('secretForm', '/api/secrets', refreshOps);
bindForm('launchForm', '/api/launch-configs', refreshOps);
bindForm('workflowForm', '/api/workflows', refreshHomeTools);
bindForm('notebookForm', '/api/notebooks', refreshHomeTools);

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
refreshHomeTools();
