const PROJECTS_PATH = 'projects.json';
const LS_PW_HASH = 'dash_pw_hash';
const LS_REPO = 'dash_cfg_repo';
const LS_BRANCH = 'dash_cfg_branch';
const LS_TOKEN = 'dash_cfg_token';

let projects = [];
let currentSha = null;

/* ---------- crypto helpers ---------- */

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary);
}

function base64ToUtf8(b64) {
  const binary = atob(b64.replace(/\n/g, ''));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/* ---------- gate ---------- */

const gate = document.getElementById('gate');
const gateForm = document.getElementById('gate-form');
const gateLabel = document.getElementById('gate-label');
const gatePassword = document.getElementById('gate-password');
const gatePasswordConfirm = document.getElementById('gate-password-confirm');
const gateError = document.getElementById('gate-error');
const gateReset = document.getElementById('gate-reset');
const dashboardEl = document.getElementById('dashboard');

function isSetupMode() {
  return !localStorage.getItem(LS_PW_HASH);
}

function renderGateMode() {
  gateError.textContent = '';
  if (isSetupMode()) {
    gateLabel.textContent = '// create a password for this dashboard';
    gatePasswordConfirm.style.display = '';
    gatePassword.placeholder = 'new password';
  } else {
    gateLabel.textContent = '// enter password';
    gatePasswordConfirm.style.display = 'none';
    gatePassword.placeholder = 'password';
  }
}

gateForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const pw = gatePassword.value;

  if (isSetupMode()) {
    const confirm = gatePasswordConfirm.value;
    if (pw.length < 4) {
      gateError.textContent = 'password must be at least 4 characters';
      return;
    }
    if (pw !== confirm) {
      gateError.textContent = 'passwords do not match';
      return;
    }
    localStorage.setItem(LS_PW_HASH, await sha256Hex(pw));
    unlock();
  } else {
    const hash = await sha256Hex(pw);
    if (hash === localStorage.getItem(LS_PW_HASH)) {
      unlock();
    } else {
      gateError.textContent = 'incorrect password';
      gatePassword.value = '';
    }
  }
});

gateReset.addEventListener('click', () => {
  if (confirm('Reset the dashboard password? You will be asked to create a new one.')) {
    localStorage.removeItem(LS_PW_HASH);
    gatePassword.value = '';
    gatePasswordConfirm.value = '';
    renderGateMode();
  }
});

function unlock() {
  gate.style.display = 'none';
  dashboardEl.style.display = '';
  loadCfgFromStorage();
}

function lock() {
  dashboardEl.style.display = 'none';
  gate.style.display = '';
  gatePassword.value = '';
  renderGateMode();
  gatePassword.focus();
}

document.getElementById('lock-btn').addEventListener('click', lock);

renderGateMode();

/* ---------- github config ---------- */

const cfgRepo = document.getElementById('cfg-repo');
const cfgBranch = document.getElementById('cfg-branch');
const cfgToken = document.getElementById('cfg-token');
const cfgRemember = document.getElementById('cfg-remember');
const status = document.getElementById('status');
const saveStatus = document.getElementById('save-status');
const saveBtn = document.getElementById('save-btn');

function loadCfgFromStorage() {
  cfgRepo.value = localStorage.getItem(LS_REPO) || 'audwofla/personal-website';
  cfgBranch.value = localStorage.getItem(LS_BRANCH) || 'main';
  const savedToken = localStorage.getItem(LS_TOKEN);
  if (savedToken) {
    cfgToken.value = savedToken;
    cfgRemember.checked = true;
  }
}

function setStatus(el, msg, kind) {
  el.textContent = msg;
  el.classList.remove('err', 'ok');
  if (kind) el.classList.add(kind);
}

function ghHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
  };
}

document.getElementById('load-btn').addEventListener('click', async () => {
  const repo = cfgRepo.value.trim();
  const branch = cfgBranch.value.trim() || 'main';
  const token = cfgToken.value.trim();

  if (!repo.includes('/')) {
    setStatus(status, 'repo must be in "owner/repo" format', 'err');
    return;
  }
  if (!token) {
    setStatus(status, 'a github token is required', 'err');
    return;
  }

  if (cfgRemember.checked) {
    localStorage.setItem(LS_REPO, repo);
    localStorage.setItem(LS_BRANCH, branch);
    localStorage.setItem(LS_TOKEN, token);
  } else {
    localStorage.removeItem(LS_REPO);
    localStorage.removeItem(LS_BRANCH);
    localStorage.removeItem(LS_TOKEN);
  }

  setStatus(status, 'loading…');
  saveBtn.disabled = true;

  try {
    const res = await fetch(
      `https://api.github.com/repos/${repo}/contents/${PROJECTS_PATH}?ref=${encodeURIComponent(branch)}`,
      { headers: ghHeaders(token) }
    );

    if (res.status === 401 || res.status === 403) {
      setStatus(status, 'token invalid or lacks access to this repo', 'err');
      return;
    }
    if (res.status === 404) {
      setStatus(status, 'repo or projects.json not found on that branch', 'err');
      return;
    }
    if (!res.ok) {
      setStatus(status, `github error: ${res.status}`, 'err');
      return;
    }

    const data = await res.json();
    currentSha = data.sha;
    projects = JSON.parse(base64ToUtf8(data.content));
    renderEditor();
    saveBtn.disabled = false;
    setStatus(status, `loaded ${projects.length} project(s) from ${repo}@${branch}`, 'ok');
  } catch (err) {
    setStatus(status, `failed to load: ${err.message}`, 'err');
  }
});

