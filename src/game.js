(() => {
'use strict';

/* ================= constants ================= */
const $ = id => document.getElementById(id);
const cv = $('world'), ctx = cv.getContext('2d');
const G = 8, MAXL = 12, SAVE_KEY = 'mossby-v1';
const RM = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

const LEVELS = [null, 'Tent', 'Hut', 'Cottage', 'House', 'Townhouse', 'Corner Shop',
  'Apartments', 'Office', 'Tower', 'High-rise', 'Skyscraper', 'Sky Spire'];
const HT = [0, 54, 48, 62, 76, 84, 60, 98, 122, 150, 164, 228, 262];
const POP = LEVELS.map((_, l) => l ? Math.round(2 * Math.pow(2.3, l - 1)) : 0);
const RANKS = [
  { name: 'Camp', pop: 0, cap: 3 }, { name: 'Hamlet', pop: 60, cap: 5 }, { name: 'Village', pop: 450, cap: 7 },
  { name: 'Town', pop: 3500, cap: 9 }, { name: 'City', pop: 25000, cap: 11 }, { name: 'Metropolis', pop: 200000, cap: 12 },
  { name: 'Capital', pop: 600000, cap: 12 }, { name: 'Megacity', pop: 1000000, cap: 12 }
];
// Each rank caps how far buildings can merge, so the land fills up before the settlement grows.
const capL = () => RANKS[S.rank].cap;
const MAX_SPAWN = 10;
const inc = l => Math.pow(2.1, l - 1);
const bounds = r => { const n = Math.min(G, 4 + r), lo = Math.floor((G - n) / 2); return [lo, lo + n - 1, n]; };

/* ================= colour helpers ================= */
const NIGHT = '#141a4a';
const _rgb = new Map();
function rgb(h) { let r = _rgb.get(h); if (!r) { const n = parseInt(h.slice(1), 16); r = [n >> 16, n >> 8 & 255, n & 255]; _rgb.set(h, r); } return r; }
function mix(a, b, t) {
  const A = rgb(a), B = rgb(b);
  const c = i => Math.round(A[i] + (B[i] - A[i]) * t);
  return '#' + ((1 << 24) | (c(0) << 16) | (c(1) << 8) | c(2)).toString(16).slice(1);
}
const shade = (c, a) => a >= 0 ? mix(c, '#ffffff', a) : mix(c, '#000000', -a);

/* ================= state ================= */
let S, B = [], grid = [], unlockAt = [];
let quiet = false;               // true while simulating: no sound, particles or DOM effects
let time = 0, night = 0;
const fresh = () => ({ coins: 30, cells: {}, rank: 0, bought: 0, spawnL: 1, market: 0, maxL: 0, tut: 0, sound: true, last: Date.now(), merges: 0 });

const mult = () => 1 + .25 * S.market;
const income = () => { let t = 0; for (const b of B) t += inc(b.l); return t * mult(); };
const population = () => { let t = 0; for (const b of B) t += POP[b.l]; return t; };
const buildCost = () => Math.ceil(10 * Math.pow(3.2, S.spawnL - 1) * Math.pow(1.1, S.bought));
const spawnCost = () => 500 * Math.pow(6, S.spawnL - 1);
const marketCost = () => Math.ceil(250 * Math.pow(3, S.market));
const canSpawnUp = () => S.spawnL < MAX_SPAWN && S.maxL >= S.spawnL + 2;

function fmt(n) {
  if (n < 1000) return String(Math.floor(n));
  const u = ['K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx']; let i = -1;
  while (n >= 1000 && i < u.length - 1) { n /= 1000; i++; }
  return (n < 10 ? n.toFixed(2) : n < 100 ? n.toFixed(1) : Math.floor(n)) + u[i];
}

function serialize() {
  S.cells = {};
  for (const b of B) S.cells[b.x + ',' + b.y] = b.l;
  S.last = Date.now();
  return JSON.stringify(S);
}
function save() { try { localStorage.setItem(SAVE_KEY, serialize()); } catch (e) { /* storage blocked: play on without saving */ } }
function load(raw) {
  S = fresh();
  try {
    const txt = raw || localStorage.getItem(SAVE_KEY);
    if (txt) { const o = JSON.parse(txt); if (o && typeof o.coins === 'number' && o.cells) S = Object.assign(S, o); }
  } catch (e) { S = fresh(); }
  B = []; grid = []; unlockAt = [];
  for (let x = 0; x < G; x++) { grid.push(new Array(G).fill(null)); unlockAt.push(new Array(G).fill(-99)); }
  for (const k in S.cells) {
    const [x, y] = k.split(',').map(Number), l = S.cells[k];
    if (x >= 0 && y >= 0 && x < G && y < G && l >= 1 && l <= MAXL && !grid[x][y]) addB(x, y, l, false);
  }
}

/* ================= game actions ================= */
let nextId = 1;
function addB(x, y, l, drop) {
  const b = { id: nextId++, x, y, l, u: x + .5, v: y + .5, z: drop ? 240 : 0, vz: 0, sy: 1, vsy: 0, fx: 1 + Math.random() * 4 };
  B.push(b); grid[x][y] = b;
  if (l > S.maxL) { S.maxL = l; discover(l); }
  return b;
}
function removeB(b) { B.splice(B.indexOf(b), 1); if (grid[b.x][b.y] === b) grid[b.x][b.y] = null; }
function unlocked(x, y) { const [lo, hi] = bounds(S.rank); return x >= lo && x <= hi && y >= lo && y <= hi; }
function freeCells() {
  const [lo, hi] = bounds(S.rank), out = [];
  for (let x = lo; x <= hi; x++) for (let y = lo; y <= hi; y++) if (!grid[x][y]) out.push([x, y]);
  return out;
}
function buy() {
  const free = freeCells(), c = buildCost();
  if (!free.length || S.coins < c) { sfx('no'); return false; }
  S.coins -= c; S.bought++;
  const [x, y] = free[Math.floor(Math.random() * free.length)];
  addB(x, y, S.spawnL, !quiet);
  sfx('buy'); checkRank();
  return true;
}
function merge(a, t) {            // a is absorbed into t
  removeB(a);
  t.l++; S.merges++;
  if (t.l > S.maxL) { S.maxL = t.l; discover(t.l); }
  if (S.tut < 2) { S.tut = 2; tutT = 7; }
  if (!quiet) {
    t.sy = .45; t.vsy = 0;
    const [wx, wy] = wp(t.u, t.v, HT[t.l] * .5);
    burst(wx, wy, 14, 'star'); burst(wx, wy + HT[t.l] * .4, 6, 'puff');
    floater(wx, wy - HT[t.l] * .5 - 8, LEVELS[t.l] + '!', '#fffdf6');
    sfx('merge', t.l); buzz(18);
  }
  checkRank();
}
function checkRank() {
  const pop = population();
  let up = false;
  while (S.rank < RANKS.length - 1 && pop >= RANKS[S.rank + 1].pop) {
    const [olo, ohi] = bounds(S.rank);
    S.rank++; up = true;
    const [lo, hi] = bounds(S.rank);
    for (let x = lo; x <= hi; x++) for (let y = lo; y <= hi; y++)
      if (x < olo || x > ohi || y < olo || y > ohi) unlockAt[x][y] = time + Math.random() * .9;
  }
  if (up) onRankUp();
}
function buySpawnUp() {
  if (!canSpawnUp() || S.coins < spawnCost()) { sfx('no'); return false; }
  S.coins -= spawnCost(); S.spawnL++; S.bought = 0; sfx('up'); return true;
}
function buyMarket() {
  if (S.coins < marketCost()) { sfx('no'); return false; }
  S.coins -= marketCost(); S.market++; sfx('up'); return true;
}
function tapB(b) {
  const gain = Math.max(1, inc(b.l) * mult() * .5);
  S.coins += gain;
  b.sy = .78; b.vsy = 0;
  const [wx, wy] = wp(b.u, b.v, HT[b.l]);
  floater(wx, wy - 6, '+' + fmt(gain), '#ffe08a');
  particles.push({ t: 'coin', x: wx, y: wy, vx: (Math.random() - .5) * 60, vy: -150, g: 520, life: .7, max: .7, r: 5 });
  sfx('tap'); buzz(6);
}

/* ================= effects: sound, haptics, particles ================= */
let ac = null;
function audioInit() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
  try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ac = null; }
}
function tone(f, d, type, vol, when, slide) {
  if (!ac || !S.sound || quiet) return;
  const t = ac.currentTime + (when || 0), o = ac.createOscillator(), g = ac.createGain();
  o.type = type || 'sine'; o.frequency.setValueAtTime(f, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(f * slide, t + d);
  g.gain.setValueAtTime(vol || .1, t); g.gain.exponentialRampToValueAtTime(.001, t + d);
  o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + d + .03);
}
function sfx(k, n) {
  if (k === 'buy') tone(520, .12, 'triangle', .09, 0, 1.5);
  else if (k === 'land') tone(150, .14, 'sine', .16, 0, .5);
  else if (k === 'merge') { const f = 392 * Math.pow(1.06, n || 1); tone(f, .14, 'triangle', .11); tone(f * 1.5, .22, 'triangle', .11, .09); }
  else if (k === 'tap') tone(880, .06, 'square', .03, 0, 1.3);
  else if (k === 'no') tone(140, .12, 'sawtooth', .04, 0, .8);
  else if (k === 'up') { tone(523, .1, 'triangle', .1); tone(659, .1, 'triangle', .1, .08); tone(784, .2, 'triangle', .1, .16); }
  else if (k === 'rank') [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, .3, 'triangle', .11, i * .11));
  else if (k === 'pick') tone(660, .05, 'sine', .05, 0, 1.2);
}
function buzz(ms) { if (quiet || !S.sound) return; try { navigator.vibrate && navigator.vibrate(ms); } catch (e) { /* no haptics here */ } }

