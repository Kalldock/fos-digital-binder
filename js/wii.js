/* Wii Edition: Infoleiste mit Uhr/Datum, schwebende Blasen, Kanal-Kacheln.
 * Eigene Gestaltung (keine Original-Grafiken/Logos). Rein darstellend – keine Daten werden verändert. */
const Wii = (() => {
  // klare, freundliche Kanalfarben (für Symbol und Rahmen beim Antippen)
  const ACCENT = { metall: '#7f8c99', elektro: '#f2b705', bau: '#f08a24', it: '#21a0d8', chemie: '#3dbb5c', physik: '#7a5ce0', ethik: '#e0609a', deutsch: '#e5483b', englisch: '#2f7ae5', mathe: '#14a89a', sozial: '#c49a4a' };
  const key = (n) => (typeof Hyrule !== 'undefined' ? Hyrule.key(n) : null);
  const accent = (name, fb) => ACCENT[key(name)] || fb || '#21a0d8';
  const icon = (name) => (typeof Hyrule !== 'undefined' ? Hyrule.icon(name) : '');
  const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  const two = (n) => String(n).padStart(2, '0');

  // Hintergrund: einige Blasen, die langsam per CSS-Transform schweben (GPU-schonend)
  const bubbles = () => '<div class="wi-bg" aria-hidden="true">' + [0, 1, 2, 3, 4, 5, 6].map((i) => `<i style="--b:${i}"></i>`).join('') + '</div>';

  let timer = null;
  function mountHome(v) {
    const bar = v.querySelector('.wi-bar');
    if (!bar) return;
    const draw = (tick) => {
      if (tick && !bar.isConnected) { clearInterval(timer); timer = null; return; }
      const d = new Date();
      bar.querySelector('.wi-time').innerHTML = `${two(d.getHours())}<span>:</span>${two(d.getMinutes())}`;
      bar.querySelector('.wi-date').textContent = `${WD[d.getDay()]} ${two(d.getDate())}.${two(d.getMonth() + 1)}.`;
    };
    draw();
    clearInterval(timer);
    timer = setInterval(() => draw(true), 15000);
    bar.querySelector('[data-wi=settings]').onclick = () => { const b = v.querySelector('.topbar [data-a=settings]'); if (b) b.click(); };
    bar.querySelector('[data-wi=search]').onclick = () => { const b = v.querySelector('.topbar [data-a=search]'); if (b) b.click(); };
  }
  // Leiste unten: Kurve mit blauer Linie (eigene SVG-Form), Uhr in der Mitte, runde Tasten links/rechts
  const barHTML = () => `<div class="wi-bar">
      <svg class="wi-curve" viewBox="0 0 1000 120" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 52 H250 C320 52 330 6 400 6 H600 C670 6 680 52 750 52 H1000 V120 H0Z" fill="url(#wiG)"/>
        <path d="M0 52 H250 C320 52 330 6 400 6 H600 C670 6 680 52 750 52 H1000" fill="none" stroke="#5cc8f0" stroke-width="3" vector-effect="non-scaling-stroke"/>
        <defs><linearGradient id="wiG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#e3e9ee"/></linearGradient></defs>
      </svg>
      <button class="wi-round" data-wi="settings" title="Einstellungen"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/></svg></button>
      <div class="wi-clock"><div class="wi-time"></div><div class="wi-date"></div></div>
      <button class="wi-round" data-wi="search" title="Suchen"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5l5.5 5.5"/></svg></button>
    </div>`;
  return { accent, icon, bubbles, barHTML, mountHome };
})();
