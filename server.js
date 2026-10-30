// 江戶亂鬥傳 — 多人連線伺服器（零相依套件，node server.js 即可啟動）
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto'), os = require('os');
const PORT = process.env.PORT || 3000;
const PUB = path.join(__dirname, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };

// ---------------- 遊戲資料 ----------------
const SCENES = [
  { name: '寺社境內', w: 640, npcs: ['ninja', 'ronin', 'ninja', 'chinpira', 'ronin'], items: [['stone', 180, 30], ['bokken', 400, 20], ['stone', 520, 50], ['rock', 120, 14], ['bucket', 470, 10], ['chair', 300, 40]] },
  { name: '城下大通', w: 768, npcs: ['chinpira', 'chinpira', 'ronin', 'chinpira', 'chinpira'], items: [['barrel', 300, 10], ['stone', 460, 40], ['bokken', 620, 30], ['chair', 90, 12], ['chair', 120, 12], ['bucket', 540, 8], ['bucket', 200, 30], ['rock', 700, 50]] },
  { name: '商店街', w: 768, peace: true, npcs: [], items: [], shops: [{ x: 150, id: 'food' }, { x: 384, id: 'weapon' }, { x: 620, id: 'gear' }] },
  { name: '長屋小巷', w: 640, npcs: ['chinpira', 'ronin', 'chinpira', 'ninja', 'chinpira'], items: [['barrel', 140, 8], ['barrel', 330, 8], ['stone', 480, 45], ['bucket', 310, 12], ['bucket', 60, 20], ['chair', 420, 10], ['rock', 600, 40]] },
  { name: '河原', w: 768, npcs: ['ronin', 'sumo', 'chinpira', 'ronin', 'ninja'], items: [['stone', 150, 50], ['stone', 300, 25], ['stone', 520, 55], ['bokken', 650, 30], ['rock', 220, 20], ['rock', 420, 45], ['rock', 600, 15], ['chair', 690, 12], ['bucket', 80, 30]] },
  { name: '港口碼頭', w: 768, npcs: ['sumo', 'ronin', 'oyabun', 'ninja', 'sumo'], items: [['barrel', 200, 8], ['barrel', 230, 12], ['stone', 500, 40], ['bucket', 360, 10], ['bucket', 380, 14], ['chair', 560, 20], ['rock', 680, 45]] },
];
const START = 2;
const ZMIN = 4, ZMAX = 62, ZR = 12;

// 建築排列（固定、不重疊）。前端照這份畫，伺服器照這份算屋簷高度。
// t: machiya 町家（一樓屋簷可站）、shop 商店、nagaya 長屋、shed 小屋、kura 倉庫（太高不能站）
function row(x0, x1, widths, mk) { const a = []; let x = x0, i = 0; while (x + widths[i % widths.length] <= x1) { const w = widths[i % widths.length]; a.push(mk(x, w, i)); x += w + 6; i++; } return a; }
const SIGNS = ['酒', '米', '湯', '油', '宿', '藥', '紙', '傘', '炭', '蕎'];
const LAYOUT = [
  [{ t: 'shed', x: 470, w: 60, h: 54, s: '手水' }],
  row(4, 764, [64, 72, 64, 80, 72], (x, w, i) => ({ t: 'machiya', x, w, h: 92, n: i % 5, s: SIGNS[(i * 3) % 10], l: i % 2, k: i % 3 === 1 ? ['酒', '御宿', '藥'][i % 3] : null, p: i % 4 })),
  [
    { t: 'machiya', x: 30, w: 66, h: 90, n: 1, s: '菓', l: 1, p: 0 },
    { t: 'shop', x: 104, w: 92, h: 98, id: 'food', n: 2, s: '茶屋', b: '福壽庵' },
    { t: 'machiya', x: 204, w: 60, h: 90, n: 4, s: '布', l: 1, p: 1 },
    { t: 'machiya', x: 270, w: 60, h: 90, n: 0, s: '扇', l: 0, p: 3 },
    { t: 'shop', x: 338, w: 92, h: 98, id: 'weapon', n: 3, s: '武具', b: '鐵心堂' },
    { t: 'machiya', x: 438, w: 62, h: 90, n: 5, s: '花', l: 1, p: 2 },
    { t: 'machiya', x: 506, w: 60, h: 90, n: 1, s: '櫛', l: 0, p: 0 },
    { t: 'shop', x: 574, w: 92, h: 98, id: 'gear', n: 4, s: '道具', b: '萬屋' },
    { t: 'machiya', x: 674, w: 66, h: 90, n: 0, s: '傘', l: 1, p: 1 },
  ],
  row(4, 636, [124], (x, w) => ({ t: 'nagaya', x, w, h: 56 })),
  [{ t: 'shed', x: 640, w: 80, h: 54, s: '茶' }],
  [{ t: 'kura', x: 14, w: 72, h: 92 }, { t: 'kura', x: 94, w: 72, h: 92 }, { t: 'shed', x: 186, w: 84, h: 54, s: '問屋' }, { t: 'kura', x: 620, w: 84, h: 92 }, { t: 'shed', x: 712, w: 52, h: 54 }],
];
function roofOf(b) {
  if (b.t === 'machiya' || b.t === 'shop') return { x0: b.x - 2, x1: b.x + b.w + 2, y: b.h - 38 };
  if (b.t === 'nagaya' || b.t === 'shed') return { x0: b.x - 2, x1: b.x + b.w + 2, y: b.h };
  return null;
}

