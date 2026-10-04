(() => {
const DURATION = 45;
const ORBIT_RADIUS = 128;
const CENTER = 256;
const TAU = Math.PI * 2;

function createState() {
  return {
    phase: 'ready', elapsed: 0, score: 0, shields: 3, collected: 0,
    angle: -Math.PI / 2, entities: [], spawnIn: 0.6, energyIn: 2.5,
    invulnerable: 0, events: []
  };
}

function startGame(state) {
  Object.assign(state, createState(), { phase: 'running' });
}

function advance(state, delta, input = {}, random = Math.random) {
  state.events = [];
  if (state.phase !== 'running') return;
  const dt = Math.max(0, Math.min(delta, 0.05));
  state.elapsed = Math.min(DURATION, state.elapsed + dt);
  state.invulnerable = Math.max(0, state.invulnerable - dt);
  if (Number.isFinite(input.angle)) state.angle = input.angle;
  state.angle += (input.direction || 0) * 2.8 * dt;
  state.angle = ((state.angle % TAU) + TAU) % TAU;
  state.spawnIn -= dt;
  state.energyIn -= dt;
  if (state.spawnIn <= 0) {
    state.entities.push({ kind: 'rock', angle: random() * TAU, radius: 330, size: 11 + random() * 5, speed: 76 + state.elapsed * 1.5 });
    state.spawnIn = Math.max(0.28, 0.88 - state.elapsed * 0.012);
  }
  if (state.energyIn <= 0) {
    state.entities.push({ kind: 'energy', angle: random() * TAU, radius: 300, size: 9, speed: 68 });
    state.energyIn = 2.8;
  }
  const playerX = Math.cos(state.angle) * ORBIT_RADIUS;
  const playerY = Math.sin(state.angle) * ORBIT_RADIUS;
  state.entities = state.entities.filter((entity) => {
    entity.radius -= entity.speed * dt;
    const x = Math.cos(entity.angle) * entity.radius;
    const y = Math.sin(entity.angle) * entity.radius;
    const distance = Math.hypot(x - playerX, y - playerY);
    if (distance < entity.size + 11) {
      if (entity.kind === 'energy') {
        state.collected++;
        state.events.push({ kind: 'energy', x: x + CENTER, y: y + CENTER });
        return false;
      }
      if (state.invulnerable <= 0) {
        state.shields--;
        state.invulnerable = 1.1;
        state.events.push({ kind: 'hit', x: x + CENTER, y: y + CENTER });
        return false;
      }
    }
    return entity.radius > 12;
  });
  state.score = Math.floor(state.elapsed * 10) + state.collected * 50;
  if (state.shields <= 0) state.phase = 'lost';
  else if (state.elapsed >= DURATION) state.phase = 'won';
}
globalThis.OrbitEngine = Object.freeze({ DURATION, ORBIT_RADIUS, CENTER, createState, startGame, advance });
})();
