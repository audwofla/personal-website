const INITIAL_PROJECT_COUNT = 5;

async function renderProjects() {
  const list = document.getElementById('project-list');
  if (!list) return;

  try {
    const res = await fetch('projects.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('fetch failed');
    const projects = await res.json();

    list.innerHTML = '';

    const visible = projects.slice(0, INITIAL_PROJECT_COUNT);
    const rest = projects.slice(INITIAL_PROJECT_COUNT);

    for (const p of visible) {
      list.appendChild(buildProjectRow(p));
    }

    if (rest.length) {
      const moreBtn = document.createElement('button');
      moreBtn.type = 'button';
      moreBtn.className = 'mono show-more-btn';
      moreBtn.textContent = `+ show ${rest.length} more`;
      moreBtn.addEventListener('click', () => {
        for (const p of rest) list.appendChild(buildProjectRow(p));
        moreBtn.remove();
      });
      list.appendChild(moreBtn);
    }
  } catch (err) {
    list.innerHTML = '<span class="mono" style="color: var(--dim); font-size: 13px;">// couldn\'t load projects</span>';
  }
}

function buildProjectRow(p) {
  const row = document.createElement('a');
  row.href = p.link || '#';
  row.className = 'project-row';

  const year = document.createElement('span');
  year.className = 'mono project-year';
  year.textContent = p.year || '';

  const info = document.createElement('div');
  info.className = 'project-info';

  const title = document.createElement('div');
  title.className = 'project-title';
  title.textContent = p.title || '';

  const desc = document.createElement('div');
  desc.className = 'project-desc';
  desc.textContent = p.desc || '';

  info.append(title, desc);

  const tag = document.createElement('span');
  tag.className = 'mono project-tag';
  tag.textContent = p.tag || '';

  row.append(year, info, tag);
  return row;
}

renderProjects();