const particles = [], floaters = [];
const CONF = ['#ff6f61', '#ffc93c', '#6fd0c2', '#8f88ea', '#fffdf6', '#7ed67e'];
function burst(x, y, n, t) {
  if (quiet) return;
  if (RM) n = Math.ceil(n / 3);
  for (let i = 0; i < n && particles.length < 320; i++) {
    const a = Math.random() * 6.283, sp = 40 + Math.random() * 130;
    if (t === 'star') particles.push({ t, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 70, g: 320, life: .7 + Math.random() * .3, max: 1, r: 3 + Math.random() * 3.5, c: CONF[i % 3] });
    else if (t === 'puff') particles.push({ t, x: x + Math.cos(a) * 12, y: y + Math.sin(a) * 5, vx: Math.cos(a) * 46, vy: Math.sin(a) * 18 - 8, g: 0, life: .5, max: .5, r: 5 + Math.random() * 5 });
    else if (t === 'leaf') particles.push({ t, x, y, vx: Math.cos(a) * sp * .5, vy: -60 - Math.random() * 80, g: 300, life: .8, max: .8, r: 3 + Math.random() * 2.5, c: i % 2 ? '#46a85f' : '#7ed67e' });
  }
}
function floater(x, y, txt, c) { if (!quiet) floaters.push({ x, y, txt, c, life: 1.1 }); }
function confetti() {
  const n = RM ? 20 : 110, w = W / cam.s, top = cam.y - scrY / cam.s;
  for (let i = 0; i < n; i++) particles.push({
    t: 'conf', x: cam.x + (Math.random() - .5) * w, y: top - Math.random() * 160,
    vx: (Math.random() - .5) * 80, vy: 80 + Math.random() * 140, g: 60, life: 3.2, max: 3.2,
    r: 4 + Math.random() * 4, c: CONF[i % CONF.length], rot: Math.random() * 6, vr: (Math.random() - .5) * 12
  });
}

/* ================= sprites (buildings and trees are painted once, then blitted) ================= */
const SPR_W = 120, SPR_H = 330, SPR_OX = 60, SPR_OY = 295;
let sprS = 0, sprites = {};