const NT = {
  chinpira: { hp: 30, spd: 1.2, atk: 0, def: 0, money: [8, 16], aggr: 0.6 },
  ronin: { hp: 45, spd: 1.1, atk: 2, def: 0, money: [15, 30], aggr: 0.7, weapon: 0.5 },
  ninja: { hp: 35, spd: 1.7, atk: 1, def: 0, money: [20, 35], aggr: 0.8, jumper: true, thrower: true },
  sumo: { hp: 80, spd: 0.8, atk: 5, def: 2, money: [35, 55], aggr: 0.5 },
  oyabun: { hp: 110, spd: 1.2, atk: 4, def: 2, money: [70, 100], aggr: 0.9, weapon: 1 },
};
const IT = {
  stone: { melee: 6, thr: 12, tspd: 5.5 },
  bokken: { melee: 12, thr: 10, tspd: 5, reach: 8 },
  barrel: { melee: 10, thr: 20, tspd: 4, heavy: true },
  shuriken: { melee: 4, thr: 9, tspd: 7, vanish: true },
  chair: { melee: 9, thr: 15, tspd: 4.5, breaks: true },
  bucket: { melee: 5, thr: 10, tspd: 5, breaks: true },
  rock: { melee: 12, thr: 24, tspd: 3.2, heavy: true },
};
const SHOP = {
  food: [{ id: 'dango', p: 10 }, { id: 'soba', p: 30 }, { id: 'sushi', p: 80 }],
  weapon: [{ id: 'bokken', p: 40 }, { id: 'shuriken', p: 30 }, { id: 'stone', p: 5 }],
  gear: [{ id: 'band', p: 120 }, { id: 'waraji', p: 100 }, { id: 'kusari', p: 150 }],
};
const ATK = {
  punch: { dur: 10, hit: 4, range: 16, dmg: 5, kb: 1.5 },
  upper: { dur: 14, hit: 6, range: 16, dmg: 8, kb: 2.5, down: true },
  kick: { dur: 14, hit: 7, range: 20, dmg: 7, kb: 2 },
  swing: { dur: 16, hit: 8, range: 22, kb: 2.5 },
  throw: { dur: 10, hit: 4 },
  pick: { dur: 6 },
  land: { dur: 5 },
};
const FREE = new Set(['idle', 'walk', 'run']);

let nextId = 1;
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const scenes = SCENES.map(d => ({ ...d, active: false, ents: [], items: [], fx: [] }));
const players = new Map();

function mkEnt(o) {
  return Object.assign({ id: nextId++, x: 0, z: 30, y: 0, vx: 0, vz: 0, vy: 0, f: 1, t: 0, state: 'idle', hp: 50, mx: 50,
    atk: 0, def: 0, spd: 0, hold: null, ammo: 0, stun: 0, stunT: 0, inv: 0, combo: 0, comboT: 0, hitset: null, hs: 0, cd: 0, scd: 0 }, o);
}
function addItem(S, type, x, z, o) {
  const it = Object.assign({ id: nextId++, type, x, z, y: 0, vx: 0, vy: 0, vz: 0, fly: false, owner: 0, ok: '', atk: 0, value: 0 }, o);
  S.items.push(it); return it;
}
function populate(S) {
  S.ents = []; S.items = [];
  S.npcs.forEach((type, i) => {
    const T = NT[type];
    const n = mkEnt({ kind: 'n', type, x: 110 + i * (S.w - 200) / 4 + rnd(-20, 20), z: rnd(ZMIN + 6, ZMAX - 6), hp: T.hp, mx: T.hp,
      atk: T.atk, def: T.def, cd: rnd(30, 90), think: 0, offz: 0, wait: false });
    if (T.weapon && Math.random() < T.weapon) n.hold = 'bokken';
    S.ents.push(n);
  });
  for (const [type, x, z] of S.items0 || S.itemsDef) addItem(S, type, x, z);
}
scenes.forEach((S, i) => { S.itemsDef = SCENES[i].items; S.items = []; S.build = LAYOUT[i]; S.roofs = LAYOUT[i].map(roofOf).filter(Boolean); });

