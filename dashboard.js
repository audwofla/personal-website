const PROJECTS_PATH = 'projects.json';
const ABOUT_PATH = 'about.json';
const PHOTOS_PATH = 'photos.json';
const LS_PW_HASH = 'dash_pw_hash';
const LS_REPO = 'dash_cfg_repo';
const LS_BRANCH = 'dash_cfg_branch';
const LS_TOKEN = 'dash_cfg_token';

let projects = [];
let projectsSha = null;
const projectsDrag = { index: null };

let aboutData = { heroRole: '', heroBio: '', bio: '', email: '', links: [] };
let aboutSha = null;
const linksDrag = { index: null };

let photoEntries = [];
let photosLoaded = false;
const photosDrag = { index: null };

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

async function ghJson(url, opts, token) {
  const res = await fetch(url, { ...opts, headers: { ...ghHeaders(token), ...(opts && opts.headers) } });
  if (res.status === 401 || res.status === 403) throw new Error('token invalid or lacks write access');
  if (res.status === 404) throw new Error('not found');
  if (res.status === 409 || res.status === 422) throw new Error('conflict: repo changed elsewhere — reload and retry');
  if (!res.ok) throw new Error(`github error: ${res.status}`);
  return res.status === 204 ? null : res.json();
}

function readCfg() {
  const repo = cfgRepo.value.trim();
  const branch = cfgBranch.value.trim() || 'main';
  const token = cfgToken.value.trim();

  if (cfgRemember.checked) {
    localStorage.setItem(LS_REPO, repo);
    localStorage.setItem(LS_BRANCH, branch);
    localStorage.setItem(LS_TOKEN, token);
  } else {
    localStorage.removeItem(LS_REPO);
    localStorage.removeItem(LS_BRANCH);
    localStorage.removeItem(LS_TOKEN);
  }

  return { repo, branch, token };
}

async function loadFile(path, statusEl) {
  const { repo, branch, token } = readCfg();

  if (!repo.includes('/')) {
    setStatus(statusEl, 'repo must be in "owner/repo" format', 'err');
    return null;
  }
  if (!token) {
    setStatus(statusEl, 'a github token is required', 'err');
    return null;
  }

  setStatus(statusEl, 'loading…');

  try {
    const res = await fetch(
      `https://api.github.com/repos/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`,
      { headers: ghHeaders(token) }
    );

    if (res.status === 401 || res.status === 403) {
      setStatus(statusEl, 'token invalid or lacks access to this repo', 'err');
      return null;
    }
    if (res.status === 404) {
      setStatus(statusEl, `repo or ${path} not found on that branch`, 'err');
      return null;
    }
    if (!res.ok) {
      setStatus(statusEl, `github error: ${res.status}`, 'err');
      return null;
    }

    const data = await res.json();
    return { sha: data.sha, parsed: JSON.parse(base64ToUtf8(data.content)), repo, branch };
  } catch (err) {
    setStatus(statusEl, `failed to load: ${err.message}`, 'err');
    return null;
  }
}

async function saveFile(path, sha, value, message, statusEl) {
  const { repo, branch, token } = readCfg();

  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
      method: 'PUT',
      headers: { ...ghHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        content: utf8ToBase64(JSON.stringify(value, null, 2) + '\n'),
        sha,
        branch,
      }),
    });

    if (res.status === 409) {
      setStatus(statusEl, 'conflict: file changed elsewhere — reload and retry', 'err');
      return null;
    }
    if (res.status === 401 || res.status === 403) {
      setStatus(statusEl, 'token invalid or lacks write access', 'err');
      return null;
    }
    if (!res.ok) {
      setStatus(statusEl, `github error: ${res.status}`, 'err');
      return null;
    }

    const data = await res.json();
    setStatus(statusEl, 'published ✓', 'ok');
    return data.content.sha;
  } catch (err) {
    setStatus(statusEl, `failed to publish: ${err.message}`, 'err');
    return null;
  }
}

/* ---------- drag-and-drop reorder (shared by projects + links) ---------- */

function attachCardDnD(card, handle, index, list, rerender, dragRef) {
  handle.addEventListener('dragstart', (e) => {
    dragRef.index = index;
    card.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  });

  handle.addEventListener('dragend', () => {
    card.classList.remove('dragging');
    document.querySelectorAll('.dash-card').forEach((c) => {
      c.classList.remove('drag-over-top', 'drag-over-bottom');
    });
  });

  card.addEventListener('dragover', (e) => {
    if (dragRef.index === null || dragRef.index === index) return;
    e.preventDefault();
    const before = e.clientY - card.getBoundingClientRect().top < card.offsetHeight / 2;
    card.classList.toggle('drag-over-top', before);
    card.classList.toggle('drag-over-bottom', !before);
  });

  card.addEventListener('dragleave', () => {
    card.classList.remove('drag-over-top', 'drag-over-bottom');
  });

  card.addEventListener('drop', (e) => {
    e.preventDefault();
    card.classList.remove('drag-over-top', 'drag-over-bottom');
    const from = dragRef.index;
    if (from === null || from === index) return;

    const before = e.clientY - card.getBoundingClientRect().top < card.offsetHeight / 2;
    let target = before ? index : index + 1;
    const [moved] = list.splice(from, 1);
    if (from < target) target -= 1;
    list.splice(target, 0, moved);

    dragRef.index = null;
    rerender();
  });
}

