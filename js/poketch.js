/* Pokétch Edition: eigene Pixel-Symbole, LCD-Uhr/Kalender/Batterie, Startbildschirm.
 * Alles selbst entworfen (keine Original-Sprites). Rein darstellend – keine Daten werden verändert. */
const Poketch = (() => {
  // 12×12-Pixelsymbole ('#' = Pixel)
  const PX = {
    metall: [ // Amboss
      '............', '.##########.', '############', '.##########.', '....####....', '....####....',
      '...######...', '..########..', '.##########.', '.##########.', '............', '............'],
    elektro: [ // Blitz
      '.......###..', '......###...', '.....###....', '....###.....', '...#######..', '......###...',
      '.....###....', '....###.....', '...###......', '..##........', '.#..........', '............'],
    bau: [ // Gebäude
      '.....##.....', '....####....', '...######...', '..########..', '.##########.', '..#..##..#..',
      '..#..##..#..', '..########..', '..#..##..#..', '..#..##..#..', '..##.##.##..', '############'],
    it: [ // Computer
      '############', '#..........#', '#.##.......#', '#....##....#', '#..........#', '#.#####....#',
      '#..........#', '############', '.....##.....', '....####....', '..########..', '............'],
    chemie: [ // Reagenzglas
      '....####....', '.....##.....', '.....##.....', '.....##.....', '....#..#....', '....#..#....',
      '...#....#...', '...######...', '..########..', '..##.#####..', '..########..', '...######...'],
    physik: [ // Atom
      '.....##.....', '..#..##..#..', '.##.#..#.##.', '..##....##..', '.#.#.##.#.#.', '#..##..##..#',
      '#..##..##..#', '.#.#.##.#.#.', '..##....##..', '.##.#..#.##.', '..#..##..#..', '.....##.....'],
    ethik: [ // Waage
      '.....##.....', '############', '.#...##...#.', '.#...##...#.', '#.#..##..#.#', '#.#..##..#.#',
      '#####..#####', '.....##.....', '.....##.....', '.....##.....', '...######...', '..########..'],
    deutsch: [ // Buch
      '............', '.####..####.', '#....##....#', '#.##.##.##.#', '#....##....#', '#.##.##.##.#',
      '#....##....#', '#.##.##.##.#', '#....##....#', '.####..####.', '.....##.....', '............'],
    englisch: [ // Globus
      '....####....', '..##.##.##..', '.#..#..#..#.', '.#.##..##.#.', '############', '#..#....#..#',
      '#..#....#..#', '############', '.#.##..##.#.', '.#..#..#..#.', '..##.##.##..', '....####....'],
    mathe: [ // Taschenrechner
      '.##########.', '.#........#.', '.#.######.#.', '.#........#.', '.##########.', '.#.#.#.#.#.#',
      '.##########.', '.#.#.#.#.#.#', '.##########.', '.#.#.#.###.#', '.##########.', '............'],
    sozial: [ // Sprechblasen
      '#######.....', '#.....#.....', '#.###.#.....', '#.....######', '###.###....#', '..#.#.#.##.#',
      '..##..#....#', '......######', '........#...', '........##..', '............', '............'],
    gem: [ // Standard: Ordner
      '............', '.####.......', '#....#......', '############', '#..........#', '#..........#',
      '#..........#', '#..........#', '#..........#', '############', '............', '............']
  };
  const ACCENT = { metall: '#8d9aa5', elektro: '#e9c13a', bau: '#e08a3c', it: '#3fa7c9', chemie: '#5fbf5a', physik: '#8a6fe0', ethik: '#d873a8', deutsch: '#e0503d', englisch: '#3f7fe0', mathe: '#28a596', sozial: '#c49a4a' };
  const SHORT = { metall: 'Metall', elektro: 'Elektro', bau: 'Bau', it: 'IT', chemie: 'Chemie', physik: 'Physik', ethik: 'Ethik', deutsch: 'Deutsch', englisch: 'Englisch', mathe: 'Mathe', sozial: 'Sozial' };
  const key = (n) => (typeof Hyrule !== 'undefined' ? Hyrule.key(n) : null);
  function svg(rows) {
    let r = '';
    rows.forEach((row, y) => { for (let x = 0; x < row.length; x++) if (row[x] === '#') r += `M${x} ${y}h1v1h-1z`; });
    return `<svg class="pk-svg" viewBox="0 0 12 12" shape-rendering="crispEdges" aria-hidden="true"><path d="${r}" fill="currentColor"/></svg>`;
  }
  const icon = (name) => svg(PX[key(name)] || PX.gem);
  const accent = (name, fb) => ACCENT[key(name)] || fb || '#5f8f55';
  const short = (name) => SHORT[key(name)] || (String(name).length > 9 ? String(name).slice(0, 8) + '.' : String(name));

  /* ---------- LCD-Anzeige auf der Startseite: Uhr, Datum, Monatskalender, Batterie */
  const WD = ['SO', 'MO', 'DI', 'MI', 'DO', 'FR', 'SA'];
  const MON = ['JAN', 'FEB', 'MÄR', 'APR', 'MAI', 'JUN', 'JUL', 'AUG', 'SEP', 'OKT', 'NOV', 'DEZ'];
  const two = (n) => String(n).padStart(2, '0');
  function calendar(d) {
    const y = d.getFullYear(), m = d.getMonth(), first = new Date(y, m, 1), days = new Date(y, m + 1, 0).getDate();
    const off = (first.getDay() + 6) % 7; // Montag zuerst
    let h = ['MO', 'DI', 'MI', 'DO', 'FR', 'SA', 'SO'].map((w) => `<b>${w[0]}</b>`).join('');
    for (let i = 0; i < off; i++) h += '<i></i>';
    for (let n = 1; n <= days; n++) h += `<span class="${n === d.getDate() ? 'on' : ''}">${n}</span>`;
    return `<div class="pk-cal"><div class="pk-cal-h">${MON[m]} ${y}</div><div class="pk-cal-g">${h}</div></div>`;
  }
  let timer = null;
  function mountHome(v) {
    const el = v.querySelector('.pk-hero');
    if (!el) return;
    const draw = (tick) => {
      if (tick && !el.isConnected) { clearInterval(timer); timer = null; return; }
      const d = new Date();
      el.innerHTML = `<div class="pk-lcd">
          <div class="pk-clock"><span class="pk-time">${two(d.getHours())}<i>:</i>${two(d.getMinutes())}</span>
            <span class="pk-date">${WD[d.getDay()]} ${two(d.getDate())}.${two(d.getMonth() + 1)}.${d.getFullYear()}</span>
            <span class="pk-title">FOS DIGITAL BINDER</span></div>
          ${calendar(d)}
          <div class="pk-batt" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
        </div>`;
    };
    draw();
    clearInterval(timer);
    timer = setInterval(() => draw(true), 20000);
  }

  /* ---------- kurzer Startbildschirm (nur einmal pro App-Start) */
  let booted = false;
  function boot() {
    if (booted || document.documentElement.dataset.design !== 'poketch') return;
    booted = true;
    const b = document.createElement('div');
    b.className = 'pk-boot';
    b.innerHTML = '<div class="pk-boot-lcd"><b>FOS</b><span>DIGITAL BINDER</span><em>START …</em></div>';
    document.body.appendChild(b);
    setTimeout(() => b.classList.add('out'), 750);
    setTimeout(() => b.remove(), 1150);
  }
  return { icon, accent, short, mountHome, boot };
})();