function painter(g, isNight) {
  const P = c => isNight ? mix(c, NIGHT, .52) : c;
  const pt = (u, v, z) => [(u - v) * 50, (u + v) * 25 - z];
  const poly = (pts, c) => {
    g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
    g.closePath(); g.fillStyle = c; g.strokeStyle = c; g.lineWidth = .7; g.lineJoin = 'round'; g.fill(); g.stroke();
  };
  const K = { pt, poly, P, night: isNight };
  K.shadow = r => { g.fillStyle = 'rgba(20,45,35,.2)'; g.beginPath(); g.ellipse(4, 3, r * 62, r * 31, 0, 0, 6.3); g.fill(); };
  K.box = (u, v, w, d, z, h, c) => {
    const u0 = u - w / 2, u1 = u + w / 2, v0 = v - d / 2, v1 = v + d / 2;
    poly([pt(u0, v1, z), pt(u1, v1, z), pt(u1, v1, z + h), pt(u0, v1, z + h)], P(c));
    poly([pt(u1, v0, z), pt(u1, v1, z), pt(u1, v1, z + h), pt(u1, v0, z + h)], P(shade(c, -.17)));
    poly([pt(u0, v0, z + h), pt(u1, v0, z + h), pt(u1, v1, z + h), pt(u0, v1, z + h)], P(shade(c, .22)));
  };
  K.gable = (u, v, w, d, z, rh, c, wall) => {      // ridge runs along u
    const u0 = u - w / 2, u1 = u + w / 2, v0 = v - d / 2, v1 = v + d / 2;
    poly([pt(u0, v0, z), pt(u1, v0, z), pt(u1, v, z + rh), pt(u0, v, z + rh)], P(shade(c, .2)));
    poly([pt(u1, v0 + .03, z), pt(u1, v1 - .03, z), pt(u1, v, z + rh)], P(shade(wall, -.17)));
    poly([pt(u0, v1, z), pt(u1, v1, z), pt(u1, v, z + rh), pt(u0, v, z + rh)], P(c));
  };
  K.gableV = (u, v, w, d, z, rh, c, wall) => {     // ridge runs along v
    const u0 = u - w / 2, u1 = u + w / 2, v0 = v - d / 2, v1 = v + d / 2;
    poly([pt(u0, v0, z), pt(u0, v1, z), pt(u, v1, z + rh), pt(u, v0, z + rh)], P(shade(c, .2)));
    poly([pt(u0 + .03, v1, z), pt(u1 - .03, v1, z), pt(u, v1, z + rh)], P(wall));
    poly([pt(u1, v0, z), pt(u1, v1, z), pt(u, v1, z + rh), pt(u, v0, z + rh)], P(shade(c, -.14)));
  };
  K.hip = (u, v, w, d, z, rh, cL, cR) => {
    const u0 = u - w / 2, u1 = u + w / 2, v0 = v - d / 2, v1 = v + d / 2, a = pt(u, v, z + rh);
    poly([pt(u0, v0, z), pt(u1, v0, z), a], P(shade(cL, .2)));
    poly([pt(u0, v0, z), pt(u0, v1, z), a], P(shade(cL, .12)));
    poly([pt(u0, v1, z), pt(u1, v1, z), a], P(cL));
    poly([pt(u1, v0, z), pt(u1, v1, z), a], P(cR));
  };
  K.wins = (face, u, v, w, d, z, h, cols, rows, c, gap) => {
    const L = face === 'L', span = L ? w : d, a0 = (L ? u : v) - span / 2, fix = L ? v + d / 2 : u + w / 2;
    const cw = span / cols, ch = h / rows; gap = gap == null ? .36 : gap;
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const s0 = a0 + i * cw + cw * gap / 2, s1 = s0 + cw * (1 - gap), z0 = z + j * ch + ch * .2, z1 = z0 + ch * .6;
      const lit = ((i * 7 + j * 13 + cols * 3 + (L ? 0 : 5)) % 7) > 1;
      let col = L ? c : shade(c, -.16);
      if (isNight) col = lit ? (L ? '#ffd66e' : '#f0b84a') : mix(col, NIGHT, .7);
      poly(L ? [pt(s0, fix, z0), pt(s1, fix, z0), pt(s1, fix, z1), pt(s0, fix, z1)]
             : [pt(fix, s0, z0), pt(fix, s1, z0), pt(fix, s1, z1), pt(fix, s0, z1)], col);
    }
  };
  K.door = (u, v1, dw, dh, c, z) => { z = z || 0; poly([pt(u - dw / 2, v1, z), pt(u + dw / 2, v1, z), pt(u + dw / 2, v1, z + dh), pt(u - dw / 2, v1, z + dh)], P(c)); };
  K.line = (a, b, c, w) => { g.strokeStyle = P(c); g.lineWidth = w; g.lineCap = 'round'; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); };
  K.dot = (p, r, c, raw) => { g.fillStyle = raw ? c : P(c); g.beginPath(); g.arc(p[0], p[1], r, 0, 6.3); g.fill(); };
  return K;
}

