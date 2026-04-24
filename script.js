/* =============================================================
   PokéBattle Arena — script.js
   Pure game engine. React reads window.GAME_STATE; game calls rerender().
   ============================================================= */
'use strict';

// ─── HELPERS ────────────────────────────────────────────────────
const delay   = ms => new Promise(r => setTimeout(r, ms));
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const clamp   = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ─── WEB AUDIO ──────────────────────────────────────────────────
const audioCtx = (() => {
  try { return new (window.AudioContext || window.webkitAudioContext)(); }
  catch(e) { return null; }
})();

function playBeep(freq, duration, type = 'square', volume = 0.15) {
  if (!audioCtx) return;
  try {
    const osc  = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    gain.gain.setValueAtTime(volume, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration / 1000);
    osc.start(); osc.stop(audioCtx.currentTime + duration / 1000);
  } catch(e) {}
}

function resumeAudio() {
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
}
document.addEventListener('click', resumeAudio, { once: true });

// Pitch/volume vary by effectiveness
function sfxHit(effectiveness = 1) {
  const freq = effectiveness >= 2 ? 280 : effectiveness <= 0.5 ? 100 : 180;
  const vol  = effectiveness >= 2 ? 0.18 : effectiveness <= 0.5 ? 0.07 : 0.12;
  playBeep(freq, 120, 'square', vol);
}

function sfxCrit() {
  if (!audioCtx) return;
  try {
    const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(500, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.3);
    gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
    osc.start(); osc.stop(audioCtx.currentTime + 0.3);
  } catch(e) {}
}

function sfxFaint() {
  if (!audioCtx) return;
  try {
    const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(400, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(60, audioCtx.currentTime + 0.8);
    gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.8);
    osc.start(); osc.stop(audioCtx.currentTime + 0.8);
  } catch(e) {}
}

async function sfxLevelUp() {
  if (!audioCtx) return;
  for (const freq of [261, 330, 392, 523, 659, 784]) {
    playBeep(freq, 100, 'triangle', 0.15); await delay(100);
  }
}

function sfxMenu()  { playBeep(880, 60, 'square', 0.08); }

function sfxCatch() {
  if (!audioCtx) return;
  [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => playBeep(f, 150, 'triangle', 0.15), i * 120));
}

function sfxSurge() {
  if (!audioCtx) return;
  [300, 500, 700, 900].forEach((f, i) => setTimeout(() => playBeep(f, 80, 'sawtooth', 0.1), i * 60));
}

function sfxCombo() {
  if (!audioCtx) return;
  [400, 600, 800].forEach((f, i) => setTimeout(() => playBeep(f, 100, 'triangle', 0.12), i * 80));
}

function sfxTerrain() {
  if (!audioCtx) return;
  playBeep(200, 300, 'sine', 0.1);
  setTimeout(() => playBeep(400, 300, 'sine', 0.1), 180);
}

function sfxStatus() { playBeep(220, 200, 'triangle', 0.1); }

function startLowHpHeartbeat() {
  if (GS.ui._heartbeatInterval) return;
  GS.ui._heartbeatInterval = setInterval(() => {
    const b = GS.battle;
    if (!b || !b.playerPoke || b.playerPoke.hp > b.playerPoke.maxHp * 0.25) {
      stopLowHpHeartbeat(); return;
    }
    playBeep(80, 120, 'sine', 0.07);
  }, 850);
}

function stopLowHpHeartbeat() {
  if (GS.ui._heartbeatInterval) {
    clearInterval(GS.ui._heartbeatInterval);
    GS.ui._heartbeatInterval = null;
  }
}

// ─── TYPE CHART — full 18 types ─────────────────────────────────
const typeChart = {
  Normal:   { Rock:0.5, Ghost:0, Steel:0.5 },
  Fire:     { Fire:0.5, Water:0.5, Grass:2, Ice:2, Bug:2, Rock:0.5, Dragon:0.5, Steel:2 },
  Water:    { Fire:2, Water:0.5, Grass:0.5, Ground:2, Rock:2, Dragon:0.5 },
  Electric: { Water:2, Electric:0.5, Grass:0.5, Ground:0, Flying:2, Dragon:0.5 },
  Grass:    { Fire:0.5, Water:2, Grass:0.5, Poison:0.5, Ground:2, Flying:0.5, Bug:0.5, Rock:2, Dragon:0.5, Steel:0.5 },
  Ice:      { Fire:0.5, Water:0.5, Grass:2, Ice:0.5, Ground:2, Flying:2, Dragon:2, Steel:0.5 },
  Fighting: { Normal:2, Ice:2, Poison:0.5, Flying:0.5, Psychic:0.5, Bug:0.5, Rock:2, Ghost:0, Dark:2, Steel:2, Fairy:0.5 },
  Poison:   { Grass:2, Poison:0.5, Ground:0.5, Rock:0.5, Ghost:0.5, Steel:0, Fairy:2 },
  Ground:   { Fire:2, Electric:2, Grass:0.5, Poison:2, Flying:0, Bug:0.5, Rock:2, Steel:2 },
  Flying:   { Electric:0.5, Grass:2, Fighting:2, Bug:2, Rock:0.5, Steel:0.5 },
  Psychic:  { Fighting:2, Poison:2, Psychic:0.5, Dark:0, Steel:0.5 },
  Bug:      { Fire:0.5, Grass:2, Fighting:0.5, Flying:0.5, Psychic:2, Ghost:0.5, Dark:2, Steel:0.5, Fairy:0.5 },
  Rock:     { Fire:2, Ice:2, Fighting:0.5, Ground:0.5, Flying:2, Bug:2, Steel:0.5 },
  Ghost:    { Normal:0, Psychic:2, Ghost:2, Dark:0.5 },
  Dragon:   { Dragon:2, Steel:0.5, Fairy:0 },
  Dark:     { Fighting:0.5, Psychic:2, Ghost:2, Dark:0.5, Fairy:0.5 },
  Steel:    { Fire:0.5, Water:0.5, Electric:0.5, Ice:2, Rock:2, Steel:0.5, Fairy:2 },
  Fairy:    { Fire:0.5, Fighting:2, Poison:0.5, Dragon:2, Dark:2, Steel:0.5 },
};

function getTypeMultiplier(atkType, defType, terrain) {
  // Electrified terrain removes Ground's Electric immunity
  if (terrain === 'Electrified' && atkType === 'Electric' && defType === 'Ground') return 1.0;
  if (!typeChart[atkType]) return 1.0;
  const m = typeChart[atkType][defType];
  return m !== undefined ? m : 1.0;
}

// ─── TYPE VISUALS ────────────────────────────────────────────────
window.TYPE_GRADIENTS = {
  Normal:   'linear-gradient(135deg,#9ca3af,#6b7280)',
  Fire:     'linear-gradient(135deg,#ff6b35,#f7931e)',
  Water:    'linear-gradient(135deg,#3b82f6,#06b6d4)',
  Electric: 'linear-gradient(135deg,#facc15,#fde047)',
  Grass:    'linear-gradient(135deg,#22c55e,#84cc16)',
  Ice:      'linear-gradient(135deg,#7dd3fc,#38bdf8)',
  Fighting: 'linear-gradient(135deg,#dc2626,#b91c1c)',
  Poison:   'linear-gradient(135deg,#a855f7,#7c3aed)',
  Ground:   'linear-gradient(135deg,#b45309,#d97706)',
  Flying:   'linear-gradient(135deg,#93c5fd,#818cf8)',
  Psychic:  'linear-gradient(135deg,#ec4899,#a855f7)',
  Bug:      'linear-gradient(135deg,#65a30d,#84cc16)',
  Rock:     'linear-gradient(135deg,#a8a29e,#78716c)',
  Ghost:    'linear-gradient(135deg,#6b21a8,#4c1d95)',
  Dragon:   'linear-gradient(135deg,#4f46e5,#1d4ed8)',
  Dark:     'linear-gradient(135deg,#374151,#1f2937)',
  Steel:    'linear-gradient(135deg,#94a3b8,#64748b)',
  Fairy:    'linear-gradient(135deg,#f9a8d4,#ec4899)',
};

window.TYPE_COLORS = {
  Normal:'#9ca3af', Fire:'#ff6b35', Water:'#3b82f6', Electric:'#eab308',
  Grass:'#22c55e', Ice:'#7dd3fc', Fighting:'#dc2626', Poison:'#a855f7',
  Ground:'#b45309', Flying:'#93c5fd', Psychic:'#ec4899', Bug:'#65a30d',
  Rock:'#a8a29e', Ghost:'#6b21a8', Dragon:'#4f46e5', Dark:'#374151',
  Steel:'#94a3b8', Fairy:'#f9a8d4',
};