function fx(S, k, x, z, y) { S.fx.push({ k, x: Math.round(x), z: Math.round(z), y: Math.round(y || 0) }); }

function sceneEnts(S) { const a = []; for (const p of players.values()) if (p.scene === S && p.joined) a.push(p); return a.concat(S.ents); }

function canHit(a, t, S) {
  if (S.peace || t === a) return false;
  if (t.state === 'dead' || t.state === 'down' || t.state === 'getup' || t.state === 'fall' || t.state === 'special' || t.inv > 0) return false;
  if (a.kind === 'n' && t.kind === 'n') return false;
  return true;
}
function dropHold(e, S) {
  if (!e.hold) return;
  if (e.hold !== 'shuriken') addItem(S, e.hold, e.x, e.z, { y: 20, vy: 2, vx: -e.f * 0.8 });
  e.hold = null; e.ammo = 0;
}
function damage(t, a, dmg, kbx, down, S) {
  const d = Math.max(1, Math.round(dmg + (a ? a.atk : 0) - t.def));
  t.hp -= d; t.hs = 90;
  fx(S, 'hit', t.x, t.z, t.y + 16);
  t.stun++; t.stunT = 40;
  if (t.y > (t.fl || 0) + 0.5) down = true;
  if (down || t.hp <= 0 || t.stun >= 4) {
    t.state = 'fall'; t.t = 0; t.vy = 4; t.vx = kbx; t.vz = 0; t.y = Math.max(t.y, 1); t.stun = 0;
    dropHold(t, S);
  } else { t.state = 'hurt'; t.t = 0; t.vx = kbx * 0.6; t.vz = 0; }
  if (t.hp <= 0) { t.hp = 0; fx(S, 'ko', t.x, t.z, 0); }
}
function spinHit(a, S, ents, last) {
  for (const t of ents) {
    if (!canHit(a, t, S)) continue;
    if (Math.abs(t.x - a.x) > 34 || Math.abs(t.z - a.z) > 11 || Math.abs(t.y - a.y) > 26) continue;
    damage(t, a, last ? 14 : 8, Math.sign(t.x - a.x || 1) * (last ? 4 : 1.5), last, S);
  }
}
function startSpecial(e, S) { e.state = 'special'; e.t = 0; e.vy = 5; e.vx = e.vz = 0; e.scd = 300; fx(S, 'special', e.x, e.z, 0); }
function doHit(a, S, ents, range, dmg, kb, down, hitset) {
  let any = false;
  for (const t of ents) {
    if (!canHit(a, t, S) || (hitset && hitset.has(t.id))) continue;
    const dx = (t.x - a.x) * a.f;
    if (dx < -4 || dx > range || Math.abs(t.z - a.z) > 7 || Math.abs(t.y - a.y) > 18) continue;
    if (hitset) hitset.add(t.id);
    damage(t, a, dmg, kb * a.f, down, S); any = true;
  }
  return any;
}
function itemUnder(e, S) {
  if (e.y > 2) return null;
  return S.items.find(it => it.type !== 'coin' && !it.fly && it.y === 0 && Math.abs(it.x - e.x) < 10 && Math.abs(it.z - e.z) < 7);
}
function startThrow(e) { e.state = 'throw'; e.t = 0; e.vx = 0; e.vz = 0; }
function perform(e, S, ents) {
  const A = ATK[e.state];
  switch (e.state) {
    case 'punch': case 'upper': case 'kick':
      if (!doHit(e, S, ents, A.range, A.dmg, A.kb, A.down)) fx(S, 'whiff', e.x, e.z, 0);
      break;
    case 'swing': {
      const I = IT[e.hold] || IT.stone;
      if (!doHit(e, S, ents, A.range + (I.reach || 0), I.melee, A.kb, !!I.heavy)) fx(S, 'whiff', e.x, e.z, 0);
      else if (I.breaks) { fx(S, 'break', e.x + e.f * 14, e.z, 16); e.hold = null; } // 椅子、水桶打中就碎
      break;
    }
    case 'throw': {
      if (!e.hold) break;
      const I = IT[e.hold];
      addItem(S, e.hold, e.x + e.f * 6, e.z, { y: 16, vx: e.f * I.tspd, vy: 1.2, fly: true, owner: e.id, ok: e.kind, atk: e.atk, f: e.f });
      fx(S, 'throw', e.x, e.z, 0);
      if (e.hold === 'shuriken' && --e.ammo > 0) break;
      e.hold = null; e.ammo = 0;
      break;
    }
  }
}
function stepState(e, S, ents) {
  const A = ATK[e.state];
  if (A) {
    e.t++;
    if (e.t === A.hit) perform(e, S, ents);
    if (e.t >= A.dur) { e.state = 'idle'; e.t = 0; }
    return;
  }
  switch (e.state) {
    case 'special': // 必殺「旋風斬」：旋轉升空，三段範圍攻擊，最後一段擊倒
      e.t++; e.f = (e.t >> 2) & 1 ? 1 : -1;
      if (e.t === 6 || e.t === 14 || e.t === 22) spinHit(e, S, ents, e.t === 22);
      if (e.t >= 30) { e.state = 'idle'; e.t = 0; }
      break;
    case 'dashk':
      e.t++; e.vx = e.f * Math.max(0, 3.6 - e.t * 0.15);
      if (e.t >= 3 && e.t <= 14) doHit(e, S, ents, 18, 9, 3, true, e.hitset);
      if (e.t >= 20) { e.state = 'idle'; e.vx = 0; }
      break;
    case 'jatk': if (e.y > (e.fl || 0)) doHit(e, S, ents, 18, 8, 2.5, true, e.hitset); break;
    case 'hurt': if (++e.t >= 12) e.state = 'idle'; break;
    case 'down': if (++e.t >= 36) { e.state = 'getup'; e.t = 0; } break;
    case 'getup': if (++e.t >= 8) { e.state = 'idle'; e.inv = 24; } break;
    case 'dead': e.t++; break;
  }
}
function landed(e) {
  if (e.state === 'jump' || e.state === 'jatk') { e.state = 'land'; e.t = 0; e.vx = e.vz = 0; }
  else if (e.state === 'fall') { e.state = e.hp <= 0 ? 'dead' : 'down'; e.t = 0; e.vx = e.vz = 0; }
}
// 屋簷平台：只在最靠近建築的那一排（z <= ZR）有效，從下方可穿過、落下時站上去
function floorAt(S, e) {
  if (e.z > ZR) return 0;
  let f = 0;
  for (const r of S.roofs) if (e.x >= r.x0 && e.x <= r.x1 && e.y >= r.y - 0.5 && r.y > f) f = r.y;
  return f;
}
function physics(e, S) {
  e.x += e.vx; e.z += e.vz;
  e.x = clamp(e.x, 6, S.w - 6); e.z = clamp(e.z, ZMIN, ZMAX);
  const fl = floorAt(S, e); e.fl = fl;
  if (e.y > fl || e.vy > 0) {
    if (FREE.has(e.state)) { e.state = 'jump'; e.vz = 0; } // 從屋簷走出去就掉下來
    e.vy -= 0.6; e.y += e.vy;
    if (e.y <= fl) { e.y = fl; e.vy = 0; landed(e); }
  } else if (!FREE.has(e.state) && e.state !== 'dashk') { e.vx *= 0.75; e.vz *= 0.75; }
}