const GLASS = '#5fb2e6', PALE = '#e8f7ff';
const DRAW = [null,
  K => { // 1 Tent
    K.shadow(.6);
    K.hip(0, 0, .62, .62, 0, 40, '#fff0d0', '#ffb35c');
    K.poly([K.pt(-.1, .31, 0), K.pt(.1, .31, 0), K.pt(0, .17, 20)], K.P('#7a4b2e'));
    K.line(K.pt(0, 0, 40), K.pt(0, 0, 54), '#7a4b2e', 1.6);
    K.poly([K.pt(0, 0, 54), K.pt(0, 0, 45), K.pt(.15, 0, 49)], K.P('#ff6f61'));
    K.box(.37, .37, .1, .1, 0, 4, '#8a5a3c');
    K.dot(K.pt(.37, .37, 8), 4.2, K.night ? '#ffb84d' : '#ff8a3c', true);
  },
  K => { // 2 Hut
    K.shadow(.6);
    K.box(0, 0, .5, .5, 0, 20, '#c98f5e');
    K.door(0, .25, .13, 13, '#6e4426');
    K.wins('R', 0, 0, .5, .5, 3, 16, 1, 1, '#f9e7b0', .55);
    K.hip(0, 0, .7, .7, 17, 30, '#f4d470', '#d8ae48');
  },
  K => { // 3 Cottage
    K.shadow(.7);
    K.box(0, 0, .62, .54, 0, 26, '#fff1dc');
    K.door(-.15, .27, .12, 15, '#b9694d');
    K.wins('L', .13, 0, .3, .54, 5, 18, 1, 1, GLASS);
    K.wins('R', 0, 0, .62, .54, 5, 18, 2, 1, GLASS);
    K.gable(0, 0, .74, .66, 24, 24, '#e9604e', '#fff1dc');
    K.box(-.17, .07, .09, .09, 40, 20, '#c98a6b');
  },
  K => { // 4 House
    K.shadow(.78);
    K.box(0, 0, .7, .6, 0, 42, '#bfe4f4');
    K.door(-.19, .3, .12, 16, '#5d6ea3');
    K.wins('L', .12, 0, .36, .6, 3, 18, 1, 1, '#fffdf6');
    K.wins('L', 0, 0, .7, .6, 21, 18, 2, 1, '#fffdf6');
    K.wins('R', 0, 0, .7, .6, 3, 36, 2, 2, '#fffdf6');
    K.gable(0, 0, .82, .72, 40, 26, '#5d6ea3', '#bfe4f4');
    K.box(.2, .09, .09, .09, 54, 20, '#8c93b8');
  },
  K => { // 5 Townhouse
    K.shadow(.84);
    K.box(-.2, 0, .4, .62, 0, 54, '#ffc4c9');
    K.door(-.2, .31, .11, 16, '#b0475c');
    K.wins('L', -.2, 0, .4, .62, 20, 30, 2, 2, '#fffdf6');
    K.gableV(-.2, 0, .44, .68, 52, 24, '#c9566b', '#ffc4c9');
    K.box(.2, 0, .4, .62, 0, 42, '#ffe28f');
    K.door(.2, .31, .11, 16, '#a86a1f');
    K.wins('L', .2, 0, .4, .62, 20, 18, 2, 1, '#fffdf6');
    K.wins('R', .2, 0, .4, .62, 4, 34, 3, 2, '#fffdf6');
    K.gableV(.2, 0, .44, .68, 40, 22, '#d98b3a', '#ffe28f');
  },
  K => { // 6 Corner Shop
    K.shadow(.86);
    K.box(0, 0, .76, .7, 0, 38, '#ffe9c9');
    K.door(-.24, .35, .13, 17, '#3f8f7a');
    K.wins('L', .1, 0, .46, .7, 2, 20, 1, 1, '#9fdcf5', .08);
    K.wins('R', 0, 0, .76, .7, 4, 28, 2, 1, '#9fdcf5');
    for (let i = 0; i < 6; i++) {
      const a = -.38 + i * .76 / 6, b = a + .76 / 6;
      K.poly([K.pt(a, .35, 27), K.pt(b, .35, 27), K.pt(b, .49, 18), K.pt(a, .49, 18)], K.P(i % 2 ? '#fffdf6' : '#ff6f61'));
    }
    K.box(0, 0, .84, .78, 38, 5, '#7ec4a4');
    K.box(0, .1, .5, .07, 43, 14, '#ff6f61');
  },
  K => { // 7 Apartments
    K.shadow(.84);
    K.box(0, 0, .7, .7, 0, 80, '#f6ab80');
    K.door(0, .35, .14, 15, '#8a4a2c');
    K.wins('L', 0, 0, .7, .7, 18, 58, 3, 4, '#fff6dd');
    K.wins('R', 0, 0, .7, .7, 4, 72, 3, 5, '#fff6dd');
    K.box(0, 0, .77, .77, 80, 5, '#fbe3cf');
    K.box(-.14, -.14, .2, .2, 85, 11, '#8d6e58');
    K.hip(-.14, -.14, .24, .24, 96, 8, '#6f5545', '#5c4638');
  },
  K => { // 8 Office
    K.shadow(.9);
    K.box(0, 0, .76, .76, 0, 106, '#8ecbe8');
    K.door(0, .38, .2, 14, '#3d6f8f');
    K.wins('L', 0, 0, .76, .76, 16, 88, 1, 7, PALE, .1);
    K.wins('R', 0, 0, .76, .76, 4, 100, 1, 8, PALE, .1);
    K.box(0, 0, .82, .82, 106, 4, '#eaf6fb');
    K.box(.12, -.1, .24, .24, 110, 11, '#c5d3dc');
  },
  K => { // 9 Tower
    K.shadow(.96);
    K.box(0, 0, .84, .84, 0, 44, '#dfe3f5');
    K.door(0, .42, .2, 15, '#6a74a8');
    K.wins('L', 0, 0, .84, .84, 16, 26, 4, 1, GLASS);
    K.wins('R', 0, 0, .84, .84, 4, 38, 4, 2, GLASS);
    K.box(0, 0, .6, .6, 44, 86, '#8fb9f2');
    K.wins('L', 0, 0, .6, .6, 46, 82, 3, 6, PALE);
    K.wins('R', 0, 0, .6, .6, 46, 82, 3, 6, PALE);
    K.box(0, 0, .64, .64, 130, 4, '#dfe3f5');
    K.line(K.pt(0, 0, 134), K.pt(0, 0, 150), '#6a74a8', 1.6);
  },
  K => { // 10 High-rise
    K.shadow(.98);
    K.box(0, 0, .86, .86, 0, 40, '#d3f3e8');
    K.door(0, .43, .2, 15, '#3f8f86');
    K.wins('L', 0, 0, .86, .86, 16, 22, 4, 1, '#3fa79b');
    K.wins('R', 0, 0, .86, .86, 4, 34, 4, 2, '#3fa79b');
    K.box(0, 0, .68, .68, 40, 62, '#74d2c2');
    K.wins('L', 0, 0, .68, .68, 42, 58, 3, 4, PALE);
    K.wins('R', 0, 0, .68, .68, 42, 58, 3, 4, PALE);
    K.box(0, 0, .5, .5, 102, 50, '#4fb9ae');
    K.wins('L', 0, 0, .5, .5, 104, 46, 2, 4, PALE);
    K.wins('R', 0, 0, .5, .5, 104, 46, 2, 4, PALE);
    K.box(0, 0, .56, .56, 152, 4, '#6fc267');
    K.dot(K.pt(-.1, .06, 161), 7, '#46a85f'); K.dot(K.pt(.12, -.04, 160), 5.5, '#5cc072');
  },
  K => { // 11 Skyscraper
    K.shadow(.94);
    K.box(0, 0, .8, .8, 0, 24, '#cfcaf7');
    K.door(0, .4, .2, 14, '#5a52b8');
    K.wins('R', 0, 0, .8, .8, 4, 18, 4, 1, '#5a52b8');
    K.box(0, 0, .64, .64, 24, 150, '#8f88ea');
    K.wins('L', 0, 0, .64, .64, 26, 146, 2, 12, PALE, .22);
    K.wins('R', 0, 0, .64, .64, 26, 146, 2, 12, PALE, .22);
    K.box(0, 0, .46, .46, 174, 18, '#bbb5ff');
    K.wins('L', 0, 0, .46, .46, 176, 14, 3, 1, '#fffdf6');
    K.wins('R', 0, 0, .46, .46, 176, 14, 3, 1, '#fffdf6');
    K.line(K.pt(0, 0, 192), K.pt(0, 0, 226), '#5a52b8', 2);
  },
  K => { // 12 Sky Spire
    K.shadow(.98);
    const tiers = [[.84, 0, 46, 4], [.66, 50, 66, 3], [.5, 120, 56, 2], [.34, 180, 36, 2]];
    for (const [w, z, h, n] of tiers) {
      K.box(0, 0, w, w, z, h, '#f3f0ff');
      K.wins('L', 0, 0, w, w, z + 3, h - 6, n, Math.round(h / 12), '#7f8fe0');
      K.wins('R', 0, 0, w, w, z + 3, h - 6, n, Math.round(h / 12), '#7f8fe0');
      K.box(0, 0, w + .05, w + .05, z + h, 4, '#ffcf4d');
    }
    K.door(0, .42, .2, 15, '#d9930f');
    K.hip(0, 0, .38, .38, 220, 26, '#ffcf4d', '#e0a326');
    K.line(K.pt(0, 0, 246), K.pt(0, 0, 258), '#d9930f', 2);
  }
];
const TREES = [
  K => { K.shadow(.26); K.box(0, 0, .07, .07, 0, 14, '#8a5a3c'); K.dot(K.pt(0, 0, 30), 17, '#3f9d58'); K.dot(K.pt(-.07, -.07, 30), 10, '#59bb6e'); },
  K => { K.shadow(.24); K.box(0, 0, .06, .06, 0, 10, '#8a5a3c'); K.hip(0, 0, .38, .38, 8, 24, '#3f9d58', '#2f8249'); K.hip(0, 0, .3, .3, 22, 22, '#46a85f', '#35904f'); K.hip(0, 0, .2, .2, 36, 18, '#59bb6e', '#3f9d58'); },
  K => { K.shadow(.2); K.dot(K.pt(0, 0, 9), 11, '#46a85f'); K.dot(K.pt(-.05, -.05, 10), 6, '#6fcf7f'); }
];
function spr(kind, key, isNight) {
  const id = kind + key + (isNight ? 'n' : 'd');
  let c = sprites[id];
  if (!c) {
    c = document.createElement('canvas');
    c.width = Math.ceil(SPR_W * sprS); c.height = Math.ceil(SPR_H * sprS);
    const g = c.getContext('2d');
    g.setTransform(sprS, 0, 0, sprS, SPR_OX * sprS, SPR_OY * sprS);
    (kind === 'b' ? DRAW[key] : TREES[key])(painter(g, isNight));
    sprites[id] = c;
  }
  return c;
}
function drawSprite(kind, key, wx, wy, sx, sy, rot) {
  ctx.save(); ctx.translate(wx, wy);
  if (rot) ctx.rotate(rot);
  ctx.scale(sx, sy);
  ctx.drawImage(spr(kind, key, false), -SPR_OX, -SPR_OY, SPR_W, SPR_H);
  if (night > .02) { ctx.globalAlpha = night; ctx.drawImage(spr(kind, key, true), -SPR_OX, -SPR_OY, SPR_W, SPR_H); ctx.globalAlpha = 1; }
  ctx.restore();
}
function preview(canvas, l) {
  const g = canvas.getContext('2d'), s = spr('b', l, false);
  g.clearRect(0, 0, canvas.width, canvas.height);
  const top = SPR_OY - HT[l] - 6, hh = HT[l] + 40, k = Math.min(canvas.width / SPR_W, canvas.height / hh);
  g.drawImage(s, 0, top * sprS, SPR_W * sprS, hh * sprS, (canvas.width - SPR_W * k) / 2, (canvas.height - hh * k) / 2, SPR_W * k, hh * k);
}

