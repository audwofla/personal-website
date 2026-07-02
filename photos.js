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
      attachHoverPreview(item, p.src, p.label);
      grid.appendChild(item);
    }
  } catch (err) {
    grid.innerHTML = '<div class="photo-grid-empty"><span class="mono">// couldn\'t load photos</span></div>';
  }
}

function attachHoverPreview(item, src, label) {
  let preview = null;
  let hideTimeout = null;

  item.addEventListener('mouseenter', () => {
    clearTimeout(hideTimeout);
    if (!preview) {
      preview = document.createElement('div');
      preview.className = 'photo-preview';
      const img = document.createElement('img');
      img.src = src;
      img.alt = label || '';
      preview.appendChild(img);
      document.body.appendChild(preview);
    }
    positionPreview(preview, item);
    requestAnimationFrame(() => preview.classList.add('open'));
  });

  item.addEventListener('mouseleave', () => {
    if (!preview) return;
    preview.classList.remove('open');
    hideTimeout = setTimeout(() => {
      preview.remove();
      preview = null;
    }, 150);
  });
}

function positionPreview(preview, item) {
  const rect = item.getBoundingClientRect();
  const maxW = Math.min(420, window.innerWidth * 0.7);
  const maxH = Math.min(420, window.innerHeight * 0.7);
  const margin = 16;

  preview.style.maxWidth = `${maxW}px`;
  preview.style.maxHeight = `${maxH}px`;

  const cx = clamp(rect.left + rect.width / 2, maxW / 2 + margin, window.innerWidth - maxW / 2 - margin);
  const cy = clamp(rect.top + rect.height / 2, maxH / 2 + margin, window.innerHeight - maxH / 2 - margin);

  preview.style.left = `${cx}px`;
  preview.style.top = `${cy}px`;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

renderPhotos();