// ─── MOVE POOL ──────────────────────────────────────────────────
// category: 'physical' | 'special' | 'status'
// statusEffect: { target:'opp'|'self', status:string, chance:0-100 }
// stageEffect:  { target:'opp'|'self', stat:string,   stages:number }
// drain: fraction of damage healed back to attacker
const MOVES = {
  Tackle:       { name:'Tackle',        type:'Normal',   category:'physical', power:40,  accuracy:100, pp:35, maxPp:35 },
  QuickAttack:  { name:'Quick Attack',  type:'Normal',   category:'physical', power:40,  accuracy:100, pp:30, maxPp:30, priority:1 },
  Scratch:      { name:'Scratch',       type:'Normal',   category:'physical', power:40,  accuracy:100, pp:35, maxPp:35 },
  Ember:        { name:'Ember',         type:'Fire',     category:'special',  power:40,  accuracy:100, pp:25, maxPp:25,
                  statusEffect:{ target:'opp', status:'burn',      chance:10 } },
  Flamethrower: { name:'Flamethrower',  type:'Fire',     category:'special',  power:90,  accuracy:100, pp:10, maxPp:10,
                  statusEffect:{ target:'opp', status:'burn',      chance:10 } },
  WaterGun:     { name:'Water Gun',     type:'Water',    category:'special',  power:40,  accuracy:100, pp:25, maxPp:25 },
  HydroPump:    { name:'Hydro Pump',    type:'Water',    category:'special',  power:110, accuracy:80,  pp:5,  maxPp:5  },
  VineWhip:     { name:'Vine Whip',     type:'Grass',    category:'physical', power:45,  accuracy:100, pp:25, maxPp:25 },
  RazorLeaf:    { name:'Razor Leaf',    type:'Grass',    category:'physical', power:55,  accuracy:95,  pp:25, maxPp:25 },
  ThunderShock: { name:'Thunder Shock', type:'Electric', category:'special',  power:40,  accuracy:100, pp:30, maxPp:30,
                  statusEffect:{ target:'opp', status:'paralysis', chance:10 } },
  Thunderbolt:  { name:'Thunderbolt',   type:'Electric', category:'special',  power:90,  accuracy:100, pp:15, maxPp:15,
                  statusEffect:{ target:'opp', status:'paralysis', chance:10 } },
  ThunderWave:  { name:'Thunder Wave',  type:'Electric', category:'status',   power:0,   accuracy:90,  pp:20, maxPp:20,
                  statusEffect:{ target:'opp', status:'paralysis', chance:100 },
                  desc:'Paralyzes the target, cutting Speed by half.' },
  RockThrow:    { name:'Rock Throw',    type:'Rock',     category:'physical', power:50,  accuracy:90,  pp:15, maxPp:15 },
  RockSlide:    { name:'Rock Slide',    type:'Rock',     category:'physical', power:75,  accuracy:90,  pp:10, maxPp:10 },
  Confusion:    { name:'Confusion',     type:'Psychic',  category:'special',  power:50,  accuracy:100, pp:25, maxPp:25 },
  Psybeam:      { name:'Psybeam',       type:'Psychic',  category:'special',  power:65,  accuracy:100, pp:20, maxPp:20 },
  MudSlap:      { name:'Mud Slap',      type:'Ground',   category:'special',  power:20,  accuracy:100, pp:10, maxPp:10,
                  stageEffect:{ target:'opp', stat:'acc', stages:-1 },
                  desc:"Lowers the opponent's Accuracy by 1." },
  Dig:          { name:'Dig',           type:'Ground',   category:'physical', power:80,  accuracy:100, pp:10, maxPp:10 },
  Growl:        { name:'Growl',         type:'Normal',   category:'status',   power:0,   accuracy:100, pp:40, maxPp:40,
                  stageEffect:{ target:'opp', stat:'atk', stages:-1 },
                  desc:"Lowers the opponent's Attack by 1." },
  Splash:       { name:'Splash',        type:'Normal',   category:'status',   power:0,   accuracy:100, pp:40, maxPp:40,
                  desc:'Nothing happens. Absolutely nothing.' },
  Cut:          { name:'Cut',           type:'Normal',   category:'physical', power:50,  accuracy:95,  pp:30, maxPp:30 },
  Pound:        { name:'Pound',         type:'Normal',   category:'physical', power:40,  accuracy:100, pp:35, maxPp:35 },
  PayDay:       { name:'Pay Day',       type:'Normal',   category:'physical', power:40,  accuracy:100, pp:20, maxPp:20,
                  desc:'Scatters coins. Earn bonus money on hit!' },
  WaterPulse:   { name:'Water Pulse',   type:'Water',    category:'special',  power:60,  accuracy:100, pp:20, maxPp:20 },
  Psyshock:     { name:'Psyshock',      type:'Psychic',  category:'special',  power:80,  accuracy:100, pp:10, maxPp:10 },
  Peck:         { name:'Peck',          type:'Flying',   category:'physical', power:35,  accuracy:100, pp:35, maxPp:35 },
  Gust:         { name:'Gust',          type:'Flying',   category:'special',  power:40,  accuracy:100, pp:35, maxPp:35 },
  FireSpin:     { name:'Fire Spin',     type:'Fire',     category:'special',  power:35,  accuracy:85,  pp:15, maxPp:15 },
  BulletSeed:   { name:'Bullet Seed',   type:'Grass',    category:'physical', power:25,  accuracy:100, pp:30, maxPp:30 },
  Bite:         { name:'Bite',          type:'Dark',     category:'physical', power:60,  accuracy:100, pp:25, maxPp:25 },
  Amnesia:      { name:'Amnesia',       type:'Psychic',  category:'status',   power:0,   accuracy:100, pp:20, maxPp:20,
                  stageEffect:{ target:'self', stat:'spa', stages:2 },
                  desc:'Sharply raises Sp. Atk by 2 stages.' },
  LeechLife:    { name:'Leech Life',    type:'Bug',      category:'physical', power:80,  accuracy:100, pp:10, maxPp:10,
                  drain:0.5, desc:'Drains half the damage dealt to heal self.' },
  WingAttack:   { name:'Wing Attack',   type:'Flying',   category:'physical', power:60,  accuracy:100, pp:35, maxPp:35 },
  NightShade:   { name:'Night Shade',   type:'Ghost',    category:'special',  power:40,  accuracy:90,  pp:15, maxPp:15 },
  Headbutt:     { name:'Headbutt',      type:'Normal',   category:'physical', power:70,  accuracy:100, pp:15, maxPp:15 },
  Sing:         { name:'Sing',          type:'Normal',   category:'status',   power:0,   accuracy:55,  pp:15, maxPp:15,
                  statusEffect:{ target:'opp', status:'sleep', chance:100 },
                  desc:'Puts the opponent to sleep (55% accurate).' },
  BodySlam:     { name:'Body Slam',     type:'Normal',   category:'physical', power:85,  accuracy:100, pp:15, maxPp:15,
                  statusEffect:{ target:'opp', status:'paralysis', chance:30 } },
  Hypnosis:     { name:'Hypnosis',      type:'Psychic',  category:'status',   power:0,   accuracy:60,  pp:20, maxPp:20,
                  statusEffect:{ target:'opp', status:'sleep', chance:100 },
                  desc:'Puts the opponent to sleep (60% accurate).' },
  Surf:         { name:'Surf',          type:'Water',    category:'special',  power:90,  accuracy:100, pp:15, maxPp:15 },
  EarthQuake:   { name:'Earthquake',    type:'Ground',   category:'physical', power:100, accuracy:100, pp:10, maxPp:10 },
  RockBlast:    { name:'Rock Blast',    type:'Rock',     category:'physical', power:25,  accuracy:90,  pp:10, maxPp:10 },
  SandAttack:   { name:'Sand Attack',   type:'Ground',   category:'status',   power:0,   accuracy:100, pp:15, maxPp:15,
                  stageEffect:{ target:'opp', stat:'acc', stages:-1 },
                  desc:"Lowers the opponent's Accuracy by 1 stage." },
  IcePunch:     { name:'Ice Punch',     type:'Ice',      category:'physical', power:75,  accuracy:100, pp:15, maxPp:15,
                  statusEffect:{ target:'opp', status:'freeze', chance:10 } },
  PoisonSting:  { name:'Poison Sting',  type:'Poison',   category:'physical', power:15,  accuracy:100, pp:35, maxPp:35,
                  statusEffect:{ target:'opp', status:'poison', chance:30 } },
  ShadowBall:   { name:'Shadow Ball',   type:'Ghost',    category:'special',  power:80,  accuracy:100, pp:15, maxPp:15 },
  DragonClaw:   { name:'Dragon Claw',   type:'Dragon',   category:'physical', power:80,  accuracy:100, pp:15, maxPp:15 },
  KarateChop:   { name:'Karate Chop',   type:'Fighting', category:'physical', power:50,  accuracy:100, pp:25, maxPp:25 },
  SteelWing:    { name:'Steel Wing',    type:'Steel',    category:'physical', power:70,  accuracy:90,  pp:25, maxPp:25 },
  Moonblast:    { name:'Moonblast',     type:'Fairy',    category:'special',  power:95,  accuracy:100, pp:15, maxPp:15 },
  SwordsDance:  { name:'Swords Dance',  type:'Normal',   category:'status',   power:0,   accuracy:100, pp:20, maxPp:20,
                  stageEffect:{ target:'self', stat:'atk', stages:2 },
                  desc:'Sharply raises Attack by 2 stages.' },
  Harden:       { name:'Harden',        type:'Normal',   category:'status',   power:0,   accuracy:100, pp:30, maxPp:30,
                  stageEffect:{ target:'self', stat:'def', stages:1 },
                  desc:'Raises Defense by 1 stage.' },
  Agility:      { name:'Agility',       type:'Psychic',  category:'status',   power:0,   accuracy:100, pp:30, maxPp:30,
                  stageEffect:{ target:'self', stat:'spe', stages:2 },
                  desc:'Sharply raises Speed by 2 stages.' },
  SunnyDay:     { name:'Sunny Day',     type:'Fire',     category:'status',   power:0,   accuracy:100, pp:5,  maxPp:5,
                  weatherSet:'Sunny',     desc:'Turns the sunlight harsh for 5 turns.' },
  RainDance:    { name:'Rain Dance',    type:'Water',    category:'status',   power:0,   accuracy:100, pp:5,  maxPp:5,
                  weatherSet:'Rain',      desc:'Makes it rain for 5 turns.' },
  Sandstorm:    { name:'Sandstorm',     type:'Rock',     category:'status',   power:0,   accuracy:100, pp:10, maxPp:10,
                  weatherSet:'Sandstorm', desc:'Kicks up a sandstorm for 5 turns.' },
  Hail:         { name:'Hail',          type:'Ice',      category:'status',   power:0,   accuracy:100, pp:10, maxPp:10,
                  weatherSet:'Hail',      desc:'Summons a hailstorm for 5 turns.' },
  Blizzard:     { name:'Blizzard',      type:'Ice',      category:'special',  power:110, accuracy:70,  pp:5,  maxPp:5,
                  statusEffect:{ target:'opp', status:'freeze', chance:10 },
                  desc:'A vicious snowstorm. May freeze.' },
  WillOWisp:    { name:'Will-O-Wisp',   type:'Fire',     category:'status',   power:0,   accuracy:85,  pp:15, maxPp:15,
                  statusEffect:{ target:'opp', status:'burn', chance:100 },
                  desc:'Burns the target with spectral flame.' },
  Toxic:        { name:'Toxic',         type:'Poison',   category:'status',   power:0,   accuracy:90,  pp:10, maxPp:10,
                  statusEffect:{ target:'opp', status:'poison', chance:100 },
                  desc:'Badly poisons the target.' },
  AuroraBeam:   { name:'Aurora Beam',   type:'Ice',      category:'special',  power:65,  accuracy:100, pp:20, maxPp:20,
                  stageEffect:{ target:'opp', stat:'atk', stages:-1 }, desc:"Lowers opponent's Attack." },
  AcidArmor:    { name:'Acid Armor',    type:'Poison',   category:'status',   power:0,   accuracy:100, pp:20, maxPp:20,
                  stageEffect:{ target:'self', stat:'def', stages:2 }, desc:'Sharply raises Defense by 2.' },
  DragonBreath: { name:'DragonBreath',  type:'Dragon',   category:'special',  power:60,  accuracy:100, pp:20, maxPp:20,
                  statusEffect:{ target:'opp', status:'paralysis', chance:30 } },
  Flamethrower2:{ name:'Fire Blast',    type:'Fire',     category:'special',  power:110, accuracy:85,  pp:5,  maxPp:5,
                  statusEffect:{ target:'opp', status:'burn', chance:10 }, desc:'Powerful fire. May burn.' },
};

function cloneMove(m) { return { ...m }; }

// ─── STAT STAGE SYSTEM ──────────────────────────────────────────
const STAGE_MULT = {
  '-6':0.25, '-5':0.2857, '-4':0.3333, '-3':0.4, '-2':0.5, '-1':0.6667,
  '0':1.0,
  '1':1.5, '2':2.0, '3':2.5, '4':3.0, '5':3.5, '6':4.0,
};

function getStatMult(stage) {
  return STAGE_MULT[String(clamp(Math.round(stage), -6, 6))] || 1.0;
}

function emptyStages() {
  return { atk:0, def:0, spa:0, spd:0, spe:0, acc:0, eva:0 };
}

const STAT_DISPLAY = { atk:'Attack', def:'Defense', spa:'Sp. Atk', spd:'Sp. Def', spe:'Speed', acc:'Accuracy', eva:'Evasion' };

function applyStage(stages, stat, amount, pokeName) {
  const prev = stages[stat] || 0;
  const next  = clamp(prev + amount, -6, 6);
  stages[stat] = next;
  if (next === prev) {
    log(`${pokeName}'s ${STAT_DISPLAY[stat] || stat} won't go ${amount > 0 ? 'higher' : 'lower'}!`);
  } else {
    const word = amount >= 2 ? 'sharply rose' : amount === 1 ? 'rose' : amount === -1 ? 'fell' : 'sharply fell';
    log(`${pokeName}'s ${STAT_DISPLAY[stat] || stat} ${word}!`, 'log-stage');
  }
  rerender();
}

// ─── STATUS CONDITIONS ───────────────────────────────────────────
const STATUS_LABELS = { burn:'BRN', poison:'PSN', paralysis:'PAR', sleep:'SLP', freeze:'FRZ' };
const STATUS_COLORS = { burn:'#f97316', poison:'#a855f7', paralysis:'#facc15', sleep:'#94a3b8', freeze:'#7dd3fc' };
window.STATUS_LABELS = STATUS_LABELS;
window.STATUS_COLORS = STATUS_COLORS;

function applyStatus(target, status) {
  if (target.status) return false;
  // Immunities
  if (status === 'burn'     && target.type === 'Fire')     { log(`${target.name} can't be burned!`); return false; }
  if (status === 'freeze'   && target.type === 'Ice')      { log(`${target.name} can't be frozen!`); return false; }
  if (status === 'paralysis'&& target.type === 'Electric') { log(`${target.name} can't be paralyzed!`); return false; }
  if (status === 'poison'   && (target.type === 'Poison' || target.type === 'Steel')) {
    log(`${target.name} can't be poisoned!`); return false;
  }
  target.status = status;
  target.statusTurns = (status === 'sleep') ? randInt(1, 3) : 0;
  const word = { burn:'burned', poison:'poisoned', paralysis:'paralyzed', sleep:'fell asleep', freeze:'frozen solid' }[status];
  log(`${target.name} was ${word}!`, 'log-status');
  sfxStatus();
  // Track unique statuses for achievement
  const t = GS.trainer;
  if (!Array.isArray(t.statusesApplied)) t.statusesApplied = [];
  if (!t.statusesApplied.includes(status)) t.statusesApplied.push(status);
  rerender();
  return true;
}