/* ================= camera & projection ================= */
let W = 0, H = 0, dpr = 1, scrX = 0, scrY = 0;
const cam = { x: 0, y: 0, s: 1, tx: 0, ty: 0, ts: 1 };
const wp = (u, v, z) => [(u - v) * 50, (u + v - G) * 25 - (z || 0)];
function toGround(px, py) {
  const wx = (px - scrX) / cam.s + cam.x, wy = (py - scrY) / cam.s + cam.y;
  const a = wx / 50, b = wy / 25 + G;
  return [(a + b) / 2, (b - a) / 2];
}
function layout(snap) {
  const r = cv.getBoundingClientRect();
  W = r.width; H = r.height; dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const pw = Math.round(W * dpr), ph = Math.round(H * dpr);
  if (cv.width !== pw || cv.height !== ph) { cv.width = pw; cv.height = ph; }
  const top = $('hud').getBoundingClientRect().bottom - r.top, bot = $('dock').getBoundingClientRect().top - r.top;
  const [lo, hi, n] = bounds(S.rank);
  scrX = W / 2; scrY = top + (bot - top) / 2;
  cam.ts = Math.max(.2, Math.min((W - 12) / (n * 100 + 30), (bot - top - 12) / (n * 50 + 150), 1.7));
  cam.tx = 0; cam.ty = (lo + hi + 1 - G) * 25 - 42;
  if (snap) { cam.x = cam.tx; cam.y = cam.ty; cam.s = cam.ts; }
  const want = cam.ts * dpr;
  if (Math.abs(want - sprS) > sprS * .02) { sprS = want; sprites = {}; uiCache = {}; }
}

/* ================= ambient life ================= */
const villagers = [], clouds = [], stars = [];
const SHIRTS = ['#ff6f61', '#ffc93c', '#6fd0c2', '#8f88ea', '#fffdf6', '#f6ab80'], SKIN = ['#f7d2b0', '#d9a57c', '#a8744f', '#fbe0c8'];
function syncVillagers() {
  const want = Math.min(18, B.length ? 2 + Math.floor(Math.sqrt(population()) / 2.2) : 0);
  const [lo, hi] = bounds(S.rank);
  while (villagers.length < want) {
    const u = lo + Math.floor(Math.random() * (hi - lo + 2)), v = lo + Math.floor(Math.random() * (hi - lo + 2));
    villagers.push({ u, v, tu: u, tv: v, sp: .35 + Math.random() * .3, c: SHIRTS[villagers.length % SHIRTS.length], k: SKIN[villagers.length % SKIN.length], ph: Math.random() * 6, wait: Math.random() * 2 });
  }
}
function stepVillagers(dt) {
  const [lo, hi] = bounds(S.rank);
  for (const p of villagers) {
    const du = p.tu - p.u, dv = p.tv - p.v, d = Math.hypot(du, dv);
    if (d < .02) {
      p.wait -= dt;
      if (p.wait <= 0) {
        const dir = [[1, 0], [-1, 0], [0, 1], [0, -1]][Math.floor(Math.random() * 4)];
        const nu = Math.round(p.u) + dir[0], nv = Math.round(p.v) + dir[1];
        if (nu >= lo && nu <= hi + 1 && nv >= lo && nv <= hi + 1) { p.tu = nu; p.tv = nv; }
        p.wait = Math.random() < .3 ? 1 + Math.random() * 2 : 0;
      }
    } else { const m = Math.min(d, p.sp * dt); p.u += du / d * m; p.v += dv / d * m; p.ph += dt * 11; }
  }
}
for (let i = 0; i < 6; i++) clouds.push({ x: Math.random(), y: .08 + Math.random() * .75, s: .6 + Math.random() * .8, v: .004 + Math.random() * .006 });
for (let i = 0; i < 46; i++) stars.push([Math.random(), Math.random() * .8, .6 + Math.random() * 1.2, Math.random() * 6]);
const hash = (x, y, k) => { const n = Math.sin(x * 127.1 + y * 311.7 + k * 74.7) * 43758.5453; return n - Math.floor(n); };

/* ================= update ================= */
let drag = null, tutT = 0, smokeT = 0;
function economy(dt) { S.coins += income() * dt; }
function update(dt) {
  time += dt;
  const ph = (time / 150 + .08) % 1, ss = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  night = ss(.52, .64, ph) - ss(.88, .98, ph);
  economy(dt);

  const k = Math.min(1, dt * 4);
  cam.x += (cam.tx - cam.x) * k; cam.y += (cam.ty - cam.y) * k; cam.s += (cam.ts - cam.s) * k;

  for (const b of B) {
    if (!(drag && drag.b === b && drag.moved)) {
      const q = Math.min(1, dt * 16);
      b.u += (b.x + .5 - b.u) * q; b.v += (b.y + .5 - b.v) * q;
    }
    if (b.z > 0) {
      b.vz += 1700 * dt; b.z -= b.vz * dt;
      if (b.z <= 0) { b.z = 0; b.sy = .58; b.vsy = 0; const [wx, wy] = wp(b.u, b.v); burst(wx, wy, 7, 'puff'); sfx('land'); buzz(10); }
    }
    b.vsy += ((1 - b.sy) * 300 - b.vsy * 15) * dt; b.sy += b.vsy * dt;
    b.fx -= dt;
    if (b.fx <= 0 && !RM) {
      b.fx = 3 + Math.random() * 5 + B.length * .12;
      const [wx, wy] = wp(b.u, b.v, HT[b.l]);
      if (particles.length < 200) particles.push({ t: 'coin', x: wx, y: wy, vx: (Math.random() - .5) * 40, vy: -120, g: 420, life: .75, max: .75, r: 4.5 });
    }
  }
  smokeT -= dt;
  if (smokeT <= 0 && !RM) {
    smokeT = .5;
    for (const b of B) {
      const src = b.l === 3 ? [-.17, .07, 62] : b.l === 4 ? [.2, .09, 76] : null;
      if (src && particles.length < 240 && Math.random() < .7) {
        const [wx, wy] = wp(b.u + src[0], b.v + src[1], src[2]);
        particles.push({ t: 'smoke', x: wx, y: wy, vx: 6 + Math.random() * 6, vy: -22, g: 0, life: 1.6, max: 1.6, r: 3 });
      }
    }
  }
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt; if (p.life <= 0) { particles.splice(i, 1); continue; }
    p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.vr) p.rot += p.vr * dt;
  }
  for (let i = floaters.length - 1; i >= 0; i--) { const f = floaters[i]; f.life -= dt; f.y -= 34 * dt; if (f.life <= 0) floaters.splice(i, 1); }
  for (const c of clouds) { c.x += c.v * dt; if (c.x > 1.25) { c.x = -.25; c.y = .08 + Math.random() * .75; } }
  syncVillagers(); stepVillagers(dt);
  if (S.tut === 2) { tutT -= dt; if (tutT <= 0) S.tut = 3; }
}

