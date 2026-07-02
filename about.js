async function renderAbout() {
  const bioEl = document.getElementById('about-bio');
  const emailEl = document.getElementById('about-email');
  const linksWrap = document.getElementById('about-links');
  if (!bioEl || !emailEl || !linksWrap) return;

  try {
    const res = await fetch('about.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('fetch failed');
    const data = await res.json();

    if (data.bio) bioEl.textContent = data.bio;

    if (data.email) {
      emailEl.textContent = data.email;
      emailEl.href = `mailto:${data.email}`;
    }

    linksWrap.querySelectorAll('a').forEach((a) => {
      if (a !== emailEl) a.remove();
    });

    for (const link of data.links || []) {
      const a = document.createElement('a');
      a.href = link.url || '#';
      a.className = 'mono contact-link';
      a.textContent = `${link.label || ''} ↗`;
      linksWrap.appendChild(a);
    }
  } catch (err) {
    // keep the static fallback content already in the page
  }
}

renderAbout();