// Returns true if the Pokémon is prevented from acting this turn.
async function processStatusTurn(poke) {
  if (!poke.status) return false;
  if (poke.status === 'sleep') {
    if (poke.statusTurns > 0) {
      poke.statusTurns--;
      log(`${poke.name} is fast asleep…`, 'log-status');
      rerender(); return true;
    }
    poke.status = null;
    log(`${poke.name} woke up!`, 'log-stage');
    rerender(); return false;
  }
  if (poke.status === 'freeze') {
    if (Math.random() < 0.2) {
      poke.status = null;
      log(`${poke.name} thawed out!`, 'log-stage');
      rerender(); return false;
    }
    log(`${poke.name} is frozen solid!`, 'log-status');
    rerender(); return true;
  }
  if (poke.status === 'paralysis') {
    if (Math.random() < 0.25) {
      log(`${poke.name} is paralyzed! It can't move!`, 'log-status');
      rerender(); return true;
    }
  }
  return false;
}

// End-of-turn burn/poison damage. Returns true if the Pokémon fainted.
async function processEndOfTurnStatus(poke) {
  if (poke.status === 'burn') {
    const dmg = Math.max(1, Math.floor(poke.maxHp / 16));
    poke.hp = Math.max(0, poke.hp - dmg);
    log(`${poke.name} is hurt by its burn! (−${dmg})`, 'log-status');
    rerender();
    return poke.hp === 0;
  }
  if (poke.status === 'poison') {
    const dmg = Math.max(1, Math.floor(poke.maxHp / 8));
    poke.hp = Math.max(0, poke.hp - dmg);
    log(`${poke.name} is hurt by poison! (−${dmg})`, 'log-status');
    rerender();
    return poke.hp === 0;
  }
  return false;
}

// ─── TERRAIN SYSTEM ─────────────────────────────────────────────
const TERRAIN_SEQUENCE = ['Neutral', 'Volcanic', 'Flooded', 'Electrified', 'Grassy'];
const TERRAIN_INFO = {
  Neutral:     { emoji:'⚔️',  desc:'Normal battlefield.',                          color:'#243855' },
  Volcanic:    { emoji:'🌋',  desc:'Fire +40%, Water −30%. Fire may burn on hit.', color:'#7f1d1d' },
  Flooded:     { emoji:'🌊',  desc:'Water +40%, Fire −30%. Electric paralysis!',   color:'#1e3a5f' },
  Electrified: { emoji:'⚡',  desc:'Electric +40%. Ground immunity negated!',      color:'#4a3800' },
  Grassy:      { emoji:'🌿',  desc:'Grass +40%. Both sides heal 5% HP/turn.',      color:'#14532d' },
};
window.TERRAIN_INFO = TERRAIN_INFO;

function getTerrainBoost(moveType, terrain) {
  if (!terrain || terrain === 'Neutral') return 1;
  if (terrain === 'Volcanic')    { if (moveType==='Fire')     return 1.4; if (moveType==='Water')    return 0.7; }
  if (terrain === 'Flooded')     { if (moveType==='Water')    return 1.4; if (moveType==='Fire')     return 0.7; }
  if (terrain === 'Electrified') { if (moveType==='Electric') return 1.4; }
  if (terrain === 'Grassy')      { if (moveType==='Grass')    return 1.4; }
  return 1;
}

// Called after both moves resolve. Returns true if terrain changed.
function advanceTerrain(battle) {
  battle.terrainTurns = (battle.terrainTurns || 0) + 1;
  if (battle.terrainTurns % 3 === 0) {
    const idx  = TERRAIN_SEQUENCE.indexOf(battle.terrain || 'Neutral');
    const next = TERRAIN_SEQUENCE[(idx + 1) % TERRAIN_SEQUENCE.length];
    battle.terrain = next;
    sfxTerrain();
    log(`The terrain shifted to ${next}! ${TERRAIN_INFO[next]?.emoji || ''}`, 'log-terrain');
    // Track terrain for achievement
    if (!Array.isArray(GS.trainer.terrainsExplored)) GS.trainer.terrainsExplored = [];
    if (next !== 'Neutral' && !GS.trainer.terrainsExplored.includes(next)) GS.trainer.terrainsExplored.push(next);
    rerender();
    return true;
  }
  rerender(); // update turn counter in UI
  return false;
}

function applyTerrainSpecialOnHit(battle, move, defender) {
  if (!battle?.terrain || battle.terrain === 'Neutral') return;
  if (battle.terrain === 'Volcanic' && move.type === 'Fire' && !defender.status && Math.random() < 0.1) {
    applyStatus(defender, 'burn');
    log('The volcanic heat spread the burn!', 'log-terrain');
  }
  if (battle.terrain === 'Flooded' && move.type === 'Electric' && !defender.status) {
    applyStatus(defender, 'paralysis');
    log('The flooded terrain conducted the electricity!', 'log-terrain');
  }
}

// ─── WEATHER SYSTEM ─────────────────────────────────────────────
const WEATHER_INFO = {
  None:      { emoji:'☀️',  label:'Clear',      desc:'Normal conditions.',                   color:'transparent' },
  Sunny:     { emoji:'🌞',  label:'Sunny',       desc:'Fire ×2, Water ×0.5.',                color:'rgba(255,200,20,0.13)' },
  Rain:      { emoji:'🌧️', label:'Rain',        desc:'Water ×2, Fire ×0.5.',                color:'rgba(30,80,200,0.18)' },
  Sandstorm: { emoji:'🌪️', label:'Sandstorm',   desc:'1/16 chip to non-Rock/Ground/Steel.', color:'rgba(180,120,20,0.20)' },
  Hail:      { emoji:'❄️',  label:'Hail',        desc:'1/16 chip to non-Ice types.',         color:'rgba(100,200,240,0.15)' },
};
window.WEATHER_INFO = WEATHER_INFO;

function getWeatherBoost(moveType, weather) {
  if (!weather || weather === 'None') return 1;
  if (weather === 'Sunny') { if (moveType==='Fire') return 2; if (moveType==='Water') return 0.5; }
  if (weather === 'Rain')  { if (moveType==='Water') return 2; if (moveType==='Fire') return 0.5; }
  return 1;
}

function setWeather(battle, weather) {
  if (!battle) return;
  battle.weather      = weather;
  battle.weatherTurns = 5;
  const info = WEATHER_INFO[weather] || {};
  log(`${info.emoji} ${info.label} weather started! Lasts 5 turns.`, 'log-terrain');
  // Track weather for achievement
  if (!Array.isArray(GS.trainer.weatherSeen)) GS.trainer.weatherSeen = [];
  if (!GS.trainer.weatherSeen.includes(weather)) GS.trainer.weatherSeen.push(weather);
  rerender();
}

// ─── MOMENTUM METER ─────────────────────────────────────────────
// 0 = full opponent surge | 50 = neutral | 100 = full player surge
function updateMomentum(battle, multiplier, isPlayer) {
  if (!battle) return;
  let delta = 0;
  if      (multiplier >= 2) delta = 15;
  else if (multiplier === 0) delta = -20;
  else if (multiplier < 1)   delta = -10;
  battle.momentum = clamp((battle.momentum ?? 50) + (isPlayer ? delta : -delta), 0, 100);

  const wasPlayerSurge = battle.playerSurge;
  const wasOppSurge    = battle.oppSurge;
  battle.playerSurge = battle.momentum >= 75;
  battle.oppSurge    = battle.momentum <= 25;

  if (battle.playerSurge && !wasPlayerSurge) {
    sfxSurge();
    GS.trainer.surgeCount = (GS.trainer.surgeCount || 0) + 1;
    log('⚡ SURGE! Your momentum is overwhelming! (+25% damage)', 'log-surge');
  } else if (battle.oppSurge && !wasOppSurge) {
    log('💢 Opponent surging! Hold on!', 'log-surge');
  }
  rerender();
}

function getMomentumBoost(battle, isPlayer) {
  if (!battle) return 1;
  if (isPlayer && battle.playerSurge) return 1.25;
  if (!isPlayer && battle.oppSurge)   return 1.25;
  return 1;
}

// ─── COMBO CHAIN SYSTEM ──────────────────────────────────────────
const COMBO_CHAINS = {
  'Water,Electric':    { name:'Thunderstorm', effect:'paralysis', desc:'Paralyzed opponent!' },
  'Electric,Water':    { name:'Thunderstorm', effect:'paralysis', desc:'Paralyzed opponent!' },
  'Fire,Grass':        { name:'Wildfire',     effect:'burn',      desc:'Set opponent ablaze!' },
  'Grass,Fire':        { name:'Wildfire',     effect:'burn',      desc:'Set opponent ablaze!' },
  'Ice,Ground':        { name:'Permafrost',   effect:'spe-2',     desc:"Froze opponent's Speed!" },
  'Ground,Ice':        { name:'Permafrost',   effect:'spe-2',     desc:"Froze opponent's Speed!" },
  'Psychic,Normal':    { name:'Mind Break',   effect:'pierce',    desc:'Next hit pierces resistance!' },
  'Normal,Psychic':    { name:'Mind Break',   effect:'pierce',    desc:'Next hit pierces resistance!' },
  'Rock,Ground':       { name:'Avalanche',    effect:'bonus25',   desc:'+25 bonus on next hit!' },
  'Ground,Rock':       { name:'Avalanche',    effect:'bonus25',   desc:'+25 bonus on next hit!' },
};

function emptyCombo() {
  return { chain:[], meter:0, synergyReady:false, bonusDamage:0, piercePending:false };
}

async function checkAndApplyCombo(battle, moveType) {
  if (!battle.combo) battle.combo = emptyCombo();
  const c = battle.combo;
  c.chain.push(moveType);
  if (c.chain.length > 2) c.chain.shift();
  if (c.chain.length < 2) return;

  const key   = c.chain.join(',');
  const combo = COMBO_CHAINS[key];
  if (!combo) return;

  c.meter = Math.min(3, c.meter + 1);
  sfxCombo();
  log(`✨ ${combo.name}! ${combo.desc}`, 'log-combo');
  // Track unique combos for achievement
  if (!Array.isArray(GS.trainer.combosTriggered)) GS.trainer.combosTriggered = [];
  if (!GS.trainer.combosTriggered.includes(combo.name)) GS.trainer.combosTriggered.push(combo.name);

  const opp      = battle.opponentPoke;
  const oppStages = battle.oppStages || {};
  switch (combo.effect) {
    case 'paralysis': if (!opp.status) applyStatus(opp, 'paralysis'); break;
    case 'burn':      if (!opp.status) applyStatus(opp, 'burn');      break;
    case 'spe-2':     applyStage(oppStages, 'spe', -2, opp.name);     break;
    case 'bonus25':   c.bonusDamage = (c.bonusDamage||0) + 25;         break;
    case 'pierce':    c.piercePending = true;                           break;
  }

  if (c.meter >= 3 && !c.synergyReady) {
    c.synergyReady = true;
    sfxSurge();
    log('🌟 SYNERGY STRIKE ready! Next attack cannot be resisted!', 'log-combo');
  }
  rerender();
}

function consumeSynergy(battle) {
  if (!battle.combo?.synergyReady) return false;
  battle.combo.synergyReady = false;
  battle.combo.meter = 0;
  battle.combo.chain = [];
  log('🌟 SYNERGY STRIKE unleashed!', 'log-combo');
  return true;
}