// ---------------- 玩家操作 ----------------
function ctlPlayer(p, S, ents) {
  const I = p.in, P = p.prev;
  const pr = k => I[k] && !P[k];
  p.prev = { ...I };
  if (FREE.has(p.state)) {
    const dx = (I.r ? 1 : 0) - (I.l ? 1 : 0), dz = (I.d ? 1 : 0) - (I.u ? 1 : 0);
    const run = I.run && dx !== 0;
    const sp = (run ? 3.0 : 1.5) + p.spd * 0.2, zs = 1.1 + p.spd * 0.1;
    if (dx) p.f = dx;
    if (pr('s') && p.scd <= 0 && !S.peace) { startSpecial(p, S); return; }
    if (pr('j')) { p.state = 'jump'; p.vy = run ? 8.6 : 6.2; p.vx = dx * sp; p.vz = dz * zs; fx(S, 'jump', p.x, p.z, 0); return; }
    if (pr('p')) {
      if (S.peace) {
        const sh = S.shops.find(s => Math.abs(p.x - s.x) < 34);
        if (sh) { send(p, { t: 'shop', id: sh.id }); return; }
      }
      p.vx = p.vz = 0; p.t = 0;
      if (p.hold === 'shuriken') { startThrow(p); return; }
      if (p.hold) { p.state = 'swing'; return; }
      const it = itemUnder(p, S);
      if (it) { S.items.splice(S.items.indexOf(it), 1); p.hold = it.type; p.state = 'pick'; fx(S, 'pick', p.x, p.z, 0); return; }
      p.combo = p.comboT > 0 ? p.combo + 1 : 1; p.comboT = 22;
      if (p.combo >= 3) { p.state = 'upper'; p.combo = 0; } else p.state = 'punch';
      return;
    }
    if (pr('k')) {
      p.t = 0;
      if (p.hold) { startThrow(p); return; }
      if (run) { p.state = 'dashk'; p.hitset = new Set(); return; }
      p.state = 'kick'; p.vx = p.vz = 0; return;
    }
    p.vx = dx * sp; p.vz = dz * zs;
    p.state = dx || dz ? (run ? 'run' : 'walk') : 'idle';
    if (p.x <= 8 && I.l && S.idx > 0) p.goto = [S.idx - 1, scenes[S.idx - 1].w - 18];
    else if (p.x >= S.w - 8 && I.r && S.idx < scenes.length - 1) p.goto = [S.idx + 1, 18];
  } else if (p.state === 'jump' && (pr('p') || pr('k'))) { p.state = 'jatk'; p.hitset = new Set(); }
}
scenes.forEach((S, i) => (S.idx = i));

