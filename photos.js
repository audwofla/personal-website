async function renderPhotos() {
  const grid = document.getElementById('photo-grid');
  if (!grid) return;

  try {
    const res = await fetch('photos.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('fetch failed');
    const photos = await res.json();

    grid.innerHTML = '';

    if (!photos.length) {
      const empty = document.createElement('div');
      empty.className = 'photo-grid-empty';
      empty.innerHTML = '<span class="mono">// no photos yet</span>';
      grid.appendChild(empty);
      return;
    }

    for (const p of photos) {
      const item = document.createElement('div');
      item.className = 'photo-item';

      const img = document.createElement('img');
      img.src = p.src;
      img.alt = p.label || '';
      img.loading = 'lazy';

      const label = document.createElement('span');
      label.className = 'mono photo-label';
      label.textContent = p.label || '';

      item.append(img, label);
      item.addEventListener('click', () => openLightbox(p.src, p.label));
      grid.appendChild(item);
    }
  } catch (err) {
    grid.innerHTML = '<div class="photo-grid-empty"><span class="mono">// couldn\'t load photos</span></div>';
  }
}

function openLightbox(src, label) {
  const overlay = document.createElement('div');
  overlay.className = 'lightbox';

  const img = document.createElement('img');
  img.src = src;
  img.alt = label || '';

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'lightbox-close mono';
  closeBtn.textContent = '✕';
  closeBtn.setAttribute('aria-label', 'Close');

  overlay.append(img, closeBtn);
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';

  function close() {
    overlay.remove();
    document.body.style.overflow = '';
    document.removeEventListener('keydown', onKey);
  }

  function onKey(e) {
    if (e.key === 'Escape') close();
  }

  overlay.addEventListener('click', close);
  document.addEventListener('keydown', onKey);

  requestAnimationFrame(() => overlay.classList.add('open'));
}

renderPhotos();