// ─── DAMAGE FORMULA ─────────────────────────────────────────────
function resolveDamage(attacker, defender, move, atkStages, defStages, terrainBoost, usingSynergy, terrain) {
  atkStages = atkStages || {};
  defStages = defStages || {};

  // Accuracy check (with acc/eva stages)
  const accMult = getStatMult(atkStages.acc||0) / getStatMult(defStages.eva||0);
  if (move.accuracy < 100 && Math.random() * 100 > move.accuracy * accMult) {
    return { damage:0, crit:false, missed:true, multiplier:1 };
  }

  const crit = Math.random() < (1/16);

  let typeMult = getTypeMultiplier(move.type, defender.type, terrain);
  // Synergy: can't be resisted (non-zero immunities stay 0)
  if (usingSynergy && typeMult > 0) typeMult = Math.max(1.0, typeMult);

  const stab  = move.type === attacker.type ? 1.5 : 1.0;
  const isSpc = move.category === 'special';

  const rawAtk = isSpc ? (attacker.spAtk || attacker.attack) : attacker.attack;
  const rawDef = isSpc ? (defender.spDef || defender.defense) : defender.defense;

  const atkStageMult = crit ? Math.max(1, getStatMult(isSpc ? atkStages.spa||0 : atkStages.atk||0))
                             : getStatMult(isSpc ? atkStages.spa||0 : atkStages.atk||0);
  const defStageMult = crit ? Math.min(1, getStatMult(isSpc ? defStages.spd||0 : defStages.def||0))
                             : getStatMult(isSpc ? defStages.spd||0 : defStages.def||0);

  const burnMult = (attacker.status === 'burn' && !isSpc) ? 0.5 : 1;

  let dmg = Math.floor(
    ((2 * attacker.level / 5 + 2) * move.power * (rawAtk * atkStageMult * burnMult) / (rawDef * defStageMult)) / 50
  ) + 2;

  if (crit) dmg = Math.floor(dmg * 1.5);
  dmg = Math.floor(dmg * typeMult);
  dmg = Math.floor(dmg * stab);
  dmg = Math.floor(dmg * (terrainBoost || 1));
  dmg = Math.floor(dmg * (0.85 + Math.random() * 0.15));

  return { damage: Math.max(1, dmg), crit, missed:false, multiplier:typeMult, stab: stab > 1 };
}

// ─── SMART AI ────────────────────────────────────────────────────
// difficulty 0=Easy (random), 1=Normal (type-aware 70%), 2=Hard (optimal)
function pickAIMove(opp, pl, oppStages, battle) {
  const avail = opp.moves.filter(m => m.pp > 0);
  if (!avail.length) return null;
  const diff = GS.trainer.difficulty ?? 1;

  if (diff === 0) return avail[randInt(0, avail.length - 1)];

  const terrain = battle?.terrain || 'Neutral';
  const scored  = avail.map(move => {
    if (move.category === 'status') {
      // Use status moves on fresh opponents at high HP; otherwise deprioritize
      if (!pl.status && pl.hp > pl.maxHp * 0.65) return { move, score: 40 };
      if (!opp.status && opp.hp < opp.maxHp * 0.5 && move.stageEffect?.target === 'self') return { move, score: 35 };
      return { move, score: 5 };
    }
    const tMult  = getTypeMultiplier(move.type, pl.type, terrain);
    if (tMult === 0) return { move, score: 0 }; // don't use immune moves
    const stab   = move.type === opp.type ? 1.5 : 1;
    const tBoost = getTerrainBoost(move.type, terrain);
    const stage  = getStatMult(move.category==='special' ? oppStages.spa||0 : oppStages.atk||0);
    return { move, score: move.power * tMult * stab * tBoost * stage };
  });

  scored.sort((a, b) => b.score - a.score);
  // Hard: always optimal; Normal: 70% optimal, 30% random
  if (diff === 2) return scored[0].move;
  return Math.random() < 0.7 ? scored[0].move : avail[randInt(0, avail.length - 1)];
}

// ─── POKÉMON DATA ────────────────────────────────────────────────
function makePoke(id, name, type, spriteId, moveDefs, hp, atk, def, spd, spa, spDef) {
  return {
    id, name, type,
    level:5, xp:0, xpToNext:100,
    fainted:false,
    status:null, statusTurns:0,
    hp, maxHp:hp,
    attack:atk, defense:def, speed:spd,
    spAtk: spa   || atk,
    spDef: spDef || def,
    baseHp:hp, baseAtk:atk, baseDef:def, baseSpd:spd,
    baseSpAtk: spa   || atk,
    baseSpDef: spDef || def,
    spriteId,
    moves: moveDefs.map(cloneMove),
  };
}

function buildStarterRoster() {
  return [
    makePoke(1,  'Pikachu',    'Electric', 25,  [MOVES.ThunderShock, MOVES.Thunderbolt,  MOVES.QuickAttack, MOVES.ThunderWave],    35, 16, 10, 20, 18, 10),
    makePoke(2,  'Charmander', 'Fire',     4,   [MOVES.Ember,        MOVES.Flamethrower, MOVES.Scratch,     MOVES.FireSpin],       39, 14, 10, 15, 14, 10),
    makePoke(3,  'Squirtle',   'Water',    7,   [MOVES.WaterGun,     MOVES.HydroPump,    MOVES.Tackle,      MOVES.WaterPulse],     44, 11, 14, 11, 13, 14),
    makePoke(4,  'Bulbasaur',  'Grass',    1,   [MOVES.VineWhip,     MOVES.RazorLeaf,    MOVES.Tackle,      MOVES.BulletSeed],     45, 11, 13, 10, 13, 13),
    makePoke(5,  'Geodude',    'Rock',     74,  [MOVES.RockThrow,    MOVES.RockSlide,    MOVES.Harden,      MOVES.MudSlap],        40, 16, 18,  6, 10, 12),
    makePoke(6,  'Abra',       'Psychic',  63,  [MOVES.Confusion,    MOVES.Psybeam,      MOVES.Psyshock,    MOVES.Amnesia],        25, 10,  7, 18, 22,  7),
    makePoke(7,  'Diglett',    'Ground',   50,  [MOVES.Dig,          MOVES.EarthQuake,   MOVES.SandAttack,  MOVES.MudSlap],        10, 14,  7, 20, 10,  7),
    makePoke(8,  'Eevee',      'Normal',   133, [MOVES.Tackle,       MOVES.QuickAttack,  MOVES.Bite,        MOVES.Headbutt],       55, 13, 12, 14, 11, 12),
    makePoke(9,  'Magikarp',   'Water',    129, [MOVES.Splash,       MOVES.Tackle,       MOVES.WaterGun,    MOVES.WaterPulse],     20,  5,  8, 14,  6,  8),
    makePoke(10, 'Jigglypuff', 'Normal',   39,  [MOVES.Sing,         MOVES.Pound,        MOVES.BodySlam,    MOVES.Harden],        115,  9, 10, 10,  9, 10),
    makePoke(11, 'Meowth',     'Normal',   52,  [MOVES.Scratch,      MOVES.PayDay,       MOVES.Bite,        MOVES.SwordsDance],    40, 12, 10, 17, 10, 10),
    makePoke(12, 'Psyduck',    'Water',    54,  [MOVES.WaterGun,     MOVES.Confusion,    MOVES.Surf,        MOVES.Hypnosis],       50, 11, 11, 13, 15, 11),
  ];
}

const WILD_TEMPLATES = [
  { name:'Rattata',   type:'Normal',   spriteId:19,  moveDefs:[MOVES.Tackle, MOVES.QuickAttack, MOVES.Bite],                             hp:30, atk:11, def:8,  spd:16, spa:9,  spDef:8  },
  { name:'Pidgey',    type:'Flying',   spriteId:16,  moveDefs:[MOVES.Gust, MOVES.Peck, MOVES.QuickAttack, MOVES.WingAttack],             hp:40, atk:11, def:10, spd:14, spa:10, spDef:9  },
  { name:'Zubat',     type:'Flying',   spriteId:41,  moveDefs:[MOVES.LeechLife, MOVES.WingAttack, MOVES.Bite],                           hp:40, atk:11, def:9,  spd:14, spa:9,  spDef:9  },
  { name:'Caterpie',  type:'Bug',      spriteId:10,  moveDefs:[MOVES.Tackle, MOVES.Harden],                                              hp:45, atk:9,  def:11, spd:9,  spa:7,  spDef:8  },
  { name:'Machop',    type:'Fighting', spriteId:66,  moveDefs:[MOVES.KarateChop, MOVES.Headbutt, MOVES.Cut],                             hp:70, atk:20, def:14, spd:10, spa:12, spDef:10 },
  { name:'Gastly',    type:'Ghost',    spriteId:92,  moveDefs:[MOVES.NightShade, MOVES.Hypnosis, MOVES.ShadowBall],                      hp:30, atk:10, def:6,  spd:16, spa:20, spDef:6  },
  { name:'Growlithe', type:'Fire',     spriteId:58,  moveDefs:[MOVES.Ember, MOVES.Bite, MOVES.FireSpin],                                 hp:55, atk:16, def:11, spd:14, spa:14, spDef:10 },
  { name:'Poliwag',   type:'Water',    spriteId:60,  moveDefs:[MOVES.WaterGun, MOVES.Surf, MOVES.Tackle],                                hp:40, atk:10, def:9,  spd:16, spa:12, spDef:9  },
  { name:'Oddish',    type:'Grass',    spriteId:43,  moveDefs:[MOVES.VineWhip, MOVES.PoisonSting, MOVES.BulletSeed],                     hp:45, atk:11, def:12, spd:9,  spa:14, spDef:12 },
  { name:'Spearow',   type:'Flying',   spriteId:21,  moveDefs:[MOVES.Peck, MOVES.Gust, MOVES.QuickAttack, MOVES.WingAttack],             hp:40, atk:14, def:9,  spd:16, spa:11, spDef:9  },
  { name:'Bellsprout',type:'Grass',    spriteId:69,  moveDefs:[MOVES.VineWhip, MOVES.PoisonSting, MOVES.SwordsDance],                    hp:50, atk:15, def:6,  spd:9,  spa:15, spDef:6  },
  { name:'Geodude',   type:'Rock',     spriteId:74,  moveDefs:[MOVES.RockThrow, MOVES.Headbutt, MOVES.Harden],                           hp:40, atk:16, def:18, spd:6,  spa:10, spDef:12 },
];

// ─── EVOLUTION TABLE (keyed by spriteId) ────────────────────────
// Stats are game-scale (HP full value, others ÷4 of PokéAPI base stats)
const EVOLUTION_TABLE = {
  1:   { minLevel:16, evolvesTo:[{spriteId:2,   name:'Ivysaur',    type:'Grass',    hp:60,  atk:15, def:16, spd:13, spa:16, spDef:16}] },
  2:   { minLevel:32, evolvesTo:[{spriteId:3,   name:'Venusaur',   type:'Grass',    hp:80,  atk:19, def:20, spd:17, spa:22, spDef:20}] },
  4:   { minLevel:16, evolvesTo:[{spriteId:5,   name:'Charmeleon', type:'Fire',     hp:58,  atk:18, def:12, spd:18, spa:17, spDef:14}] },
  5:   { minLevel:36, evolvesTo:[{spriteId:6,   name:'Charizard',  type:'Fire',     hp:78,  atk:22, def:17, spd:24, spa:22, spDef:18}] },
  7:   { minLevel:16, evolvesTo:[{spriteId:8,   name:'Wartortle',  type:'Water',    hp:59,  atk:15, def:18, spd:14, spa:16, spDef:18}] },
  8:   { minLevel:36, evolvesTo:[{spriteId:9,   name:'Blastoise',  type:'Water',    hp:79,  atk:19, def:22, spd:18, spa:18, spDef:22}] },
  10:  { minLevel:7,  evolvesTo:[{spriteId:11,  name:'Metapod',    type:'Bug',      hp:50,  atk:7,  def:20, spd:7,  spa:7,  spDef:8 }] },
  19:  { minLevel:20, evolvesTo:[{spriteId:20,  name:'Raticate',   type:'Normal',   hp:55,  atk:20, def:14, spd:24, spa:14, spDef:14}] },
  21:  { minLevel:20, evolvesTo:[{spriteId:22,  name:'Fearow',     type:'Flying',   hp:65,  atk:24, def:17, spd:21, spa:17, spDef:17}] },
  25:  { minLevel:22, evolvesTo:[{spriteId:26,  name:'Raichu',     type:'Electric', hp:60,  atk:22, def:14, spd:27, spa:22, spDef:16}] },
  39:  { minLevel:36, evolvesTo:[{spriteId:40,  name:'Wigglytuff', type:'Normal',   hp:140, atk:17, def:14, spd:11, spa:17, spDef:14}] },
  41:  { minLevel:22, evolvesTo:[{spriteId:42,  name:'Golbat',     type:'Flying',   hp:75,  atk:20, def:17, spd:21, spa:20, spDef:20}] },
  43:  { minLevel:21, evolvesTo:[{spriteId:44,  name:'Gloom',      type:'Grass',    hp:60,  atk:17, def:17, spd:11, spa:17, spDef:17}] },
  50:  { minLevel:26, evolvesTo:[{spriteId:51,  name:'Dugtrio',    type:'Ground',   hp:35,  atk:24, def:15, spd:35, spa:16, spDef:15}] },
  52:  { minLevel:28, evolvesTo:[{spriteId:53,  name:'Persian',    type:'Normal',   hp:65,  atk:18, def:14, spd:24, spa:17, spDef:14}] },
  54:  { minLevel:33, evolvesTo:[{spriteId:55,  name:'Golduck',    type:'Water',    hp:80,  atk:20, def:17, spd:20, spa:25, spDef:19}] },
  58:  { minLevel:50, evolvesTo:[{spriteId:59,  name:'Arcanine',   type:'Fire',     hp:90,  atk:28, def:20, spd:27, spa:26, spDef:21}] },
  60:  { minLevel:25, evolvesTo:[{spriteId:61,  name:'Poliwhirl',  type:'Water',    hp:65,  atk:18, def:18, spd:20, spa:16, spDef:17}] },
  63:  { minLevel:16, evolvesTo:[{spriteId:64,  name:'Kadabra',    type:'Psychic',  hp:40,  atk:10, def:8,  spd:24, spa:33, spDef:15}] },
  66:  { minLevel:28, evolvesTo:[{spriteId:67,  name:'Machoke',    type:'Fighting', hp:80,  atk:26, def:20, spd:13, spa:16, spDef:17}] },
  69:  { minLevel:21, evolvesTo:[{spriteId:70,  name:'Weepinbell', type:'Grass',    hp:65,  atk:22, def:9,  spd:13, spa:21, spDef:9 }] },
  74:  { minLevel:25, evolvesTo:[{spriteId:75,  name:'Graveler',   type:'Rock',     hp:55,  atk:24, def:26, spd:9,  spa:16, spDef:17}] },
  92:  { minLevel:25, evolvesTo:[{spriteId:93,  name:'Haunter',    type:'Ghost',    hp:45,  atk:14, def:8,  spd:21, spa:28, spDef:9 }] },
  129: { minLevel:20, evolvesTo:[{spriteId:130, name:'Gyarados',   type:'Water',    hp:95,  atk:33, def:17, spd:20, spa:22, spDef:25}] },
  133: { minLevel:36, evolvesTo:[
    {spriteId:134, name:'Vaporeon', type:'Water',    hp:130, atk:17, def:18, spd:17, spa:28, spDef:26},
    {spriteId:135, name:'Jolteon',  type:'Electric', hp:65,  atk:20, def:14, spd:33, spa:26, spDef:25},
    {spriteId:136, name:'Flareon',  type:'Fire',     hp:65,  atk:33, def:17, spd:17, spa:25, spDef:27},
  ]},
  16:  { minLevel:18, evolvesTo:[{spriteId:17,  name:'Pidgeotto',  type:'Flying',   hp:63,  atk:17, def:15, spd:18, spa:16, spDef:15}] },
};