/* ================= render ================= */
function tile(x, y, c) {
  const a = wp(x, y), b = wp(x + 1, y), d = wp(x + 1, y + 1), e = wp(x, y + 1);
  ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(d[0], d[1]); ctx.lineTo(e[0], e[1]); ctx.closePath();
  ctx.fillStyle = c; ctx.fill();
}
function render() {
  const s = cam.s, N = c => night > .01 ? mix(c, NIGHT, night * .5) : c;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const sky = ctx.createLinearGradient(0, 0, 0, H), skyTop = mix('#7cc8f2', '#171c48', night);
  sky.addColorStop(0, skyTop); sky.addColorStop(1, mix('#dcf5ff', '#474c94', night));
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
  if (skyTop !== render.sky) { render.sky = skyTop; document.body.style.background = skyTop; }
  if (night > .05) {
    ctx.fillStyle = '#fffdf6';
    for (const st of stars) { ctx.globalAlpha = night * (.5 + .5 * Math.sin(time * 2 + st[3])); ctx.beginPath(); ctx.arc(st[0] * W, st[1] * H, st[2], 0, 6.3); ctx.fill(); }
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = '#ffffff';
  for (const c of clouds) {
    ctx.globalAlpha = .85 - night * .6;
    const x = c.x * W, y = c.y * H, r = 22 * c.s;
    ctx.beginPath(); ctx.ellipse(x, y, r * 1.5, r * .62, 0, 0, 6.3); ctx.ellipse(x - r * .7, y + r * .12, r * .9, r * .46, 0, 0, 6.3); ctx.ellipse(x + r * .5, y - r * .32, r * .8, r * .55, 0, 0, 6.3); ctx.fill();
  }
  ctx.globalAlpha = 1;

  ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * (scrX - cam.x * s), dpr * (scrY - cam.y * s));

  // island body
  const L = wp(0, G), Bt = wp(G, G), R = wp(G, 0), TH = 34;
  ctx.fillStyle = N('#b9804f'); ctx.beginPath(); ctx.moveTo(L[0], L[1]); ctx.lineTo(Bt[0], Bt[1]); ctx.lineTo(Bt[0], Bt[1] + TH); ctx.lineTo(L[0], L[1] + TH); ctx.fill();
  ctx.fillStyle = N('#96673f'); ctx.beginPath(); ctx.moveTo(R[0], R[1]); ctx.lineTo(Bt[0], Bt[1]); ctx.lineTo(Bt[0], Bt[1] + TH); ctx.lineTo(R[0], R[1] + TH); ctx.fill();
  ctx.fillStyle = N('#58a554'); ctx.beginPath(); ctx.moveTo(L[0], L[1]); ctx.lineTo(Bt[0], Bt[1]); ctx.lineTo(Bt[0], Bt[1] + 8); ctx.lineTo(L[0], L[1] + 8); ctx.fill();
  ctx.fillStyle = N('#4a9148'); ctx.beginPath(); ctx.moveTo(R[0], R[1]); ctx.lineTo(Bt[0], Bt[1]); ctx.lineTo(Bt[0], Bt[1] + 8); ctx.lineTo(R[0], R[1] + 8); ctx.fill();

  // ground
  const base = wp(0, 0), far = wp(G, G);
  ctx.fillStyle = N('#66b85f'); ctx.beginPath(); ctx.moveTo(base[0], base[1]); ctx.lineTo(R[0], R[1]); ctx.lineTo(far[0], far[1]); ctx.lineTo(L[0], L[1]); ctx.fill();
  const [lo, hi] = bounds(S.rank);
  let hover = null;
  if (drag && drag.moved) { const hx = Math.floor(drag.b.u), hy = Math.floor(drag.b.v); if (unlocked(hx, hy)) hover = [hx, hy]; }
  for (let x = 0; x < G; x++) for (let y = 0; y < G; y++) {
    const open = x >= lo && x <= hi && y >= lo && y <= hi, f = open ? Math.min(1, Math.max(0, (time - unlockAt[x][y]) / .5)) : 0;
    const odd = (x + y) & 1;
    tile(x, y, N(mix(odd ? '#6cbd64' : '#66b85f', odd ? '#9be284' : '#8fdc7c', f)));
    if (drag && drag.moved && open) {
      const t = grid[x][y];
      if (t && t !== drag.b && t.l === drag.b.l && t.l < capL()) { ctx.globalAlpha = .45 + .25 * Math.sin(time * 7); tile(x, y, '#ffe08a'); ctx.globalAlpha = 1; }
    }
    if (hover && hover[0] === x && hover[1] === y) { ctx.globalAlpha = .55; tile(x, y, '#ffffff'); ctx.globalAlpha = 1; }
  }

  // depth-sorted things
  const items = [];
  for (let x = 0; x < G; x++) for (let y = 0; y < G; y++) {
    const open = x >= lo && x <= hi && y >= lo && y <= hi, since = time - unlockAt[x][y];
    if (open && since > .35) continue;
    const k = open ? Math.max(0, 1 - Math.max(0, since) / .35) : 1;
    if (open && since > 0 && !unlockAt[x][y].popped) { /* leaves handled below */ }
    for (let i = 0; i < 2; i++) {
      const tu = x + .28 + i * .42 + hash(x, y, i) * .14, tv = y + .3 + (1 - i) * .36 + hash(x, y, i + 5) * .14;
      items.push({ d: tu + tv, t: 0, u: tu, v: tv, key: Math.floor(hash(x, y, i + 9) * 2.6), k, ph: x * 2 + y + i });
    }
  }
  for (const b of B) if (!(drag && drag.b === b && drag.moved)) items.push({ d: b.u + b.v, t: 1, b });
  for (const p of villagers) items.push({ d: p.u + p.v + .01, t: 2, p });
  items.sort((a, b) => a.d - b.d);
  for (const it of items) {
    if (it.t === 0) {
      const [wx, wy] = wp(it.u, it.v);
      drawSprite('t', it.key, wx, wy, it.k, it.k, RM ? 0 : Math.sin(time * 1.3 + it.ph) * .035);
    } else if (it.t === 1) drawB(it.b, 0);
    else {
      const p = it.p, [wx, wy] = wp(p.u, p.v), hop = Math.abs(Math.sin(p.ph)) * 2.6;
      ctx.fillStyle = 'rgba(20,45,35,.22)'; ctx.beginPath(); ctx.ellipse(wx, wy, 4, 2, 0, 0, 6.3); ctx.fill();
      ctx.fillStyle = N(p.c); ctx.beginPath(); ctx.roundRect(wx - 3.2, wy - 9 - hop, 6.4, 8.5, 2.6); ctx.fill();
      ctx.fillStyle = N(p.k); ctx.beginPath(); ctx.arc(wx, wy - 11.5 - hop, 3.3, 0, 6.3); ctx.fill();
    }
  }

  // tutorial ghost finger
  if (S.tut === 1 && !drag) {
    const pr = findPair();
    if (pr) {
      const t = (time % 1.8) / 1.8, e = Math.min(1, t / .7), q = e * e * (3 - 2 * e);
      const a = wp(pr[0].u, pr[0].v, 14), b = wp(pr[1].u, pr[1].v, 14);
      ctx.globalAlpha = t < .85 ? .9 : (1 - t) / .15 * .9;
      ctx.fillStyle = '#fffdf6'; ctx.strokeStyle = '#22305a'; ctx.lineWidth = 2.5 / s * .8;
      ctx.beginPath(); ctx.arc(a[0] + (b[0] - a[0]) * q, a[1] + (b[1] - a[1]) * q, 11 / s * .8, 0, 6.3); ctx.fill(); ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
  if (drag && drag.moved) drawB(drag.b, 26);

  for (const p of particles) {
    const a = Math.min(1, p.life / p.max * 2);
    ctx.globalAlpha = a;
    if (p.t === 'star') { ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * a, 0, 6.3); ctx.fill(); }
    else if (p.t === 'puff') { ctx.globalAlpha = a * .8; ctx.fillStyle = '#fffdf6'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1.6 - a * .6), 0, 6.3); ctx.fill(); }
    else if (p.t === 'smoke') { ctx.globalAlpha = a * .5; ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r + (p.max - p.life) * 5, 0, 6.3); ctx.fill(); }
    else if (p.t === 'leaf') { ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.3); ctx.fill(); }
    else if (p.t === 'coin') { ctx.fillStyle = '#d9930f'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.3); ctx.fill(); ctx.fillStyle = '#ffc93c'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * .7, 0, 6.3); ctx.fill(); }
    else if (p.t === 'conf') { ctx.fillStyle = p.c; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillRect(-p.r, -p.r * .45, p.r * 2, p.r * .9); ctx.restore(); }
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'center'; ctx.lineJoin = 'round';
  for (const f of floaters) {
    ctx.globalAlpha = Math.min(1, f.life * 2.5);
    ctx.font = '800 ' + (15 / s) + 'px "Baloo 2", system-ui, sans-serif';
    ctx.lineWidth = 4 / s; ctx.strokeStyle = '#22305a'; ctx.strokeText(f.txt, f.x, f.y);
    ctx.fillStyle = f.c; ctx.fillText(f.txt, f.x, f.y);
  }
  ctx.globalAlpha = 1;
}
function drawB(b, lift) {
  const [wx, wy] = wp(b.u, b.v, b.z + lift);
  let sy = b.sy;
  if (!RM && !lift) sy *= 1 + Math.sin(time * 2.2 + b.x * 1.3 + b.y * .7) * .012;
  if (lift) { const g = wp(b.u, b.v); ctx.fillStyle = 'rgba(20,45,35,.25)'; ctx.beginPath(); ctx.ellipse(g[0], g[1], 30, 15, 0, 0, 6.3); ctx.fill(); }
  drawSprite('b', b.l, wx, wy, 1 + (1 - sy) * .55, sy, 0);
  const top = b.l === 9 ? 150 : b.l === 11 ? 226 : b.l === 12 ? 258 : 0;
  if (top && Math.sin(time * 3 + b.id) > 0) { ctx.fillStyle = '#ff5a4d'; ctx.beginPath(); ctx.arc(wx, wy - top * sy, 2.6, 0, 6.3); ctx.fill(); }
}
function findPair() {
  const seen = {};
  for (const b of B) { if (b.l >= capL()) continue; if (seen[b.l]) return [seen[b.l], b]; seen[b.l] = b; }
  return null;
}