function cardField(list, key, label, value, spanClass) {
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
    list[idx][key] = e.target.value;
  });

  wrap.append(labelEl, input);
  return wrap;
}

/* ---------- projects editor ---------- */

const projectsStatus = document.getElementById('status');
const saveStatus = document.getElementById('save-status');
const saveBtn = document.getElementById('save-btn');
const editor = document.getElementById('project-editor');

document.getElementById('load-projects-btn').addEventListener('click', async () => {
  saveBtn.disabled = true;
  const result = await loadFile(PROJECTS_PATH, projectsStatus);
  if (!result) return;
  projectsSha = result.sha;
  projects = result.parsed;
  renderEditor();
  saveBtn.disabled = false;
  setStatus(projectsStatus, `loaded ${projects.length} project(s) from ${result.repo}@${result.branch}`, 'ok');
});

document.getElementById('save-btn').addEventListener('click', async () => {
  if (projectsSha === null) {
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

  saveBtn.disabled = true;
  const newSha = await saveFile(PROJECTS_PATH, projectsSha, clean, 'Update projects via dashboard', saveStatus);
  if (newSha) projectsSha = newSha;
  saveBtn.disabled = false;
});

function renderEditor() {
  editor.innerHTML = '';
  projects.forEach((p, index) => {
    editor.appendChild(buildProjectCard(p, index));
  });
}

function buildProjectCard(p, index) {
  const card = document.createElement('div');
  card.className = 'dash-card';
  card.dataset.index = String(index);

  const header = document.createElement('div');
  header.className = 'dash-card-header';

  const handle = document.createElement('span');
  handle.className = 'dash-drag-handle mono';
  handle.setAttribute('draggable', 'true');
  handle.title = 'drag to reorder';
  handle.textContent = '⋮⋮';

  const delBtn = document.createElement('button');
  delBtn.type = 'button';
  delBtn.textContent = 'delete';
  delBtn.className = 'dash-delete-btn';
  delBtn.addEventListener('click', () => {
    if (confirm(`Delete "${p.title || 'this project'}"?`)) {
      projects.splice(index, 1);
      renderEditor();
    }
  });

  header.append(handle, delBtn);

  const fields = document.createElement('div');
  fields.className = 'dash-card-fields';
  fields.appendChild(cardField(projects, 'year', 'Year', p.year, ''));
  fields.appendChild(cardField(projects, 'title', 'Title', p.title, 'span-2'));
  fields.appendChild(cardField(projects, 'desc', 'Description', p.desc, 'span-3'));
  fields.appendChild(cardField(projects, 'tag', 'Tag', p.tag, ''));
  fields.appendChild(cardField(projects, 'link', 'Link', p.link, 'span-2'));

  card.append(header, fields);
  attachCardDnD(card, handle, index, projects, renderEditor, projectsDrag);
  return card;
}

document.getElementById('add-btn').addEventListener('click', () => {
  projects.push({ year: '', title: '', desc: '', tag: '', link: '' });
  renderEditor();
});

/* ---------- about editor ---------- */

const aboutStatus = document.getElementById('about-status');
const saveAboutBtn = document.getElementById('save-about-btn');
const heroRoleInput = document.getElementById('hero-role-input');
const heroBioInput = document.getElementById('hero-bio-input');
const aboutBioInput = document.getElementById('about-bio');
const aboutEmailInput = document.getElementById('about-email');
const linkEditor = document.getElementById('link-editor');

heroRoleInput.addEventListener('input', (e) => { aboutData.heroRole = e.target.value; });
heroBioInput.addEventListener('input', (e) => { aboutData.heroBio = e.target.value; });
aboutBioInput.addEventListener('input', (e) => { aboutData.bio = e.target.value; });
aboutEmailInput.addEventListener('input', (e) => { aboutData.email = e.target.value; });

document.getElementById('load-about-btn').addEventListener('click', async () => {
  saveAboutBtn.disabled = true;
  const result = await loadFile(ABOUT_PATH, aboutStatus);
  if (!result) return;
  aboutSha = result.sha;
  aboutData = {
    heroRole: result.parsed.heroRole || '',
    heroBio: result.parsed.heroBio || '',
    bio: result.parsed.bio || '',
    email: result.parsed.email || '',
    links: result.parsed.links || [],
  };
  heroRoleInput.value = aboutData.heroRole;
  heroBioInput.value = aboutData.heroBio;
  aboutBioInput.value = aboutData.bio;
  aboutEmailInput.value = aboutData.email;
  renderLinkEditor();
  saveAboutBtn.disabled = false;
  setStatus(aboutStatus, `loaded about section from ${result.repo}@${result.branch}`, 'ok');
});

document.getElementById('save-about-btn').addEventListener('click', async () => {
  if (aboutSha === null) {
    setStatus(aboutStatus, 'load the about section before saving', 'err');
    return;
  }
  const clean = {
    heroRole: heroRoleInput.value || '',
    heroBio: heroBioInput.value || '',
    bio: aboutBioInput.value || '',
    email: aboutEmailInput.value || '',
    links: aboutData.links.map((l) => ({ label: l.label || '', url: l.url || '#' })),
  };

  saveAboutBtn.disabled = true;
  const newSha = await saveFile(ABOUT_PATH, aboutSha, clean, 'Update about section via dashboard', aboutStatus);
  if (newSha) aboutSha = newSha;
  saveAboutBtn.disabled = false;
});

function renderLinkEditor() {
  linkEditor.innerHTML = '';
  aboutData.links.forEach((l, index) => {
    linkEditor.appendChild(buildLinkCard(l, index));
  });
}

function buildLinkCard(l, index) {
  const card = document.createElement('div');
  card.className = 'dash-card';
  card.dataset.index = String(index);

  const header = document.createElement('div');
  header.className = 'dash-card-header';

  const handle = document.createElement('span');
  handle.className = 'dash-drag-handle mono';
  handle.setAttribute('draggable', 'true');
  handle.title = 'drag to reorder';
  handle.textContent = '⋮⋮';

  const delBtn = document.createElement('button');
  delBtn.type = 'button';
  delBtn.textContent = 'delete';
  delBtn.className = 'dash-delete-btn';
  delBtn.addEventListener('click', () => {
    if (confirm(`Delete "${l.label || 'this link'}"?`)) {
      aboutData.links.splice(index, 1);
      renderLinkEditor();
    }
  });

  header.append(handle, delBtn);

  const fields = document.createElement('div');
  fields.className = 'dash-card-fields';
  fields.appendChild(cardField(aboutData.links, 'label', 'Label', l.label, ''));
  fields.appendChild(cardField(aboutData.links, 'url', 'URL', l.url, 'span-2'));

  card.append(header, fields);
  attachCardDnD(card, handle, index, aboutData.links, renderLinkEditor, linksDrag);
  return card;
}

document.getElementById('add-link-btn').addEventListener('click', () => {
  aboutData.links.push({ label: '', url: '' });
  renderLinkEditor();
});

/* ---------- photos editor ---------- */

const photosStatus = document.getElementById('photos-status');
const savePhotosBtn = document.getElementById('save-photos-btn');
const photoEditor = document.getElementById('photo-editor');
const photoFileInput = document.getElementById('photo-file-input');

function sanitizeFilename(name) {
  const base = name.replace(/\.[^.]+$/, '');
  const slug = base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-+|-+$)/g, '');
  return `${slug || 'photo'}.jpg`;
}