let wildIdCounter = 1000;

function spawnWildPoke(avgLevel) {
  const tmpl  = WILD_TEMPLATES[randInt(0, WILD_TEMPLATES.length - 1)];
  const level = clamp(avgLevel + randInt(-2, 3), 1, 60);
  const p     = makePoke(wildIdCounter++, tmpl.name, tmpl.type, tmpl.spriteId,
                         tmpl.moveDefs, tmpl.hp, tmpl.atk, tmpl.def, tmpl.spd, tmpl.spa, tmpl.spDef);
  p.level = level;
  scaleStatsByLevel(p);
  return p;
}

function scaleStatsByLevel(p) {
  const s    = p.level / 5;
  p.maxHp    = Math.max(5,  Math.floor(p.baseHp    * s));
  p.hp       = p.maxHp;
  p.attack   = Math.max(3,  Math.floor(p.baseAtk   * s));
  p.defense  = Math.max(3,  Math.floor(p.baseDef   * s));
  p.speed    = Math.max(3,  Math.floor(p.baseSpd   * s));
  p.spAtk    = Math.max(3,  Math.floor(p.baseSpAtk * s));
  p.spDef    = Math.max(3,  Math.floor(p.baseSpDef * s));
  p.xpToNext = p.level * 20;
}

// ─── RANK SYSTEM ────────────────────────────────────────────────
const RANKS = [
  {wins:0, name:'Rookie'}, {wins:5, name:'Trainer'}, {wins:15, name:'Ace'},
  {wins:30, name:'Veteran'}, {wins:50, name:'Champion'},
];
function computeRank(wins) {
  let rank = 'Rookie';
  for (const r of RANKS) { if (wins >= r.wins) rank = r.name; }
  return rank;
}

// ─── GLOBAL GAME STATE ──────────────────────────────────────────
// ─── ACHIEVEMENT DEFINITIONS ────────────────────────────────────
const ACHIEVEMENTS = [
  { id:'first_win',     label:'First Win',        emoji:'🏆', desc:'Win your first battle' },
  { id:'first_catch',   label:'First Catch',       emoji:'🔵', desc:'Catch your first wild Pokémon' },
  { id:'level_10',      label:'Rising Star',       emoji:'⭐', desc:'Reach Lv.10 with any Pokémon' },
  { id:'level_20',      label:'Power Trainer',     emoji:'🌟', desc:'Reach Lv.20 with any Pokémon' },
  { id:'level_30',      label:'Elite Trainer',     emoji:'💫', desc:'Reach Lv.30 with any Pokémon' },
  { id:'first_evo',     label:'First Evolution',   emoji:'🧬', desc:'Trigger a Pokémon evolution' },
  { id:'full_team',     label:'Full Roster',       emoji:'👥', desc:'Have 6+ Pokémon in your roster' },
  { id:'collector',     label:'Collector',         emoji:'📦', desc:'Have 10+ Pokémon in your roster' },
  { id:'streak_5',      label:'Hot Streak',        emoji:'🔥', desc:'Win 5 battles in a row' },
  { id:'streak_10',     label:'Unstoppable',       emoji:'💎', desc:'Win 10 battles in a row' },
  { id:'win_25',        label:'Veteran',           emoji:'🎖️', desc:'Win 25 battles total' },
  { id:'win_50',        label:'Champion',          emoji:'👑', desc:'Win 50 battles total' },
  { id:'rich',          label:'Money Bags',        emoji:'💰', desc:'Accumulate 5000 coins' },
  { id:'status_master', label:'Status Master',     emoji:'☣️', desc:'Apply all 5 status conditions' },
  { id:'perfect',       label:'Untouchable',       emoji:'🛡️', desc:'Win a battle without taking damage' },
  { id:'terrain_all',   label:'Terrain Explorer',  emoji:'🌍', desc:'Experience all 5 terrain types' },
  { id:'surge_10',      label:'Surge Master',      emoji:'⚡', desc:'Activate Surge 10 times' },
  { id:'combo_all',     label:'Combo Legend',      emoji:'✨', desc:'Trigger all 5 combo types' },
  { id:'weather_all',   label:'Weather Watcher',   emoji:'🌈', desc:'Experience all 4 weather types' },
  { id:'magikarp',      label:'Splash! Nothing…',  emoji:'🐟', desc:'Win a battle using only Magikarp' },
];
window.ACHIEVEMENTS = ACHIEVEMENTS;

function checkAchievements() {
  const t  = GS.trainer;
  if (!Array.isArray(t.unlockedAchievements)) t.unlockedAchievements = [];
  const got = id => t.unlockedAchievements.includes(id);
  const unlock = id => {
    if (got(id)) return;
    t.unlockedAchievements.push(id);
    const ach = ACHIEVEMENTS.find(a => a.id === id);
    if (ach) {
      log(`${ach.emoji} Achievement unlocked: ${ach.label}!`, 'log-win');
      showToast(`${ach.emoji} ${ach.label} unlocked!`);
    }
  };
  if (t.wins >= 1)  unlock('first_win');
  if ((t.catches||0) >= 1) unlock('first_catch');
  if (GS.roster.some(p=>p.level>=10))  unlock('level_10');
  if (GS.roster.some(p=>p.level>=20))  unlock('level_20');
  if (GS.roster.some(p=>p.level>=30))  unlock('level_30');
  if ((t.evolutions||0) >= 1)          unlock('first_evo');
  if (GS.roster.length >= 6)           unlock('full_team');
  if (GS.roster.length >= 10)          unlock('collector');
  if ((t.winStreak||0) >= 5)           unlock('streak_5');
  if ((t.winStreak||0) >= 10)          unlock('streak_10');
  if (t.wins >= 25)                    unlock('win_25');
  if (t.wins >= 50)                    unlock('win_50');
  if (t.money >= 5000)                 unlock('rich');
  if ((t.statusesApplied||[]).length >= 5) unlock('status_master');
  if ((t.perfectBattles||0) >= 1)      unlock('perfect');
  if ((t.terrainsExplored||[]).length >= 5) unlock('terrain_all');
  if ((t.surgeCount||0) >= 10)         unlock('surge_10');
  if ((t.combosTriggered||[]).length >= 5)  unlock('combo_all');
  if ((t.weatherSeen||[]).length >= 4)      unlock('weather_all');
}

window.GAME_STATE = {
  trainer: {
    money:500, wins:0, losses:0, rank:'Rookie',
    pokeBalls:5, potions:3, superPotions:1, revives:1,
    difficulty: 1,
    winStreak: 0,
    catches: 0,
    evolutions: 0,
    perfectBattles: 0,
    surgeCount: 0,
    unlockedAchievements: [],
    statusesApplied: [],
    terrainsExplored: [],
    combosTriggered: [],
    weatherSeen: [],
    trainerName: 'Trainer',
    avatar: '🧢',
  },
  roster:  [],
  battle:  null,
  log:     [],
  ui: {
    logLines:          [],
    healCooldown:      false,
    sessionBattles:    0,
    sessionCaught:     0,
    modal:             null,
    toast:             null,
    _toastTimer:       null,
    _heartbeatInterval:null,
    wildBannerText:    null,
    wildBannerVisible: false,
    healingOverlay:    false,
    catchOverlay:      { show:false, text:'', wiggle:false },
    pendingConfirmId:  null,
    pendingEvolution:  null,
    movePanel:         false,
    searchQuery:       '',
    screen:            'main',  // 'main' | 'team-builder' | 'trainer-card'
  },
};

const GS = window.GAME_STATE;

(function initRoster() {
  GS.roster = buildStarterRoster();
  GS.roster.forEach(p => scaleStatsByLevel(p));
})();

// ─── REACT BRIDGE ────────────────────────────────────────────────
window.__rerender = () => {};
function rerender() { window.__rerender(); }

// ─── LOGGING ────────────────────────────────────────────────────
function log(msg, cssClass = '') {
  GS.ui.logLines.push({ msg, cssClass });
  if (GS.ui.logLines.length > 4) GS.ui.logLines.shift();
  GS.log.unshift({ msg, cssClass });
  if (GS.log.length > 200) GS.log.pop();
  rerender();
}

// ─── TOAST ──────────────────────────────────────────────────────
function showToast(msg) {
  clearTimeout(GS.ui._toastTimer);
  GS.ui.toast = msg; rerender();
  GS.ui._toastTimer = setTimeout(() => { GS.ui.toast = null; rerender(); }, 2600);
}

// ─── MODAL CONTROLS ─────────────────────────────────────────────
function openShop()        { sfxMenu(); GS.ui.modal = 'shop';   rerender(); }
function openBag()         { if (!GS.battle?.waitingForInput) return; sfxMenu(); GS.ui.modal = 'bag';    rerender(); }
function openSwitchModal() { if (!GS.battle?.waitingForInput) return; sfxMenu(); GS.ui.modal = 'switch'; rerender(); }
function closeModal()      { GS.ui.modal = null; rerender(); }
function setWaiting(val)   { if (GS.battle) GS.battle.waitingForInput = val; rerender(); }

function openFight() {
  if (!GS.battle?.waitingForInput) return;
  sfxMenu(); GS.ui.movePanel = true; rerender();
}
function closeFight() {
  sfxMenu(); GS.ui.movePanel = false; rerender();
}

// ─── ROSTER HELPERS ─────────────────────────────────────────────
function firstLivePoke() { return GS.roster.find(p => !p.fainted && p.hp > 0) || null; }
function avgTeamLevel()  {
  const active = GS.roster.filter(p => !p.fainted);
  if (!active.length) return 5;
  return Math.round(active.reduce((s, p) => s + p.level, 0) / active.length);
}