/* ================= HUD ================= */
let uiCache = {};
function set(id, prop, val) { const k = id + prop; if (uiCache[k] !== val) { uiCache[k] = val; const el = $(id); if (prop === 'cls') el.className = val; else if (prop === 'w') el.style.width = val; else if (prop === 'hid') el.hidden = val; else el.textContent = val; } }
function hud() {
  const pop = population(), nxt = RANKS[S.rank + 1], cur = RANKS[S.rank];
  set('coins', 't', fmt(S.coins));
  set('rate', 't', fmt(income()) + ' per sec');
  set('rankName', 't', cur.name);
  set('popTxt', 't', nxt ? fmt(pop) + ' / ' + fmt(nxt.pop) : fmt(pop) + ' people');
  set('popBar', 'w', (nxt ? Math.min(100, (pop - cur.pop) / (nxt.pop - cur.pop) * 100) : 100).toFixed(1) + '%');

  const free = freeCells().length, c = buildCost();
  set('buildName', 't', 'Build ' + LEVELS[S.spawnL]);
  set('buildSub', 't', free ? 'Lands on a free plot' : 'No free plot. Merge first.');
  set('buildCost', 't', fmt(c));
  set('build', 'cls', free && S.coins >= c ? '' : 'off');
  if (uiCache.prevL !== S.spawnL) { uiCache.prevL = S.spawnL; preview($('buildPrev'), S.spawnL); }

  const maxed = S.spawnL >= MAX_SPAWN, can = canSpawnUp();
  set('upSpawnSub', 't', maxed ? 'Fully trained' : can ? 'New builds start as ' + LEVELS[S.spawnL + 1] : 'Merge up to a ' + LEVELS[S.spawnL + 2] + ' first');
  set('upSpawnCost', 't', maxed ? 'Max' : fmt(spawnCost()));
  set('upSpawn', 'cls', 'up' + (!can ? ' off' : S.coins >= spawnCost() ? ' ready' : ' off'));
  set('upMarketName', 't', 'Market day' + (S.market ? ' ' + (S.market + 1) : ''));
  set('upMarketCost', 't', fmt(marketCost()));
  set('upMarket', 'cls', 'up' + (S.coins >= marketCost() ? ' ready' : ' off'));

  let h = '';
  if (S.tut === 0) { if (B.length >= 2 && findPair()) S.tut = 1; else h = B.length ? 'Nice! Build one more tent' : 'Tap Build to pitch your first tent'; }
  if (S.tut === 1) h = 'Drag one tent onto the other';
  else if (S.tut === 2) h = 'Bigger homes earn more. Keep merging!';
  else if (S.tut >= 3 && nxt && S.rank < 5 && B.filter(b => b.l === cur.cap).length >= 2 && !findPair()) h = 'Fill the land to become a ' + nxt.name;
  set('hint', 't', h); set('hint', 'hid', !h);
}

