const { createState, startGame, advance, DURATION, ORBIT_RADIUS, CENTER } = globalThis.OrbitEngine;

const $ = (selector) => document.querySelector(selector);
const canvas = $('#canvas');
const ctx = canvas.getContext('2d');
const state = createState();
const keys = new Set();
const motion = matchMedia('(prefers-reduced-motion: reduce)');
let frame = 0;
let previousTime = 0;
let pointerAngle = null;
let pointerId = null;
let particles = [];
let best = 0;

const stars = Array.from({ length: 44 }, (_, i) => ({
  x: ((i * 127 + 37) % 503) + 4, y: ((i * 193 + 83) % 503) + 4, size: i % 5 === 0 ? 1.7 : 0.8
}));

function fitCanvas() {
  const ratio = Math.min(devicePixelRatio || 1, 2);
  const size = Math.max(1, Math.round(canvas.getBoundingClientRect().width * ratio));
  if (canvas.width !== size) { canvas.width = size; canvas.height = size; }
  draw();
}

function draw() {
  ctx.setTransform(canvas.width / 512, 0, 0, canvas.height / 512, 0, 0);
  ctx.clearRect(0, 0, 512, 512);
  ctx.fillStyle = '#8fa4d4';
  for (const star of stars) { ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2); ctx.fill(); }
  ctx.globalAlpha = 1;
  for (const radius of [66, ORBIT_RADIUS, 199, 247]) {
    ctx.beginPath(); ctx.arc(CENTER, CENTER, radius, 0, Math.PI * 2);
    ctx.strokeStyle = radius === ORBIT_RADIUS ? '#6c8bca' : '#293f6b';
    ctx.lineWidth = radius === ORBIT_RADIUS ? 1.5 : 1;
    ctx.setLineDash(radius === 199 ? [3, 9] : []); ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.fillStyle = '#f4c85f12'; ctx.beginPath(); ctx.arc(CENTER, CENTER, 44, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f4c85f22'; ctx.beginPath(); ctx.arc(CENTER, CENTER, 31, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f4c85f'; ctx.beginPath(); ctx.arc(CENTER, CENTER, 19, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#ffe8aa'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(CENTER, CENTER, 12, -2.6, -0.55); ctx.stroke();
  for (const entity of state.entities) {
    const x = CENTER + Math.cos(entity.angle) * entity.radius;
    const y = CENTER + Math.sin(entity.angle) * entity.radius;
    ctx.save(); ctx.translate(x, y);
    if (entity.kind === 'energy') {
      ctx.rotate(Math.PI / 4); ctx.fillStyle = '#f4c85f'; ctx.fillRect(-6, -6, 12, 12);
      ctx.strokeStyle = '#f4c85f44'; ctx.strokeRect(-11, -11, 22, 22);
    } else {
      ctx.rotate(entity.angle + entity.radius / 85); ctx.fillStyle = '#ff806c'; ctx.beginPath();
      for (let i = 0; i < 7; i++) {
        const angle = i / 7 * Math.PI * 2;
        const radius = entity.size * (i % 2 ? 0.8 : 1);
        if (i === 0) ctx.moveTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
        else ctx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
      }
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#b64b54'; ctx.beginPath(); ctx.arc(-3, -2, 3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
  if (!motion.matches) {
    ctx.beginPath(); ctx.arc(CENTER, CENTER, ORBIT_RADIUS, state.angle - 0.38, state.angle - 0.07);
    ctx.strokeStyle = '#9de2c233'; ctx.lineWidth = 5; ctx.stroke();
  }
  const x = CENTER + Math.cos(state.angle) * ORBIT_RADIUS;
  const y = CENTER + Math.sin(state.angle) * ORBIT_RADIUS;
  ctx.save(); ctx.translate(x, y); ctx.rotate(state.angle + Math.PI);
  ctx.fillStyle = state.invulnerable > 0 ? '#f4c85f' : '#9de2c2';
  ctx.beginPath(); ctx.moveTo(0, -15); ctx.lineTo(10, 9); ctx.lineTo(0, 4); ctx.lineTo(-10, 9); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#101b34'; ctx.beginPath(); ctx.arc(0, -1, 2.5, 0, Math.PI * 2); ctx.fill();
  if (state.invulnerable > 0) { ctx.beginPath(); ctx.arc(0, 0, 23, 0, Math.PI * 2); ctx.strokeStyle = '#f4c85f99'; ctx.lineWidth = 2; ctx.stroke(); }
  ctx.restore();
  for (const particle of particles) {
    ctx.globalAlpha = Math.max(0, particle.life / 0.45); ctx.fillStyle = particle.color;
    ctx.fillRect(particle.x, particle.y, 3, 3);
  }
  ctx.globalAlpha = 1;
}

function updateHud() {
  const score = String(state.score).padStart(3, '0');
  if ($('#score').textContent !== score) $('#score').textContent = score;
  const remaining = String(Math.ceil(DURATION - state.elapsed));
  if ($('#remaining').firstChild.nodeValue !== remaining) $('#remaining').firstChild.nodeValue = remaining;
  const shields = Array.from({ length: 3 }, (_, i) => i < state.shields ? '●' : '○').join(' ');
  if ($('#shields').textContent !== shields) {
    $('#shields').textContent = shields;
    $('#shields').setAttribute('aria-label', `${state.shields} 格护盾`);
    $('#announcement').textContent = `受到撞击，剩余 ${state.shields} 格护盾。`;
  }
}

function syncUI() {
  const running = state.phase === 'running';
  $('#overlay').hidden = running;
  $('#pause-button').disabled = !['running', 'paused'].includes(state.phase);
  $('#pause-button').textContent = state.phase === 'paused' ? '继续' : '暂停';
  if (state.phase === 'ready') return;
  if (state.phase === 'paused') {
    $('#overlay-label').textContent = 'TAKE A BREATH';
    $('#overlay-title').textContent = '轨道已暂停。';
    $('#overlay-description').textContent = '准备好后，继续这趟旅程。';
    $('#start-button').textContent = '继续游戏 ↗';
    $('#start-hint').textContent = '空格也可以继续';
    $('#announcement').textContent = '游戏已暂停。';
  } else if (['won', 'lost'].includes(state.phase)) {
    best = Math.max(best, state.score);
    $('#overlay-label').textContent = state.phase === 'won' ? 'MISSION COMPLETE' : 'ONE MORE ORBIT?';
    $('#overlay-title').textContent = state.phase === 'won' ? '稳稳守住了。' : '轨道失守了。';
    $('#overlay-description').textContent = `本次 ${state.score} 分 · 收集 ${state.collected} 个能量 · 本页最高 ${best} 分`;
    $('#start-button').textContent = '再玩一次 ↗';
    $('#start-hint').textContent = '每次开始，都是一条新的轨道';
    $('#announcement').textContent = `${state.phase === 'won' ? '挑战成功' : '游戏结束'}，得分 ${state.score}。`;
    $('#start-button').focus({ preventScroll: true });
  }
}

function stopLoop() {
  cancelAnimationFrame(frame); frame = 0; previousTime = 0;
  keys.clear(); pointerAngle = null; pointerId = null;
}

function loop(time) {
  if (state.phase !== 'running') return;
  const dt = previousTime ? Math.min((time - previousTime) / 1000, 0.05) : 0;
  previousTime = time;
  const direction = Number(keys.has('ArrowRight') || keys.has('d') || keys.has('touch-right'))
    - Number(keys.has('ArrowLeft') || keys.has('a') || keys.has('touch-left'));
  advance(state, dt, { direction, angle: pointerAngle });
  if (!motion.matches) {
    for (const event of state.events) {
      for (let i = 0; i < 8; i++) {
        const angle = i / 8 * Math.PI * 2;
        particles.push({ x: event.x, y: event.y, vx: Math.cos(angle) * 45, vy: Math.sin(angle) * 45, life: 0.45, color: event.kind === 'hit' ? '#ff806c' : '#f4c85f' });
      }
    }
    particles = particles.filter((item) => { item.life -= dt; item.x += item.vx * dt; item.y += item.vy * dt; return item.life > 0; });
  } else particles = [];
  updateHud(); draw();
  if (state.phase === 'running') frame = requestAnimationFrame(loop);
  else { stopLoop(); syncUI(); }
}

function begin() {
  stopLoop();
  if (state.phase === 'paused') state.phase = 'running';
  else { startGame(state); particles = []; updateHud(); }
  syncUI(); canvas.focus({ preventScroll: true });
  $('#announcement').textContent = '游戏开始，用左右键沿轨道移动。';
  frame = requestAnimationFrame(loop);
}

function pause() {
  if (state.phase !== 'running') return;
  state.phase = 'paused'; stopLoop(); draw(); syncUI();
}

$('#start-button').addEventListener('click', begin);
$('#pause-button').addEventListener('click', () => state.phase === 'paused' ? begin() : pause());
document.addEventListener('keydown', (event) => {
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  if (['ArrowLeft', 'ArrowRight', 'a', 'd'].includes(key)) {
    event.preventDefault(); if (state.phase === 'running') keys.add(key);
  }
  if (event.code === 'Space' && !event.repeat && event.target.tagName !== 'BUTTON') {
    event.preventDefault(); state.phase === 'running' ? pause() : begin();
  }
});
document.addEventListener('keyup', (event) => keys.delete(event.key.length === 1 ? event.key.toLowerCase() : event.key));
window.addEventListener('blur', pause);
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
window.addEventListener('message', (event) => {
  if (event.source === window.parent && event.data?.type === 'ai-game-lab:pause') pause();
});

function drag(event) {
  const rect = canvas.getBoundingClientRect();
  pointerAngle = Math.atan2(event.clientY - rect.top - rect.height / 2, event.clientX - rect.left - rect.width / 2);
}
canvas.addEventListener('pointerdown', (event) => {
  if (state.phase !== 'running' || (event.pointerType === 'mouse' && event.button !== 0)) return;
  pointerId = event.pointerId; canvas.setPointerCapture(pointerId); drag(event); event.preventDefault();
});
canvas.addEventListener('pointermove', (event) => { if (event.pointerId === pointerId) drag(event); });
function releasePointer(event) {
  if (event.pointerId === pointerId) { pointerId = null; pointerAngle = null; }
}
canvas.addEventListener('pointerup', releasePointer);
canvas.addEventListener('pointercancel', releasePointer);
canvas.addEventListener('lostpointercapture', () => { pointerId = null; pointerAngle = null; });
for (const [selector, key] of [['#move-left', 'touch-left'], ['#move-right', 'touch-right']]) {
  const button = $(selector);
  button.addEventListener('pointerdown', (event) => {
    if (state.phase !== 'running') return;
    keys.add(key); button.setPointerCapture(event.pointerId); event.preventDefault();
  });
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(event, () => keys.delete(key));
}
new ResizeObserver(fitCanvas).observe(canvas);
motion.addEventListener('change', () => { particles = []; draw(); });
fitCanvas();