// ─── WILD BANNER ────────────────────────────────────────────────
async function showWildBanner(name) {
  GS.ui.wildBannerText    = name;
  GS.ui.wildBannerVisible = true; rerender();
  await delay(1800);
  GS.ui.wildBannerVisible = false; rerender();
  await delay(500);
  GS.ui.wildBannerText    = null; rerender();
}

// ─── RANDOM ENCOUNTER ───────────────────────────────────────────
async function startRandomEncounter() {
  if (GS.battle) return;
  sfxMenu();
  const living = GS.roster.filter(p => !p.fainted && p.hp > 0);
  if (!living.length) { showToast('All Pokémon fainted! Visit the Healing Station.'); return; }
  // Use team builder if roster has 3+ Pokémon; otherwise quick-start
  if (living.length >= 3) { openTeamBuilder(); return; }
  const player = living[0];

  const wild = spawnWildPoke(avgTeamLevel());
  GS.battle = {
    opponentPoke:    wild,
    playerPoke:      player,
    active:          true,
    isWild:          true,
    waitingForInput: false,
    // Twist state
    playerStages:    emptyStages(),
    oppStages:       emptyStages(),
    terrain:         'Neutral',
    terrainTurns:    0,
    weather:         'None',
    weatherTurns:    0,
    momentum:        50,
    playerSurge:     false,
    oppSurge:        false,
    combo:           emptyCombo(),
    // 3v3 party
    playerParty:     [],
    oppParty:        [],
    playerDmgThisBattle: 0,
  };
  GS.ui.sessionBattles++;
  rerender();

  await showWildBanner(wild.name);
  log(`A wild ${wild.name} (Lv.${wild.level}) appeared!`);
  log(`Go! ${player.name}!`);
  setWaiting(true);
}

// ─── UNIFIED MOVE EXECUTOR ───────────────────────────────────────
async function executeMove(attacker, defender, move, atkStages, defStages, isPlayer, battle) {
  const sprId      = isPlayer ? 'player-sprite' : 'opp-sprite';
  const tgtSprId   = isPlayer ? 'opp-sprite'    : 'player-sprite';
  const lungeClass = isPlayer ? 'lunge-right'   : 'lunge-left';
  const spr = document.getElementById(sprId);

  log(`${attacker.name} used ${move.name}!`);

  // Status move branch
  if (move.category === 'status') {
    spr?.classList.add(lungeClass); await delay(200); spr?.classList.remove(lungeClass);
    // Weather-setting moves
    if (move.weatherSet) {
      setWeather(battle, move.weatherSet);
      if (isPlayer) await checkAndApplyCombo(battle, move.type);
      return false;
    }
    // Accuracy
    const accMult = getStatMult(atkStages.acc||0) / getStatMult(defStages.eva||0);
    if (move.accuracy < 100 && Math.random() * 100 > move.accuracy * accMult) {
      log(`${attacker.name}'s ${move.name} missed!`); rerender(); return false;
    }
    // Stage effects
    if (move.stageEffect) {
      const eff = move.stageEffect;
      const affectedStages = eff.target === 'self' ? atkStages : defStages;
      const affectedPoke   = eff.target === 'self' ? attacker  : defender;
      applyStage(affectedStages, eff.stat, eff.stages, affectedPoke.name);
    }
    // Status effects
    if (move.statusEffect) {
      const eff      = move.statusEffect;
      const affected = eff.target === 'opp' ? defender : attacker;
      if (!affected.status) {
        if (Math.random() * 100 < eff.chance) applyStatus(affected, eff.status);
        else if (eff.chance === 100)           log('But it failed!');
      } else {
        log(`${affected.name} is already afflicted!`);
      }
    }
    if (move.name === 'Splash') log('But nothing happened!');
    rerender();
    // Combo chain still applies for status moves that have a type
    if (isPlayer) await checkAndApplyCombo(battle, move.type);
    return false;
  }

  // Damage move
  spr?.classList.add(lungeClass); await delay(260); spr?.classList.remove(lungeClass);

  // Synergy pierce + pending bonuses
  const usingSynergy = isPlayer && battle.combo?.synergyReady;
  if (usingSynergy) consumeSynergy(battle);
  const bonusDmg = isPlayer && battle.combo?.bonusDamage ? battle.combo.bonusDamage : 0;
  if (bonusDmg) battle.combo.bonusDamage = 0;

  const terrainBoost  = getTerrainBoost(move.type, battle.terrain);
  const weatherBoost  = getWeatherBoost(move.type, battle.weather || 'None');
  const momentumBoost = getMomentumBoost(battle, isPlayer);

  const r = resolveDamage(attacker, defender, move, atkStages, defStages,
                          terrainBoost * weatherBoost * momentumBoost, usingSynergy, battle.terrain);

  if (r.missed) {
    log(`${attacker.name}'s attack missed!`); sfxHit(1); rerender(); return false;
  }

  if (r.crit) {
    log('A critical hit!', 'log-crit'); sfxCrit(); shakeArena(); await hitPause();
  }
  sfxHit(r.multiplier);

  const totalDmg = r.damage + bonusDmg;
  if (bonusDmg > 0) spawnDmgNumberAt(`+${bonusDmg}`, '#fbbf24', tgtSprId);
  spawnDmgNumber(totalDmg, r.crit, !isPlayer);

  if (r.multiplier >= 2)    { log("It's super effective!"); if (!r.crit) shakeArena(); }
  else if (r.multiplier===0) log(`It doesn't affect ${defender.name}!`);
  else if (r.multiplier<1)   log("It's not very effective…");
  if (r.stab) log(`STAB! (${attacker.type})`, 'log-stage');
  if (usingSynergy) log('🌟 Synergy pierced the defense!', 'log-combo');

  flashSprite(tgtSprId);
  defender.hp = Math.max(0, defender.hp - totalDmg);
  // Track damage taken by player for perfect-battle achievement
  if (!isPlayer && battle) battle.playerDmgThisBattle = (battle.playerDmgThisBattle || 0) + totalDmg;

  // Drain (LeechLife etc.)
  if (move.drain) {
    const heal = Math.floor(totalDmg * move.drain);
    attacker.hp = Math.min(attacker.maxHp, attacker.hp + heal);
    spawnDmgNumberAt(`+${heal}`, '#22c55e', sprId);
  }

  // Pay Day bonus coins
  if (move.name === 'Pay Day') {
    const bonus = attacker.level * 2;
    GS.trainer.money += bonus;
    log(`Coins scattered! +${bonus} 💰`, 'log-win');
  }

  updateMomentum(battle, r.multiplier, isPlayer);

  // Secondary status/stage effects from physical/special moves
  if (move.statusEffect?.target === 'opp' && !defender.status && defender.hp > 0) {
    if (Math.random() * 100 < move.statusEffect.chance) applyStatus(defender, move.statusEffect.status);
  }
  if (move.stageEffect && !move.stageEffect.target.includes('self')) {
    const eff = move.stageEffect;
    if (defender.hp > 0) applyStage(defStages, eff.stat, eff.stages, defender.name);
  }

  applyTerrainSpecialOnHit(battle, move, defender);

  // Combo tracking (player only, after faint check would be too late)
  const fainted = await checkFaint(defender, attacker, isPlayer);
  if (!fainted && isPlayer) await checkAndApplyCombo(battle, move.type);

  rerender();

  // Low-HP heartbeat check
  if (GS.battle?.playerPoke) {
    const ratio = GS.battle.playerPoke.hp / GS.battle.playerPoke.maxHp;
    if (ratio < 0.25) startLowHpHeartbeat(); else stopLowHpHeartbeat();
  }

  return fainted;
}

// ─── PLAYER ATTACKS ─────────────────────────────────────────────
async function playerAttack(moveIdx) {
  const b = GS.battle;
  if (!b || !b.waitingForInput) return;
  const pl  = b.playerPoke;
  const opp = b.opponentPoke;
  const move = pl.moves[moveIdx];
  if (!move || move.pp <= 0) return;

  closeFight(); setWaiting(false); sfxMenu(); move.pp--;

  // Pre-pick AI move so it "decides" simultaneously
  const aiMove = pickAIMove(opp, pl, b.oppStages, b);

  // Turn order: priority first, then speed (with paralysis halving speed)
  const plSpe  = pl.speed  * getStatMult(b.playerStages.spe||0) * (pl.status==='paralysis'?0.5:1);
  const oppSpe = opp.speed * getStatMult(b.oppStages.spe||0)    * (opp.status==='paralysis'?0.5:1);
  const plPrio = move.priority  || 0;
  const aiPrio = aiMove?.priority || 0;
  const playerFirst = plPrio > aiPrio || (plPrio === aiPrio && plSpe >= oppSpe);

  let battleEnded = false;

  if (playerFirst) {
    // Player status check
    const skippedPl = await processStatusTurn(pl);
    if (!skippedPl) {
      battleEnded = await executeMove(pl, opp, move, b.playerStages, b.oppStages, true, b);
    }
    if (!battleEnded && GS.battle) {
      await delay(500);
      if (aiMove) {
        const skippedOpp = await processStatusTurn(opp);
        if (!skippedOpp) {
          battleEnded = await executeMove(opp, pl, aiMove, b.oppStages, b.playerStages, false, b);
        }
      }
    }
  } else {
    if (aiMove) {
      const skippedOpp = await processStatusTurn(opp);
      if (!skippedOpp) {
        battleEnded = await executeMove(opp, pl, aiMove, b.oppStages, b.playerStages, false, b);
      }
    }
    if (!battleEnded && GS.battle && pl.hp > 0 && !pl.fainted) {
      await delay(500);
      const skippedPl = await processStatusTurn(pl);
      if (!skippedPl) {
        battleEnded = await executeMove(pl, opp, move, b.playerStages, b.oppStages, true, b);
      }
    }
  }

  if (!battleEnded && GS.battle) {
    // AI party switching: switch out if a better matchup exists in party
    tryAIPartySwitch(GS.battle);
    await processEndOfTurnEffects(GS.battle);
    if (GS.battle) setWaiting(true);
  }
}

function tryAIPartySwitch(battle) {
  if (!battle) return;
  const oppParty = battle.oppParty || [];
  if (!oppParty.length) return;
  const opp = battle.opponentPoke;
  const pl  = battle.playerPoke;
  // Switch if current opp is weak (HP < 30%) and a better matchup exists
  const oppHpRatio = opp.hp / opp.maxHp;
  if (oppHpRatio > 0.3) return;
  // Find a party member with a type advantage
  const betterIdx = oppParty.findIndex(p => {
    const mult = typeChart[p.type] ? (typeChart[p.type][pl.type] || 1) : 1;
    return mult >= 1.5 && p.hp > 0;
  });
  const switchIdx = betterIdx >= 0 ? betterIdx : (oppParty.some(p => p.hp > 0) ? oppParty.findIndex(p => p.hp > 0) : -1);
  if (switchIdx < 0) return;
  const incoming = oppParty.splice(switchIdx, 1)[0];
  oppParty.push(opp); // send current opp to back
  battle.opponentPoke = incoming;
  battle.oppStages    = emptyStages();
  log(`Opponent switched to ${incoming.name}!`);
  rerender();
}