// ---------------- NPC AI ----------------
function ai(n, S, ents) {
  const T = NT[n.type];
  if (n.cd > 0) n.cd--;
  let tgt = null, bd = 1e9;
  for (const p of ents) if (p.kind === 'p' && p.state !== 'dead') {
    const d = Math.abs(p.x - n.x) + Math.abs(p.z - n.z) * 2; if (d < bd) { bd = d; tgt = p; }
  }
  if (!tgt) { n.state = 'idle'; n.vx = n.vz = 0; return; }
  if (tgt.y > 20 && n.y < 2) { // 目標在屋簷上：忍者跳上去追，其他人在底下等
    const dx = tgt.x - n.x; n.f = dx >= 0 ? 1 : -1;
    if (T.jumper) {
      if (n.z > ZMIN + 2 || Math.abs(dx) > 30) { n.vx = Math.abs(dx) > 20 ? Math.sign(dx) * T.spd : 0; n.vz = n.z > ZMIN + 2 ? -T.spd : 0; n.state = 'walk'; }
      else { n.state = 'jump'; n.vy = 8.6; n.vx = Math.sign(dx) * 1.5; n.vz = 0; }
    } else { const gz = 26 + (n.id % 4) * 8, mz = gz - n.z; n.vx = Math.abs(dx) > 30 ? Math.sign(dx) * T.spd * 0.6 : 0; n.vz = Math.abs(mz) > 2 ? Math.sign(mz) * T.spd * 0.5 : 0; n.state = n.vx || n.vz ? 'walk' : 'idle'; }
    return;
  }
  const dx = tgt.x - n.x, dz = tgt.z - n.z, adx = Math.abs(dx);
  if (n.think > 0) n.think--; else { n.think = 10 + Math.random() * 25; n.offz = rnd(-3, 3); n.wait = Math.random() < 0.18; }
  n.f = dx >= 0 ? 1 : -1;
  if (n.cd <= 0 && Math.abs(dz) < 6 && adx > 45 && adx < 170) {
    if (n.hold && n.hold !== 'bokken' && Math.random() < 0.06) { startThrow(n); n.cd = 50; return; }
    if (T.thrower && !n.hold && Math.random() < 0.025) { n.hold = 'shuriken'; n.ammo = 1; startThrow(n); n.cd = 70; return; }
  }
  if (!n.hold && n.type !== 'sumo') {
    const it = itemUnder(n, S);
    if (it && Math.random() < 0.1) { S.items.splice(S.items.indexOf(it), 1); n.hold = it.type; n.state = 'pick'; n.t = 0; n.vx = n.vz = 0; return; }
  }
  const reach = n.hold ? 24 : 17;
  if (adx < reach + 3 && Math.abs(dz) < 5) {
    if (n.cd <= 0 && Math.random() < T.aggr * 0.2) {
      n.t = 0; n.vx = n.vz = 0;
      if (T.jumper && Math.random() < 0.3) { n.state = 'jatk'; n.vy = 5.5; n.vx = n.f * 1.8; n.hitset = new Set(); }
      else if (n.hold === 'bokken') n.state = 'swing';
      else n.state = Math.random() < 0.55 ? 'punch' : 'kick';
      if (n.type === 'oyabun' && n.scd <= 0 && Math.random() < 0.5) startSpecial(n, S);
      n.cd = 20 + Math.random() * 40 / T.aggr;
      return;
    }
    if (adx > 8) { n.vx = n.vz = 0; n.state = 'idle'; return; }
  }
  if (n.wait) { n.vx = n.vz = 0; n.state = 'idle'; return; }
  const side = n.x < tgt.x ? 1 : -1;
  const gx = tgt.x - side * (reach - 3), gz = tgt.z + n.offz;
  const mx = gx - n.x, mz = gz - n.z;
  n.vx = Math.abs(mx) > 2 ? Math.sign(mx) * T.spd : 0;
  n.vz = Math.abs(mz) > 1.5 ? Math.sign(mz) * T.spd * 0.7 : 0;
  n.state = n.vx || n.vz ? 'walk' : 'idle';
  if (T.jumper && Math.random() < 0.006) { n.state = 'jump'; n.vy = 6; }
}

