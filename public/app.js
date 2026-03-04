const socket = io();
const term = new Terminal({
  cursorBlink: true,
  convertEol: true,
  theme: {
    background: '#0b1220',
    foreground: '#d9e2ff'
  }
});
term.open(document.getElementById('terminal'));

term.onData((data) => socket.emit('terminal:input', data));
socket.on('terminal:data', (data) => term.write(data));

function resizeTerminal() {
  const cols = Math.max(40, Math.floor(window.innerWidth / 9));
  const rows = Math.max(10, Math.floor((window.innerHeight - 200) / 18));
  socket.emit('terminal:resize', { cols, rows });
}

window.addEventListener('resize', resizeTerminal);
resizeTerminal();

const state = {
  cwd: '~',
  currentPath: '',
  openedFile: ''
};

const cwdLabel = document.getElementById('cwdLabel');
const fileTree = document.getElementById('fileTree');
const explorerPath = document.getElementById('explorerPath');
const explorerList = document.getElementById('explorerList');
const editorPath = document.getElementById('editorPath');
const editorArea = document.getElementById('editorArea');

for (const tab of document.querySelectorAll('.tab')) {
  tab.addEventListener('click', () => {
    for (const t of document.querySelectorAll('.tab')) t.classList.remove('active');
    for (const panel of document.querySelectorAll('.panel')) panel.classList.remove('active');
    tab.classList.add('active');
    document.getElementById(`panel-${tab.dataset.tab}`).classList.add('active');
  });
}

async function loadDirectory(targetPath = '') {
  const res = await fetch(`/api/files?path=${encodeURIComponent(targetPath)}`);
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

async function openFile(filePath) {
  const res = await fetch(`/api/file?path=${encodeURIComponent(filePath)}`);
  const data = await res.json();
  if (data.error) {
    editorPath.textContent = `Error: ${data.error}`;
    return;
  }
  state.openedFile = data.path;
  editorPath.textContent = data.path;
  editorArea.value = data.content;
}

document.getElementById('saveBtn').addEventListener('click', async () => {
  if (!state.openedFile) return;
  const res = await fetch('/api/file', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: state.openedFile, content: editorArea.value })
  });

  const data = await res.json();
  alert(data.error ? `Save failed: ${data.error}` : 'Saved.');
});

document.getElementById('askAiBtn').addEventListener('click', async () => {
  const prompt = document.getElementById('aiPrompt').value.trim();
  if (!prompt) return;

  document.getElementById('aiOutput').textContent = 'Thinking...';
  const res = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, cwd: state.cwd })
  });

  const data = await res.json();
  document.getElementById('aiOutput').textContent = data.reply || data.error;
});

loadDirectory('');