async function processEndOfTurnEffects(battle) {
  if (!battle?.active) return;
  const pl  = battle.playerPoke;
  const opp = battle.opponentPoke;

  // Grassy terrain healing
  if (battle.terrain === 'Grassy') {
    const healPl  = Math.max(1, Math.floor(pl.maxHp  * 0.05));
    const healOpp = Math.max(1, Math.floor(opp.maxHp * 0.05));
    pl.hp  = Math.min(pl.maxHp,  pl.hp  + healPl);
    opp.hp = Math.min(opp.maxHp, opp.hp + healOpp);
    log('The grassy terrain restored HP!', 'log-terrain');
    rerender();
  }

  // Burn / poison tick — player
  if (pl.hp > 0 && !pl.fainted) {
    const fainted = await processEndOfTurnStatus(pl);
    if (fainted) { await checkFaint(pl, opp, false); return; }
  }
  // Burn / poison tick — opponent
  if (opp.hp > 0 && !opp.fainted) {
    const fainted = await processEndOfTurnStatus(opp);
    if (fainted) { await checkFaint(opp, pl, true); return; }
  }

  // Weather chip damage + turn countdown
  if (battle.weather && battle.weather !== 'None') {
    battle.weatherTurns = (battle.weatherTurns || 0) - 1;
    if (battle.weatherTurns <= 0) {
      log('The weather cleared.', 'log-terrain');
      battle.weather = 'None'; battle.weatherTurns = 0;
      rerender();
    } else {
      const IMMUNE_SAND = ['Rock','Ground','Steel'];
      for (const poke of [pl, opp]) {
        if (poke.hp <= 0 || poke.fainted) continue;
        let chip = 0;
        if (battle.weather === 'Sandstorm' && !IMMUNE_SAND.includes(poke.type))
          chip = Math.max(1, Math.floor(poke.maxHp / 16));
        if (battle.weather === 'Hail' && poke.type !== 'Ice')
          chip = Math.max(1, Math.floor(poke.maxHp / 16));
        if (chip > 0) {
          poke.hp = Math.max(0, poke.hp - chip);
          const emoji = battle.weather === 'Sandstorm' ? '🌪️' : '❄️';
          log(`${emoji} ${poke.name} is buffeted by the ${battle.weather.toLowerCase()}! (−${chip})`, 'log-terrain');
          rerender();
        }
      }
      // Faint checks after weather chip
      if (pl.hp  <= 0) { await checkFaint(pl,  opp, false); return; }
      if (opp.hp <= 0) { await checkFaint(opp, pl,  true);  return; }
    }
  }

  // Advance terrain counter
  advanceTerrain(battle);
}

// ─── FAINT & BATTLE END ──────────────────────────────────────────
async function checkFaint(victim, other, victimIsOpponent) {
  if (victim.hp > 0) return false;
  victim.fainted = true; victim.hp = 0;
  sfxFaint();
  const sprId = victimIsOpponent ? 'opp-sprite' : 'player-sprite';
  const el = document.getElementById(sprId);
  el?.classList.add('faint-slide');
  await delay(700);
  el?.classList.remove('faint-slide');
  log(`${victim.name} fainted!`);

  if (victimIsOpponent) {
    const xpGain = victim.level * 8;
    log(`${other.name} earned ${xpGain} XP!`, 'log-level');
    await gainXP(other, xpGain);
    // 3v3: try to send out next opp party member
    const oppParty = GS.battle?.oppParty || [];
    if (oppParty.length > 0) {
      const nextOpp = oppParty.shift();
      GS.battle.opponentPoke = nextOpp;
      GS.battle.oppStages    = emptyStages();
      log(`Opponent sent out ${nextOpp.name} (Lv.${nextOpp.level})!`);
      rerender(); setWaiting(true); return false;
    }
    await endBattle(true);
    return true;
  } else {
    // 3v3: try party array first, then fall back to full roster
    const playerParty = GS.battle?.playerParty || [];
    let next = playerParty.length > 0 ? playerParty.shift() : null;
    if (!next) next = GS.roster.find(p => !p.fainted && p.hp > 0 && p.id !== victim.id);
    if (!next) { log('All your Pokémon have fainted!', 'log-lose'); await endBattle(false); return true; }
    log(`${victim.name} can't fight! Go, ${next.name}!`);
    GS.battle.playerPoke    = next;
    GS.battle.playerStages  = emptyStages();
    rerender(); setWaiting(true); return false;
  }
}

async function gainXP(poke, amount) {
  poke.xp += amount;
  while (poke.xp >= poke.xpToNext) {
    poke.xp -= poke.xpToNext;
    poke.level++;
    poke.maxHp   += Math.max(2, Math.floor(poke.baseHp    * 0.08));
    poke.hp       = poke.maxHp;
    poke.attack  += Math.max(1, Math.floor(poke.baseAtk   * 0.06));
    poke.defense += Math.max(1, Math.floor(poke.baseDef   * 0.06));
    poke.speed   += Math.max(1, Math.floor(poke.baseSpd   * 0.06));
    poke.spAtk   += Math.max(1, Math.floor(poke.baseSpAtk * 0.06));
    poke.spDef   += Math.max(1, Math.floor(poke.baseSpDef * 0.06));
    poke.xpToNext = poke.level * 20;
    log(`${poke.name} grew to Level ${poke.level}!`, 'log-level');
    const spr = document.getElementById('player-sprite');
    if (spr) { spr.classList.add('level-up-flash'); setTimeout(() => spr.classList.remove('level-up-flash'), 1200); }
    await sfxLevelUp(); rerender();
    await checkEvolution(poke);
  }
  rerender();
}

// ─── EVOLUTION ───────────────────────────────────────────────────
async function checkEvolution(poke) {
  const evo = EVOLUTION_TABLE[poke.spriteId];
  if (!evo || poke.level < evo.minLevel) return;
  if (poke._evolvedThisSession) return; // prevent double-trigger mid-battle
  if (evo.evolvesTo.length === 1) {
    await triggerEvolution(poke, evo.evolvesTo[0]);
  } else {
    // Multi-evolution (e.g. Eevee) — show choice UI and wait
    GS.ui.pendingEvolution = { poke, choices: evo.evolvesTo };
    rerender();
    // The player picks via chooseEvolution(); we pause here with a polling wait
    await new Promise(resolve => {
      const poll = setInterval(() => {
        if (!GS.ui.pendingEvolution) { clearInterval(poll); resolve(); }
      }, 200);
    });
  }
}

async function triggerEvolution(poke, evoChoice) {
  poke._evolvedThisSession = true;
  log(`✨ What?! ${poke.name} is evolving!`, 'log-level');
  // Animate the player sprite if it's visible
  const sprEl = document.getElementById('player-sprite');
  if (sprEl) {
    sprEl.classList.add('evolving-anim');
    await delay(2600);
    sprEl.classList.remove('evolving-anim');
  } else {
    await delay(800);
  }
  // Update Pokémon data
  const prevName    = poke.name;
  const hpFrac      = poke.maxHp > 0 ? poke.hp / poke.maxHp : 1;
  poke.name         = evoChoice.name;
  poke.type         = evoChoice.type;
  poke.spriteId     = evoChoice.spriteId;
  poke.baseHp       = evoChoice.hp;
  poke.baseAtk      = evoChoice.atk;
  poke.baseDef      = evoChoice.def;
  poke.baseSpd      = evoChoice.spd;
  poke.baseSpAtk    = evoChoice.spa;
  poke.baseSpDef    = evoChoice.spDef;
  const s = poke.level / 5;
  poke.maxHp   = Math.max(5, Math.floor(poke.baseHp    * s));
  poke.hp      = Math.max(1, Math.floor(poke.maxHp * hpFrac));
  poke.attack  = Math.max(3, Math.floor(poke.baseAtk   * s));
  poke.defense = Math.max(3, Math.floor(poke.baseDef   * s));
  poke.speed   = Math.max(3, Math.floor(poke.baseSpd   * s));
  poke.spAtk   = Math.max(3, Math.floor(poke.baseSpAtk * s));
  poke.spDef   = Math.max(3, Math.floor(poke.baseSpDef * s));
  GS.trainer.evolutions = (GS.trainer.evolutions || 0) + 1;
  log(`🎉 ${prevName} evolved into ${poke.name}!`, 'log-level');
  [600, 800, 1050].forEach((f, i) => setTimeout(() => playBeep(f, 180, 'triangle', 0.18), i * 200));
  rerender();
}

async function chooseEvolution(evoChoice) {
  const pending = GS.ui.pendingEvolution;
  if (!pending) return;
  GS.ui.pendingEvolution = null;
  rerender();
  await triggerEvolution(pending.poke, evoChoice);
}

async function endBattle(playerWon) {
  stopLowHpHeartbeat();
  const b = GS.battle;
  if (playerWon) {
    GS.trainer.wins++;
    GS.trainer.winStreak = (GS.trainer.winStreak || 0) + 1;
    GS.trainer.rank = computeRank(GS.trainer.wins);
    const coins = randInt(20, 80);
    GS.trainer.money += coins;
    log(`You won! 🏆 +${coins} coins`, 'log-win');
    // Perfect battle: player took 0 damage
    if (b && (b.playerDmgThisBattle || 0) === 0) {
      GS.trainer.perfectBattles = (GS.trainer.perfectBattles || 0) + 1;
    }
    // Track terrain for achievement
    if (b && b.terrain && b.terrain !== 'Neutral') {
      const t = GS.trainer;
      if (!Array.isArray(t.terrainsExplored)) t.terrainsExplored = [];
      if (!t.terrainsExplored.includes(b.terrain)) t.terrainsExplored.push(b.terrain);
    }
  } else {
    GS.trainer.losses++;
    GS.trainer.winStreak = 0;
    GS.trainer.money = Math.max(0, GS.trainer.money - 50);
    log('You lost… 💸 −50 coins', 'log-lose');
  }
  checkAchievements();
  GS.battle = null;
  GS.ui.movePanel = false;
  rerender(); autosave();
}

// ─── BAG / ITEMS ────────────────────────────────────────────────
async function useItem(item) {
  const b  = GS.battle;
  const pl = b.playerPoke;
  const t  = GS.trainer;
  closeModal();

  if (item === 'potion') {
    if (t.potions <= 0) return;
    t.potions--;
    const healed = Math.min(50, pl.maxHp - pl.hp);
    pl.hp = Math.min(pl.maxHp, pl.hp + 50);
    log(`Used Potion on ${pl.name}! +${healed} HP`, 'log-win');
    spawnDmgNumberAt(`+${healed}`, '#22c55e', 'player-sprite');
    sfxMenu(); rerender(); setWaiting(false);
    await delay(600);
    const aiMove = pickAIMove(b.opponentPoke, pl, b.oppStages, b);
    if (aiMove && !await executeMove(b.opponentPoke, pl, aiMove, b.oppStages, b.playerStages, false, b) && pl.hp > 0)
      setWaiting(true);

  } else if (item === 'superPotion') {
    if (t.superPotions <= 0) return;
    t.superPotions--;
    const healed = pl.maxHp - pl.hp;
    pl.hp = pl.maxHp;
    log(`Used Super Potion on ${pl.name}! Full heal!`, 'log-win');
    spawnDmgNumberAt(`+${healed}`, '#22c55e', 'player-sprite');
    sfxMenu(); rerender(); setWaiting(false);
    await delay(600);
    const aiMove = pickAIMove(b.opponentPoke, pl, b.oppStages, b);
    if (aiMove && !await executeMove(b.opponentPoke, pl, aiMove, b.oppStages, b.playerStages, false, b) && pl.hp > 0)
      setWaiting(true);

  } else if (item === 'revive') {
    const fainted = GS.roster.find(p => p.fainted);
    if (!fainted || t.revives <= 0) { log('No fainted Pokémon to revive!'); setWaiting(true); return; }
    t.revives--;
    fainted.fainted = false; fainted.hp = Math.floor(fainted.maxHp / 2);
    log(`${fainted.name} was revived!`, 'log-level');
    sfxMenu(); rerender(); setWaiting(false);
    await delay(600);
    const aiMove = pickAIMove(b.opponentPoke, pl, b.oppStages, b);
    if (aiMove && !await executeMove(b.opponentPoke, pl, aiMove, b.oppStages, b.playerStages, false, b) && pl.hp > 0)
      setWaiting(true);

  } else if (item === 'pokeball') {
    if (!b.isWild) { log("Can't catch a trainer's Pokémon!"); setWaiting(true); return; }
    if (t.pokeBalls <= 0) { log('No Poké Balls left!'); setWaiting(true); return; }
    t.pokeBalls--;
    await attemptCatch(b.opponentPoke, pl);
  }
}