// ---------------- 物品 ----------------
function updItems(S, ents) {
  for (let i = S.items.length - 1; i >= 0; i--) {
    const it = S.items[i];
    if (it.fly) {
      it.x += it.vx; it.vy -= 0.12; it.y += it.vy;
      const I = IT[it.type];
      let hit = false;
      if (!S.peace) for (const t of ents) {
        if (t.id === it.owner || !canHit({ kind: it.ok }, t, S)) continue;
        if (Math.abs(t.x - it.x) < 9 && Math.abs(t.z - it.z) < 7 && it.y > t.y - 2 && it.y < t.y + 30) {
          damage(t, { atk: it.atk }, I.thr, Math.sign(it.vx) * 2.5, true, S); hit = true; break;
        }
      }
      if (hit || it.y <= 0 || it.x < 2 || it.x > S.w - 2) {
        if ((I.vanish && (hit || it.y <= 0)) || (I.breaks && hit)) { if (I.breaks) fx(S, 'break', it.x, it.z, it.y); S.items.splice(i, 1); continue; }
        it.fly = false; it.vx = hit ? -it.vx * 0.25 : 0; it.vy = hit ? 2 : 0; it.x = clamp(it.x, 4, S.w - 4);
        if (it.y < 0) it.y = 0;
      }
    } else if (it.y > 0 || it.vy > 0) {
      it.vy -= 0.3; it.y += it.vy; it.x = clamp(it.x + it.vx, 4, S.w - 4);
      if (it.y <= 0) { it.y = 0; it.vy = 0; it.vx = 0; }
    }
  }
  for (const p of ents) {
    if (p.kind !== 'p' || p.state === 'dead') continue;
    for (let i = S.items.length - 1; i >= 0; i--) {
      const it = S.items[i];
      if (it.type === 'coin' && it.y === 0 && p.y < 2 && Math.abs(it.x - p.x) < 9 && Math.abs(it.z - p.z) < 7) {
        p.money += it.value; S.items.splice(i, 1); fx(S, 'coin', p.x, p.z, 0);
      }
    }
  }
}
function dropCoins(S, x, z, total) {
  const n = Math.min(5, Math.max(1, Math.ceil(total / 15)));
  let left = total;
  for (let i = 0; i < n; i++) {
    const v = i === n - 1 ? left : Math.floor(total / n); left -= v;
    if (v > 0) addItem(S, 'coin', x, clamp(z + rnd(-4, 4), ZMIN, ZMAX), { value: v, y: 4, vy: rnd(2, 4), vx: rnd(-1.5, 1.5) });
  }
}