document.getElementById('save-btn').addEventListener('click', async () => {
  const repo = cfgRepo.value.trim();
  const branch = cfgBranch.value.trim() || 'main';
  const token = cfgToken.value.trim();

  if (currentSha === null) {
    setStatus(saveStatus, 'load projects before saving', 'err');
    return;
  }

  const clean = projects.map((p) => ({
    year: p.year || '',
    title: p.title || '',
    desc: p.desc || '',
    tag: p.tag || '',
    link: p.link || '#',
  }));

  setStatus(saveStatus, 'publishing…');
  saveBtn.disabled = true;

  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/contents/${PROJECTS_PATH}`, {
      method: 'PUT',
      headers: { ...ghHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Update projects via dashboard',
        content: utf8ToBase64(JSON.stringify(clean, null, 2) + '\n'),
        sha: currentSha,
        branch,
      }),
    });

    if (res.status === 409) {
      setStatus(saveStatus, 'conflict: projects.json changed elsewhere — reload and retry', 'err');
      saveBtn.disabled = false;
      return;
    }
    if (res.status === 401 || res.status === 403) {
      setStatus(saveStatus, 'token invalid or lacks write access', 'err');
      saveBtn.disabled = false;
      return;
    }
    if (!res.ok) {
      setStatus(saveStatus, `github error: ${res.status}`, 'err');
      saveBtn.disabled = false;
      return;
    }

    const data = await res.json();
    currentSha = data.content.sha;
    setStatus(saveStatus, 'published ✓', 'ok');
  } catch (err) {
    setStatus(saveStatus, `failed to publish: ${err.message}`, 'err');
  } finally {
    saveBtn.disabled = false;
  }
});

/* ---------- editor ---------- */

const editor = document.getElementById('project-editor');

function renderEditor() {
  editor.innerHTML = '';
  projects.forEach((p, index) => {
    editor.appendChild(buildCard(p, index));
  });
}

function buildCard(p, index) {
  const card = document.createElement('div');
  card.className = 'dash-card';
  card.dataset.index = String(index);

  card.appendChild(cardField('year', 'Year', p.year, ''));
  card.appendChild(cardField('title', 'Title', p.title, 'span-2'));
  card.appendChild(cardField('desc', 'Description', p.desc, 'span-3'));
  card.appendChild(cardField('tag', 'Tag', p.tag, ''));
  card.appendChild(cardField('link', 'Link', p.link, 'span-2'));

  const controls = document.createElement('div');
  controls.className = 'dash-card-controls';

  const upBtn = document.createElement('button');
  upBtn.type = 'button';
  upBtn.textContent = '↑ up';
  upBtn.disabled = index === 0;
  upBtn.addEventListener('click', () => {
    [projects[index - 1], projects[index]] = [projects[index], projects[index - 1]];
    renderEditor();
  });

  const downBtn = document.createElement('button');
  downBtn.type = 'button';
  downBtn.textContent = '↓ down';
  downBtn.disabled = index === projects.length - 1;
  downBtn.addEventListener('click', () => {
    [projects[index + 1], projects[index]] = [projects[index], projects[index + 1]];
    renderEditor();
  });

  const delBtn = document.createElement('button');
  delBtn.type = 'button';
  delBtn.textContent = 'delete';
  delBtn.className = 'danger';
  delBtn.addEventListener('click', () => {
    if (confirm(`Delete "${p.title || 'this project'}"?`)) {
      projects.splice(index, 1);
      renderEditor();
    }
  });

  controls.append(upBtn, downBtn, delBtn);
  card.appendChild(controls);
  return card;
}

function cardField(key, label, value, spanClass) {
  const wrap = document.createElement('div');
  wrap.className = `dash-card-field ${spanClass}`.trim();

  const labelEl = document.createElement('label');
  labelEl.textContent = label;

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'dash-input';
  input.value = value || '';
  input.addEventListener('input', (e) => {
    const idx = Number(wrap.closest('.dash-card').dataset.index);
    projects[idx][key] = e.target.value;
  });

  wrap.append(labelEl, input);
  return wrap;
}

document.getElementById('add-btn').addEventListener('click', () => {
  projects.push({ year: '', title: '', desc: '', tag: '', link: '#' });
  renderEditor();
});