// ─── CATCH ──────────────────────────────────────────────────────
async function attemptCatch(opp, pl) {
  let rate = (1 - opp.hp / opp.maxHp) * 0.7 + 0.1;
  rate    *= (opp.level < pl.level) ? 1.2 : 0.8;
  rate     = clamp(rate, 0.05, 0.95);

  GS.ui.catchOverlay = { show:true, text:'', wiggle:false }; rerender();
  await delay(900);
  GS.ui.catchOverlay.wiggle = true; rerender();
  await delay(1200);
  GS.ui.catchOverlay.wiggle = false; rerender();
  await delay(300);

  if (Math.random() < rate) {
    GS.ui.catchOverlay.text = `Gotcha! ${opp.name} was caught!`; rerender();
    sfxCatch();
    log(`Gotcha! ${opp.name} was caught!`, 'log-catch');
    opp.fainted = false; opp.hp = opp.maxHp; opp.status = null;
    opp.id = GS.roster.length > 0 ? Math.max(...GS.roster.map(p => p.id)) + 1 : 100;
    GS.roster.push(opp);
    GS.ui.sessionCaught++;
    GS.trainer.catches = (GS.trainer.catches || 0) + 1;
    GS.trainer.wins++;
    GS.trainer.rank = computeRank(GS.trainer.wins);
    await delay(2000);
    GS.ui.catchOverlay = { show:false, text:'', wiggle:false };
    GS.battle = null; rerender(); autosave();
  } else {
    GS.ui.catchOverlay.text = `${opp.name} broke free!`; rerender();
    sfxHit(1);
    log(`${opp.name} broke free!`);
    await delay(1800);
    GS.ui.catchOverlay = { show:false, text:'', wiggle:false }; rerender();
    setWaiting(false); await delay(400);
    const b = GS.battle;
    if (b && opp.hp > 0 && pl.hp > 0) {
      const aiMove = pickAIMove(opp, pl, b.oppStages, b);
      if (aiMove && !await executeMove(opp, pl, aiMove, b.oppStages, b.playerStages, false, b))
        setWaiting(true);
    }
  }
}

// ─── SWITCH ─────────────────────────────────────────────────────
async function doSwitch(pokeId) {
  closeModal();
  const poke = GS.roster.find(p => p.id === pokeId);
  if (!poke || poke.fainted || !GS.battle) return;
  sfxMenu();
  log(`Go, ${poke.name}!`);
  GS.battle.playerPoke = poke;
  // Reset player stages on switch (Pokémon stages reset)
  GS.battle.playerStages = emptyStages();
  rerender(); setWaiting(false); await delay(600);
  const b = GS.battle;
  const aiMove = pickAIMove(b.opponentPoke, poke, b.oppStages, b);
  if (aiMove && !await executeMove(b.opponentPoke, poke, aiMove, b.oppStages, b.playerStages, false, b))
    setWaiting(true);
}

// ─── RUN ────────────────────────────────────────────────────────
async function attemptRun() {
  if (!GS.battle?.waitingForInput) return;
  sfxMenu();
  const b = GS.battle;
  if (!b.isWild) { log("Can't run from a trainer battle!"); return; }
  if (Math.random() < 0.75) {
    log('Got away safely!');
    stopLowHpHeartbeat();
    GS.battle = null; GS.ui.movePanel = false; rerender();
  } else {
    log("Can't escape!"); setWaiting(false); await delay(600);
    const aiMove = pickAIMove(b.opponentPoke, b.playerPoke, b.oppStages, b);
    if (aiMove && !await executeMove(b.opponentPoke, b.playerPoke, aiMove, b.oppStages, b.playerStages, false, b))
      setWaiting(true);
  }
}

// ─── SEND TO BATTLE ─────────────────────────────────────────────
function sendToBattle() {
  const q    = (GS.ui.searchQuery || '').toLowerCase().trim();
  const poke = GS.roster.find(p => p.name.toLowerCase().includes(q) && !p.fainted);
  if (!poke) { showToast('No matching healthy Pokémon found!'); return; }
  if (GS.battle) { if (GS.battle.waitingForInput) doSwitch(poke.id); return; }
  showToast(`${poke.name} is your lead Pokémon!`);
}

// ─── HEALING STATION ────────────────────────────────────────────
async function healingStation() {
  if (GS.ui.healCooldown) { showToast('Healing station is recharging…'); return; }
  sfxMenu();
  GS.ui.healingOverlay = true; rerender();
  playBeep(523, 600, 'sine', 0.12);
  await delay(2000);
  GS.ui.healingOverlay = false;
  GS.roster.forEach(p => {
    p.fainted = false; p.hp = p.maxHp; p.status = null;
    p.moves.forEach(m => { m.pp = m.maxPp; });
  });
  log('All Pokémon fully healed! 💊', 'log-win');
  showToast('All Pokémon fully healed!');
  rerender();
  GS.ui.healCooldown = true;
  setTimeout(() => { GS.ui.healCooldown = false; }, 30000);
}

// ─── SHOP ────────────────────────────────────────────────────────
function buyItem(key, price) {
  if (GS.trainer.money < price) return;
  GS.trainer.money -= price; GS.trainer[key]++;
  sfxMenu(); showToast('Purchased!'); rerender();
}

// ─── GLOBAL TRAINING ────────────────────────────────────────────
async function globalTrain() {
  sfxMenu(); log('Global training session!', 'log-level');
  for (const p of GS.roster) { if (!p.fainted) await gainXP(p, p.level * 5); }
  showToast('Training complete!'); rerender();
}

// ─── RELEASE ────────────────────────────────────────────────────
function confirmRelease(id) {
  sfxMenu();
  if (GS.roster.length <= 1) { showToast("Can't release your last Pokémon!"); return; }
  GS.ui.pendingConfirmId = id; GS.ui.modal = 'confirm'; rerender();
}
function doRelease() {
  const id   = GS.ui.pendingConfirmId;
  const poke = GS.roster.find(p => p.id === id);
  if (!poke) { closeModal(); return; }
  GS.roster = GS.roster.filter(p => p.id !== id);
  if (GS.battle?.playerPoke?.id === id) { GS.battle = null; GS.ui.movePanel = false; }
  log(`${poke.name} was released into the wild.`);
  showToast(`${poke.name} released!`);
  closeModal(); rerender();
}

// ─── SCREEN NAVIGATION ──────────────────────────────────────────
function openTrainerCard() { sfxMenu(); GS.ui.screen = 'trainer-card'; rerender(); }
function closeTrainerCard() { GS.ui.screen = 'main'; rerender(); }
function setTrainerName(name) { GS.trainer.trainerName = name || 'Trainer'; rerender(); }
function setAvatar(a) { GS.trainer.avatar = a; rerender(); }

// ─── 3v3 TEAM BUILDER ───────────────────────────────────────────
function openTeamBuilder() {
  if (GS.battle) return;
  sfxMenu();
  const living = GS.roster.filter(p => !p.fainted && p.hp > 0);
  if (!living.length) { showToast('All Pokémon fainted! Visit the Healing Station.'); return; }
  GS.ui.teamBuilderSelected = [];
  GS.ui.modal = 'team-builder';
  rerender();
}

function toggleTeamSelect(pokeId) {
  const sel = GS.ui.teamBuilderSelected || [];
  const idx = sel.indexOf(pokeId);
  if (idx >= 0) {
    sel.splice(idx, 1);
  } else {
    if (sel.length >= 3) { showToast('Select exactly 3 Pokémon'); return; }
    sel.push(pokeId);
  }
  GS.ui.teamBuilderSelected = sel;
  rerender();
}

async function confirmTeam() {
  const sel = GS.ui.teamBuilderSelected || [];
  if (sel.length < 1) { showToast('Select at least 1 Pokémon!'); return; }
  const party = sel.map(id => GS.roster.find(p => p.id === id)).filter(Boolean);
  closeModal();
  await startBattleWithParty(party);
}

async function startBattleWithParty(party) {
  sfxMenu();
  const player = party[0];
  const avgLvl = Math.round(party.reduce((s, p) => s + p.level, 0) / party.length);
  // Generate AI party of same size (max 3)
  const partySize = Math.min(party.length, 3);
  const oppParty  = Array.from({ length: partySize }, () => spawnWildPoke(avgLvl));

  GS.battle = {
    opponentPoke:    oppParty[0],
    playerPoke:      player,
    active:          true,
    isWild:          true,
    waitingForInput: false,
    playerStages:    emptyStages(),
    oppStages:       emptyStages(),
    terrain:         'Neutral',
    terrainTurns:    0,
    weather:         'None',
    weatherTurns:    0,
    momentum:        50,
    playerSurge:     false,
    oppSurge:        false,
    combo:           emptyCombo(),
    playerParty:     party.slice(1),          // remaining (already used lead is index 0)
    oppParty:        oppParty.slice(1),
    playerDmgThisBattle: 0,
  };
  GS.ui.sessionBattles++;
  rerender();
  await showWildBanner(oppParty[0].name);
  log(`A wild ${oppParty[0].name} (Lv.${oppParty[0].level}) appeared!`);
  log(`Go! ${player.name}! (${partySize}v${partySize})`);
  setWaiting(true);
}

// ─── DIFFICULTY ─────────────────────────────────────────────────
function setDifficulty(val) {
  GS.trainer.difficulty = Number(val);
  const labels = ['Easy', 'Normal', 'Hard'];
  showToast(`Difficulty: ${labels[GS.trainer.difficulty]}`);
  rerender();
}

// ─── ANIMATIONS ─────────────────────────────────────────────────
function shakeArena() {
  const el = document.getElementById('battle-arena');
  el?.classList.add('shake');
  setTimeout(() => el?.classList.remove('shake'), 300);
}

function flashSprite(spriteId) {
  const el = document.getElementById(spriteId);
  if (!el) return;
  el.classList.add('flash-white');
  setTimeout(() => el.classList.remove('flash-white'), 150);
}

async function hitPause() {
  const arena = document.getElementById('battle-arena');
  if (arena) {
    arena.style.transition = 'none';
    arena.style.filter = 'brightness(2.5)';
    await delay(80);
    arena.style.filter = '';
    arena.style.transition = '';
  }
}

function spawnDmgNumber(value, isCrit, isPlayerHit) {
  spawnDmgNumberAt(value > 0 ? `-${value}` : `+${Math.abs(value)}`,
                   isCrit ? '#facc15' : '#ef4444',
                   isPlayerHit ? 'player-sprite' : 'opp-sprite');
}

function spawnDmgNumberAt(text, color, spriteId) {
  const sprite = document.getElementById(spriteId);
  if (!sprite) return;
  const rect = sprite.getBoundingClientRect();
  const el   = document.createElement('div');
  el.className   = 'dmg-float';
  el.textContent = text;
  el.style.color = color;
  el.style.left  = `${rect.left + rect.width / 2 + randInt(-18, 18)}px`;
  el.style.top   = `${rect.top  + randInt(0, 24)}px`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1000);
}

// ─── SAVE / LOAD ────────────────────────────────────────────────
const SAVE_KEY = 'pokebattle_react_v2';

function save() {
  sfxMenu();
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      trainer: GS.trainer,
      roster:  GS.roster,
      log:     GS.log.slice(0, 50),
    }));
    showToast('Game saved! 💾');
  } catch(e) { showToast('Save failed — storage full?'); }
}

function autosave() { save(); }

function load() {
  sfxMenu();
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) { showToast('No save file found!'); return; }
    const data  = JSON.parse(raw);
    GS.trainer  = data.trainer;
    // Ensure all new fields exist after loading older saves
    GS.trainer.difficulty          = GS.trainer.difficulty          ?? 1;
    GS.trainer.winStreak           = GS.trainer.winStreak           ?? 0;
    GS.trainer.catches             = GS.trainer.catches             ?? 0;
    GS.trainer.evolutions          = GS.trainer.evolutions          ?? 0;
    GS.trainer.perfectBattles      = GS.trainer.perfectBattles      ?? 0;
    GS.trainer.surgeCount          = GS.trainer.surgeCount          ?? 0;
    GS.trainer.unlockedAchievements= GS.trainer.unlockedAchievements?? [];
    GS.trainer.statusesApplied     = GS.trainer.statusesApplied     ?? [];
    GS.trainer.terrainsExplored    = GS.trainer.terrainsExplored    ?? [];
    GS.trainer.combosTriggered     = GS.trainer.combosTriggered     ?? [];
    GS.trainer.weatherSeen         = GS.trainer.weatherSeen         ?? [];
    GS.trainer.trainerName         = GS.trainer.trainerName         ?? 'Trainer';
    GS.trainer.avatar              = GS.trainer.avatar              ?? '🧢';
    GS.roster   = data.roster.map(p => ({
      spAtk: p.attack, spDef: p.defense, baseSpAtk: p.baseAtk, baseSpDef: p.baseDef,
      status: null, statusTurns: 0,
      ...p,
    }));
    GS.battle      = null;
    GS.ui.movePanel= false;
    if (data.log) { GS.log = data.log; GS.ui.logLines = []; }
    showToast('Game loaded! 📂'); rerender();
  } catch(e) { showToast('Load failed — save may be corrupted.'); }
}
