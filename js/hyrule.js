/* Hyrule Edition: eigene Inventar-Symbole und Zierelemente (selbst gezeichnete SVG-Linien, keine Original-Assets).
 * Rein darstellend – liest Fachnamen, verändert keine gespeicherten Daten. */
const Hyrule = (() => {
  const G = (d, extra = '') => `<svg class="hy-svg" viewBox="0 0 48 48" aria-hidden="true">${extra}<g fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${d}</g></svg>`;
  const ICONS = {
    metall: G('<path d="M10 20h22c0 5-4 8-9 8h-2l3 9h-12l3-9h-1c-3 0-4-3-4-8z"/><path d="M32 20h6l-6 5"/><path d="M16 15l3-7M22 15V7M28 15l-3-7"/>'),
    elektro: G('<path d="M27 4L12 27h10l-4 17 18-25H25z"/>'),
    bau: G('<path d="M8 42h32M12 42V22l12-12 12 12v20"/><path d="M20 42V32a4 4 0 0 1 8 0v10"/><path d="M12 28h24M18 22v6M30 22v6M24 16v6"/>'),
    it: G('<rect x="12" y="12" width="24" height="24" rx="3"/><path d="M18 18h5v5h7v7"/><circle cx="18" cy="18" r="1.4"/><circle cx="30" cy="30" r="1.4"/><path d="M17 6v6M24 6v6M31 6v6M17 36v6M24 36v6M31 36v6M6 17h6M6 24h6M6 31h6M36 17h6M36 24h6M36 31h6"/>'),
    chemie: G('<path d="M19 6h10M21 6v10L10 34a6 6 0 0 0 5 9h18a6 6 0 0 0 5-9L27 16V6"/><path d="M14 30h20"/><circle cx="21" cy="36" r="1.6"/><circle cx="28" cy="34" r="2.2"/>'),
    physik: G('<circle cx="24" cy="24" r="4"/><ellipse cx="24" cy="24" rx="19" ry="7.5"/><ellipse cx="24" cy="24" rx="19" ry="7.5" transform="rotate(60 24 24)"/><ellipse cx="24" cy="24" rx="19" ry="7.5" transform="rotate(-60 24 24)"/>'),
    ethik: G('<path d="M24 6v34M16 42h16M10 12h28"/><path d="M10 12l-6 14h12zM38 12l-6 14h12z"/><path d="M4 26a6 4 0 0 0 12 0M32 26a6 4 0 0 0 12 0"/>'),
    deutsch: G('<path d="M40 6C26 8 14 20 10 38l4 2C18 26 26 16 40 6z"/><path d="M14 40l-4 4M17 28l8 1M21 21l8 1"/><path d="M26 42h14"/>'),
    englisch: G('<path d="M12 10h22a4 4 0 0 1 4 4v24a4 4 0 0 1-4 4"/><path d="M12 10a4 4 0 0 0-4 4v4h8v-4a4 4 0 0 0-4-4z"/><path d="M16 14v24a4 4 0 0 0 4 4h14a4 4 0 0 0 4-4v-4H20"/><path d="M22 20h10M22 26h10"/>'),
    mathe: G('<circle cx="24" cy="9" r="3"/><path d="M22.5 11.6L12 40M25.5 11.6L36 40"/><path d="M14.5 33a16 16 0 0 0 19 0"/><path d="M18 26h12"/>'),
    sozial: G('<path d="M24 5l15 6v11c0 10-6 17-15 21-9-4-15-11-15-21V11z"/><circle cx="18" cy="21" r="3"/><circle cx="30" cy="21" r="3"/><path d="M13 32c1-4 3-6 5-6s4 2 5 6M25 32c1-4 3-6 5-6s4 2 5 6"/>'),
    gem: G('<path d="M24 4l12 12-12 28L12 16z"/><path d="M12 16h24M18 16l6-12 6 12M24 44l-6-28M24 44l6-28"/>')
  };
  // muted fantasy accent per subject (falls back to the subject's own colour)
  const ACCENT = { metall: '#a7b4bd', elektro: '#e3c25c', bau: '#c98a58', it: '#51BDB5', chemie: '#86c86f', physik: '#9b86e6', ethik: '#cf94b6', deutsch: '#d9735f', englisch: '#76a0dc', mathe: '#C5A45B', sozial: '#b9a36f' };
  function key(name) {
    const n = String(name || '').toLowerCase().trim();
    if (n.startsWith('metall')) return 'metall';
    if (n.startsWith('elektro')) return 'elektro';
    if (n.startsWith('bau')) return 'bau';
    if (n === 'it' || n.startsWith('informatik') || n.startsWith('it ') || n.startsWith('it-')) return 'it';
    if (n.startsWith('chemie')) return 'chemie';
    if (n.startsWith('physik')) return 'physik';
    if (n.startsWith('ethik') || n.startsWith('religion')) return 'ethik';
    if (n.startsWith('deutsch')) return 'deutsch';
    if (n.startsWith('englisch') || n.startsWith('english')) return 'englisch';
    if (n.startsWith('mathe')) return 'mathe';
    if (n.startsWith('sozial') || n.startsWith('politik') || n.startsWith('geschichte')) return 'sozial';
    return null;
  }
  const icon = (name) => ICONS[key(name)] || ICONS.gem;
  const accent = (name, fallback) => ACCENT[key(name)] || fallback || '#C5A45B';
  // eigenes Wappen: Sechseck-Rahmen mit Rautenkristall und Rune-Linien
  const crest = `<svg class="hy-crest" viewBox="0 0 120 120" aria-hidden="true">
    <g fill="none" stroke="var(--hy-gold)" stroke-width="2"><path d="M60 6l47 27v54l-47 27-47-27V33z"/><path d="M60 16l38 22v44l-38 22-38-22V38z" opacity=".55"/></g>
    <g class="hy-glow" fill="none" stroke="var(--hy-teal)" stroke-width="1.6" stroke-linecap="round"><path d="M22 60h14M84 60h14M60 22v10M60 88v10"/><circle cx="60" cy="60" r="27" stroke-dasharray="4 7"/></g>
    <path d="M60 34l14 26-14 26-14-26z" fill="var(--hy-gold)" opacity=".92"/><path d="M60 34v52M46 60h28" stroke="var(--hy-ink)" stroke-width="1.4" opacity=".55"/>
  </svg>`;
  // Ornamentband aus kleinen Dreiecken und Rauten
  const band = `<svg class="hy-band" viewBox="0 0 240 14" preserveAspectRatio="none" aria-hidden="true"><path d="M0 7h96M144 7h96" stroke="var(--hy-gold)" stroke-width="1.2"/><path d="M104 7l8-6 8 6-8 6zM120 7l8-6 8 6-8 6z" fill="none" stroke="var(--hy-gold)" stroke-width="1.2"/><path d="M116 7l4-3 4 3-4 3z" fill="var(--hy-teal)"/></svg>`;
  return { icon, accent, key, crest, band };
})();