function defaultLabelFromFilename(name) {
  return name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim();
}

function compressImage(file, maxDim = 2000, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const scale = maxDim / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);

      canvas.toBlob((blob) => {
        if (!blob) { reject(new Error('image encode failed')); return; }
        const reader = new FileReader();
        reader.onload = () => resolve({ dataUrl: reader.result, base64: reader.result.split(',')[1] });
        reader.onerror = () => reject(new Error('failed to read compressed image'));
        reader.readAsDataURL(blob);
      }, 'image/jpeg', quality);
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error(`couldn't decode ${file.name}`));
    };

    img.src = objectUrl;
  });
}

document.getElementById('add-photos-btn').addEventListener('click', () => photoFileInput.click());

photoFileInput.addEventListener('change', async (e) => {
  const files = Array.from(e.target.files || []);
  e.target.value = '';

  for (const file of files) {
    try {
      const { base64, dataUrl } = await compressImage(file);
      const path = `photos/${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${sanitizeFilename(file.name)}`;
      photoEntries.push({
        src: path,
        label: defaultLabelFromFilename(file.name),
        _status: 'pending',
        _base64: base64,
        _previewUrl: dataUrl,
      });
      renderPhotoEditor();
    } catch (err) {
      setStatus(photosStatus, `skipped ${file.name}: ${err.message}`, 'err');
    }
  }

  savePhotosBtn.disabled = !photosLoaded;
});