let toastTimer = 0, rankTimer = 0;
function discover(l) {
  if (quiet || l < 2 || !sprS) return;
  $('toastName').textContent = LEVELS[l]; preview($('toastPrev'), l);
  const t = $('toast'); t.hidden = true; void t.offsetWidth; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
}
function onRankUp() {
  if (quiet) return;
  layout(false);
  const grew = bounds(S.rank)[2] > bounds(S.rank - 1)[2];
  $('rankupTop').textContent = 'Your ' + RANKS[S.rank - 1].name.toLowerCase() + ' has grown into a';
  $('rankupName').textContent = RANKS[S.rank].name + '!';
  $('rankupSub').textContent = grew ? 'New land cleared for building' : 'The whole island cheers';
  const r = $('rankup'); r.hidden = true; void r.offsetWidth; r.hidden = false;
  clearTimeout(rankTimer); rankTimer = setTimeout(() => { r.hidden = true; }, 3200);
  confetti(); sfx('rank'); buzz(60);
  const [lo, hi] = bounds(S.rank);
  for (let x = lo; x <= hi; x++) for (let y = lo; y <= hi; y++) if (unlockAt[x][y] > time - .1) {
    const [wx, wy] = wp(x + .5, y + .5, 20);
    setTimeout(() => burst(wx, wy, 5, 'leaf'), Math.max(0, (unlockAt[x][y] - time) * 1000));
  }
  save();
}
function away(sec) {
  if (sec < 60 || !B.length) return;
  const capped = Math.min(sec, 7200), gain = income() * capped;
  if (gain < 1) return;
  S.coins += gain;
  const m = Math.round(capped / 60);
  $('awayTxt').textContent = 'Your villagers kept working for ' + (m >= 60 ? (m / 60).toFixed(1).replace('.0', '') + ' hours' : m + ' minutes') + (sec > 7200 ? ' (they rest after 2 hours).' : '.');
  $('awaySum').textContent = '+' + fmt(gain);
  $('away').hidden = false;
}

/* ================= input ================= */
function pos(e) { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
function pick(px, py) {
  const list = B.slice().sort((a, b) => (b.u + b.v) - (a.u + a.v));
  for (const b of list) {
    const [wx, wy] = wp(b.u, b.v), sx = (wx - cam.x) * cam.s + scrX, sy = (wy - cam.y) * cam.s + scrY;
    if (Math.abs(px - sx) < 40 * cam.s && py < sy + 24 * cam.s && py > sy - (HT[b.l] + 4) * cam.s) return b;
  }
  const [u, v] = toGround(px, py), x = Math.floor(u), y = Math.floor(v);
  return x >= 0 && y >= 0 && x < G && y < G ? grid[x][y] : null;
}
cv.addEventListener('pointerdown', e => {
  audioInit(); closeMenu();
  const [px, py] = pos(e), b = pick(px, py);
  if (!b || b.z > 0 || drag) return;
  drag = { b, x0: px, y0: py, moved: false, id: e.pointerId };
  try { cv.setPointerCapture(e.pointerId); } catch (err) { /* capture is optional */ }
});
cv.addEventListener('pointermove', e => {
  if (!drag || e.pointerId !== drag.id) return;
  const [px, py] = pos(e);
  if (!drag.moved && Math.hypot(px - drag.x0, py - drag.y0) > 9) { drag.moved = true; drag.b.sy = 1.15; sfx('pick'); }
  if (drag.moved) { const [u, v] = toGround(px, py - 6); drag.b.u = u; drag.b.v = v; }
});
function release(e) {
  if (!drag || e.pointerId !== drag.id) return;
  const b = drag.b, moved = drag.moved; drag = null;
  if (!moved) { tapB(b); return; }
  const x = Math.floor(b.u), y = Math.floor(b.v);
  b.sy = .8;
  if (!unlocked(x, y) || (x === b.x && y === b.y)) return;
  const t = grid[x][y];
  if (!t) { grid[b.x][b.y] = null; b.x = x; b.y = y; grid[x][y] = b; sfx('land'); }
  else if (t.l === b.l && t.l < capL() && t.z <= 0) merge(b, t);
  else {
    if (t.l === b.l && S.rank < 5) { const [wx, wy] = wp(x + .5, y + .5, HT[t.l] + 10); floater(wx, wy, 'Merges once you are a ' + RANKS[S.rank + 1].name, '#fffdf6'); sfx('no'); } grid[b.x][b.y] = t; grid[x][y] = b; t.x = b.x; t.y = b.y; b.x = x; b.y = y; t.sy = .8; sfx('land'); }
}
cv.addEventListener('pointerup', release);
cv.addEventListener('pointercancel', release);

$('build').addEventListener('click', () => { audioInit(); buy(); });
$('upSpawn').addEventListener('click', () => { audioInit(); buySpawnUp(); });
$('upMarket').addEventListener('click', () => { audioInit(); buyMarket(); });
$('awayOk').addEventListener('click', () => { audioInit(); $('away').hidden = true; sfx('up'); });
let resetArmed = 0;
function closeMenu() { $('menu').hidden = true; $('gear').setAttribute('aria-expanded', 'false'); resetArmed = 0; $('resetBtn').textContent = 'Start a new village'; }
$('gear').addEventListener('click', () => { const m = $('menu'); if (m.hidden) { m.hidden = false; $('gear').setAttribute('aria-expanded', 'true'); $('soundBtn').textContent = 'Sound: ' + (S.sound ? 'on' : 'off'); } else closeMenu(); });
$('soundBtn').addEventListener('click', () => { S.sound = !S.sound; $('soundBtn').textContent = 'Sound: ' + (S.sound ? 'on' : 'off'); audioInit(); sfx('tap'); save(); });
$('resetBtn').addEventListener('click', () => {
  if (!resetArmed) { resetArmed = 1; $('resetBtn').textContent = 'Tap again to erase everything'; return; }
  const snd = S.sound;
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* nothing stored */ }
  load('{}'); S.sound = snd; villagers.length = 0; particles.length = 0; uiCache = {};
  closeMenu(); layout(true); save();
});

/* ================= loop ================= */
let lastT = 0, saveT = 0, layT = 0;
function frame(t) {
  const dt = Math.min(.05, (t - lastT) / 1000 || 0); lastT = t;
  update(dt); render(); hud();
  saveT += dt; if (saveT > 5) { saveT = 0; save(); }
  layT += dt; if (layT > 1) { layT = 0; layout(false); }
  requestAnimationFrame(frame);
}
let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { hiddenAt = Date.now(); save(); }
  else if (hiddenAt) { away((Date.now() - hiddenAt) / 1000); hiddenAt = 0; }
});
window.addEventListener('pagehide', save);
window.addEventListener('resize', () => layout(true));

function start(data) {
  load(data && data.save);
  layout(true);
  away((Date.now() - S.last) / 1000);
  requestAnimationFrame(frame);
}

// Balance helper for development: plays `sec` seconds with a simple bot and reports when each rank is reached.
window.__sim = (sec, step) => {
  quiet = true; step = step || .5;
  const log = []; let r = S.rank;
  for (let t = 0; t < sec; t += step) {
    economy(step);
    if (canSpawnUp() && S.coins >= spawnCost()) buySpawnUp();
    if (S.coins >= marketCost() * 2) buyMarket();
    while (S.coins >= buildCost() && freeCells().length) buy();
    for (let p = findPair(); p; p = findPair()) merge(p[0], p[1]);
    if (S.rank !== r) { r = S.rank; log.push(RANKS[r].name + ' @ ' + Math.round(t / 60) + ' min'); }
  }
  quiet = false; uiCache = {}; layout(true);
  return { log, coins: fmt(S.coins), income: fmt(income()), pop: population(), spawnL: S.spawnL, market: S.market, maxL: S.maxL, n: B.length };
};

const hot = window.claude && window.claude.hot;
if (hot && hot.snapshot) hot.snapshot(() => ({ save: serialize() }));
if (hot && hot.ready) hot.ready(start); else start((hot && hot.data) || {});
})();