// ---------------- 主迴圈 ----------------
function enterScene(p, si, x) {
  const S = scenes[si];
  if (!S.active) { S.active = true; populate(S); }
  p.scene = S; p.x = x; p.y = 0; p.vy = 0; p.vx = p.vz = 0; p.state = 'idle';
  send(p, { t: 'enter', sc: si });
}
function tick() {
  for (const S of scenes) {
    const ents = sceneEnts(S);
    const hasPlayer = ents.some(e => e.kind === 'p');
    if (!hasPlayer) { if (S.active) { S.active = false; S.ents = []; S.items = []; } continue; }
    for (const e of ents) {
      if (e.inv > 0) e.inv--;
      if (e.comboT > 0) e.comboT--;
      if (e.stunT > 0) e.stunT--; else e.stun = 0;
      if (e.hs > 0) e.hs--;
      if (e.scd > 0) e.scd--;
      if (e.kind === 'p') ctlPlayer(e, S, ents); else if (FREE.has(e.state)) ai(e, S, ents);
      stepState(e, S, ents);
      physics(e, S);
    }
    updItems(S, ents);
    for (let i = S.ents.length - 1; i >= 0; i--) {
      const n = S.ents[i];
      if (n.state === 'dead' && n.t >= 40) { const m = NT[n.type].money; dropCoins(S, n.x, n.z, Math.round(rnd(m[0], m[1]))); S.ents.splice(i, 1); }
    }
    for (const p of ents) {
      if (p.kind !== 'p') continue;
      if (p.state === 'dead') {
        if (p.t === 1 && p.money > 1) { const lost = Math.floor(p.money / 2); p.money -= lost; dropCoins(S, p.x, p.z, lost); }
        if (p.t >= 70) { p.hp = p.mx; p.hold = null; p.inv = 60; enterScene(p, START, 384); }
      }
    }
  }
  for (const p of players.values()) if (p.goto) { const [si, x] = p.goto; p.goto = null; enterScene(p, si, x); }
  broadcast();
  for (const S of scenes) S.fx = [];
}
const r1 = v => Math.round(v * 10) / 10;
function packEnt(e) {
  return { i: e.id, k: e.kind === 'p' ? 'p' + e.pal : e.type, x: r1(e.x), z: r1(e.z), y: r1(e.y), f: e.f, s: e.state, t: e.t,
    h: e.hold, hp: e.hp, mx: e.mx, hs: e.hs > 0 ? 1 : 0, nm: e.kind === 'p' ? e.name : undefined, lk: e.lk, iv: e.inv > 0 ? 1 : 0 };
}
function broadcast() {
  const packs = new Map();
  for (const p of players.values()) {
    if (!p.joined) continue;
    const S = p.scene;
    if (!packs.has(S)) packs.set(S, {
      e: sceneEnts(S).map(packEnt),
      it: S.items.map(it => ({ i: it.id, k: it.type, x: r1(it.x), z: r1(it.z), y: r1(it.y), fl: it.fly ? 1 : 0, f: it.f || 1 })),
      fx: S.fx,
    });
    const P = packs.get(S);
    send(p, { t: 's', sc: S.idx, me: p.id, e: P.e, it: P.it, fx: P.fx, n: players.size,
      st: { hp: p.hp, mx: p.mx, m: p.money, a: p.atk, d: p.def, s: p.spd, h: p.hold, am: p.ammo, cd: p.scd } });
  }
}
setInterval(tick, 1000 / 30);

// ---------------- 商店 ----------------
function buy(p, shopId, itemId) {
  const S = p.scene;
  if (!S.peace) return;
  const sh = S.shops.find(s => s.id === shopId);
  if (!sh || Math.abs(p.x - sh.x) > 44) return;
  const it = (SHOP[shopId] || []).find(i => i.id === itemId);
  if (!it) return;
  const msg = m => send(p, { t: 'msg', m });
  if (p.money < it.p) return msg('錢不夠！');
  switch (itemId) {
    case 'dango': p.hp = Math.min(p.mx, p.hp + 25); break;
    case 'soba': p.hp = Math.min(p.mx, p.hp + 70); break;
    case 'sushi': p.mx = Math.min(200, p.mx + 10); p.hp = p.mx; break;
    case 'bokken': case 'stone':
      if (p.hold) return msg('手上已經拿著東西了');
      p.hold = itemId; break;
    case 'shuriken':
      if (p.hold && p.hold !== 'shuriken') return msg('手上已經拿著東西了');
      p.hold = 'shuriken'; p.ammo += 3; break;
    case 'band': if (p.atk >= 10) return msg('攻擊已達上限'); p.atk += 2; break;
    case 'waraji': if (p.spd >= 5) return msg('速度已達上限'); p.spd += 1; break;
    case 'kusari': if (p.def >= 8) return msg('防禦已達上限'); p.def += 2; break;
  }
  p.money -= it.p;
  send(p, { t: 'bought', id: itemId });
}