document.getElementById('load-photos-btn').addEventListener('click', async () => {
  savePhotosBtn.disabled = true;
  const result = await loadFile(PHOTOS_PATH, photosStatus);
  if (!result) return;
  photoEntries = (result.parsed || []).map((p) => ({ src: p.src, label: p.label || '', _status: 'existing' }));
  photosLoaded = true;
  renderPhotoEditor();
  savePhotosBtn.disabled = false;
  setStatus(photosStatus, `loaded ${photoEntries.length} photo(s) from ${result.repo}@${result.branch}`, 'ok');
});

document.getElementById('save-photos-btn').addEventListener('click', async () => {
  if (!photosLoaded) {
    setStatus(photosStatus, 'load photos before saving', 'err');
    return;
  }

  const { repo, branch, token } = readCfg();
  savePhotosBtn.disabled = true;
  setStatus(photosStatus, 'publishing…');

  try {
    const refData = await ghJson(
      `https://api.github.com/repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`, {}, token
    );
    const latestCommitSha = refData.object.sha;

    const commitData = await ghJson(
      `https://api.github.com/repos/${repo}/git/commits/${latestCommitSha}`, {}, token
    );
    const baseTreeSha = commitData.tree.sha;

    const pending = photoEntries.filter((p) => p._status === 'pending');
    const blobs = await Promise.all(pending.map((p) => ghJson(
      `https://api.github.com/repos/${repo}/git/blobs`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: p._base64, encoding: 'base64' }),
      },
      token
    )));
    pending.forEach((p, i) => { p._blobSha = blobs[i].sha; });

    const manifest = photoEntries.map((p) => ({ src: p.src, label: p.label || '' }));
    const treeEntries = pending.map((p) => ({ path: p.src, mode: '100644', type: 'blob', sha: p._blobSha }));
    treeEntries.push({
      path: PHOTOS_PATH,
      mode: '100644',
      type: 'blob',
      content: JSON.stringify(manifest, null, 2) + '\n',
    });

    const newTree = await ghJson(
      `https://api.github.com/repos/${repo}/git/trees`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base_tree: baseTreeSha, tree: treeEntries }),
      },
      token
    );

    const newCommit = await ghJson(
      `https://api.github.com/repos/${repo}/git/commits`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Update photos via dashboard', tree: newTree.sha, parents: [latestCommitSha] }),
      },
      token
    );

    await ghJson(
      `https://api.github.com/repos/${repo}/git/refs/heads/${encodeURIComponent(branch)}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sha: newCommit.sha }),
      },
      token
    );

    photoEntries.forEach((p) => {
      if (p._status === 'pending') {
        p._status = 'existing';
        delete p._base64;
        delete p._blobSha;
      }
    });
    renderPhotoEditor();
    setStatus(photosStatus, `published ✓ (${pending.length} new photo(s))`, 'ok');
  } catch (err) {
    setStatus(photosStatus, err.message, 'err');
  } finally {
    savePhotosBtn.disabled = false;
  }
});

function renderPhotoEditor() {
  photoEditor.innerHTML = '';
  photoEntries.forEach((p, index) => {
    photoEditor.appendChild(buildPhotoCard(p, index));
  });
}

function buildPhotoCard(p, index) {
  const card = document.createElement('div');
  card.className = 'dash-card';
  card.dataset.index = String(index);

  const header = document.createElement('div');
  header.className = 'dash-card-header';

  const handle = document.createElement('span');
  handle.className = 'dash-drag-handle mono';
  handle.setAttribute('draggable', 'true');
  handle.title = 'drag to reorder';
  handle.textContent = '⋮⋮';

  const right = document.createElement('div');
  right.className = 'dash-card-header-right';

  if (p._status === 'pending') {
    const badge = document.createElement('span');
    badge.className = 'mono dash-badge';
    badge.textContent = 'new — not published';
    right.appendChild(badge);
  }

  const delBtn = document.createElement('button');
  delBtn.type = 'button';
  delBtn.textContent = 'delete';
  delBtn.className = 'dash-delete-btn';
  delBtn.addEventListener('click', () => {
    if (confirm(`Delete "${p.label || 'this photo'}"?`)) {
      photoEntries.splice(index, 1);
      renderPhotoEditor();
    }
  });
  right.appendChild(delBtn);

  header.append(handle, right);

  const body = document.createElement('div');
  body.className = 'dash-photo-body';

  const thumb = document.createElement('img');
  thumb.className = 'dash-photo-thumb';
  thumb.src = p._previewUrl || p.src;
  thumb.alt = '';

  const fields = document.createElement('div');
  fields.className = 'dash-card-fields dash-photo-fields';
  fields.appendChild(cardField(photoEntries, 'label', 'Label', p.label, ''));

  body.append(thumb, fields);
  card.append(header, body);
  attachCardDnD(card, handle, index, photoEntries, renderPhotoEditor, photosDrag);
  return card;
}
