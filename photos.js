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
      grid.appendChild(item);
    }
  } catch (err) {
    grid.innerHTML = '<div class="photo-grid-empty"><span class="mono">// couldn\'t load photos</span></div>';
  }
}

renderPhotos();