// ---------------- 連線 ----------------
let palNext = 0;
function onMsg(p, raw) {
  let m; try { m = JSON.parse(raw); } catch { return; }
  if (m.t === 'join' && !p.joined) {
    p.name = String(m.name || '浪士').slice(0, 8) || '浪士';
    // 自選外觀：顏色, 髮型, 鬍子, 髮色, 披風, 斗笠, 刀傷（只收範圍內的整數）
    const L = Array.isArray(m.look) ? m.look : [], MAX = [8, 8, 6, 4, 2, 2, 2];
    const v = MAX.map((mx, i) => { const n = L[i] | 0; return n >= 0 && n < mx ? n : 0; });
    p.pal = v[0]; p.lk = v.slice(1).join(',');
    p.joined = true;
    enterScene(p, START, 384 + rnd(-40, 40));
    p.z = rnd(20, 50);
    send(p, { t: 'welcome', id: p.id, lay: scenes.map(S => ({ b: S.build, roofs: S.roofs })), zr: ZR });
  } else if (m.t === 'in') {
    const b = m.k | 0;
    p.in = { l: !!(b & 1), r: !!(b & 2), u: !!(b & 4), d: !!(b & 8), p: !!(b & 16), k: !!(b & 32), j: !!(b & 64), run: !!(b & 128), s: !!(b & 256) };
  } else if (m.t === 'buy' && p.joined) buy(p, m.s, m.i);
}

function frame(str, op = 1) {
  const pl = Buffer.isBuffer(str) ? str : Buffer.from(str);
  const n = pl.length; let h;
  if (n < 126) h = Buffer.from([0x80 | op, n]);
  else if (n < 65536) { h = Buffer.alloc(4); h[0] = 0x80 | op; h[1] = 126; h.writeUInt16BE(n, 2); }
  else { h = Buffer.alloc(10); h[0] = 0x80 | op; h[1] = 127; h.writeBigUInt64BE(BigInt(n), 2); }
  return Buffer.concat([h, pl]);
}
function send(p, obj) { if (p.sock && !p.sock.destroyed && p.sock.writable) p.sock.write(frame(JSON.stringify(obj))); }

const server = http.createServer((req, res) => {
  let u = decodeURIComponent(req.url.split('?')[0]);
  if (u === '/') u = '/index.html';
  const f = path.join(PUB, path.normalize(u));
  if (!f.startsWith(PUB)) { res.writeHead(403); return res.end(); }
  fs.readFile(f, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});
server.on('upgrade', (req, sock) => {
  const key = req.headers['sec-websocket-key'];
  if (!key || (req.headers.upgrade || '').toLowerCase() !== 'websocket') return sock.destroy();
  const acc = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + acc + '\r\n\r\n');
  sock.setNoDelay(true);
  const p = mkEnt({ kind: 'p', sock, hp: 100, mx: 100, money: 0, in: {}, prev: {}, joined: false, pal: palNext++ % 8, name: '' });
  players.set(p.id, p);
  let buf = Buffer.alloc(0);
  sock.on('data', d => {
    buf = Buffer.concat([buf, d]);
    while (buf.length >= 2) {
      const op = buf[0] & 15, masked = buf[1] & 128;
      let len = buf[1] & 127, off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
      if (len > 65536) return sock.destroy();
      const mk = masked ? 4 : 0;
      if (buf.length < off + mk + len) return;
      let pl = Buffer.from(buf.subarray(off + mk, off + mk + len));
      if (masked) { const m = buf.subarray(off, off + 4); for (let i = 0; i < pl.length; i++) pl[i] ^= m[i & 3]; }
      buf = buf.subarray(off + mk + len);
      if (op === 8) { sock.end(); return; }
      if (op === 9) { sock.write(frame(pl, 10)); continue; }
      if (op === 1) onMsg(p, pl.toString());
    }
  });
  const bye = () => { if (players.has(p.id)) { if (p.joined && p.scene) dropHold(p, p.scene); players.delete(p.id); } };
  sock.on('close', bye); sock.on('error', bye);
});
server.listen(PORT, () => {
  console.log('江戶亂鬥傳 伺服器啟動：http://localhost:' + PORT);
  for (const list of Object.values(os.networkInterfaces())) for (const a of list || [])
    if (a.family === 'IPv4' && !a.internal) console.log('同一個 Wi-Fi 的手機請開：http://' + a.address + ':' + PORT);
});
