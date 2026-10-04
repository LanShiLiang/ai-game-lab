import test from 'node:test';
import assert from 'node:assert/strict';
import '../games/orbit-dash/engine.js';
const { createState, startGame, advance, ORBIT_RADIUS, DURATION } = globalThis.OrbitEngine;

test('开始和重开清空时间、分数、陨石与护盾状态', () => {
  const state = createState(); startGame(state);
  Object.assign(state, { elapsed: 20, score: 350, shields: 1, collected: 3, entities: [{}] });
  startGame(state);
  assert.equal(state.phase, 'running'); assert.equal(state.elapsed, 0);
  assert.equal(state.score, 0); assert.equal(state.shields, 3); assert.equal(state.collected, 0);
  assert.deepEqual(state.entities, []);
});
test('碰撞消耗一格护盾，短暂无敌阻止连续碰撞', () => {
  const state = createState(); startGame(state);
  state.entities = Array.from({ length: 2 }, () => ({ kind: 'rock', angle: state.angle, radius: ORBIT_RADIUS, size: 12, speed: 0 }));
  advance(state, 0.01); assert.equal(state.shields, 2); assert.ok(state.invulnerable > 0);
});
test('收集能量加分并移除实体', () => {
  const state = createState(); startGame(state);
  state.entities = [{ kind: 'energy', angle: state.angle, radius: ORBIT_RADIUS, size: 9, speed: 0 }];
  advance(state, 0.01); assert.equal(state.collected, 1); assert.equal(state.score, 50); assert.equal(state.entities.length, 0);
});
test('护盾归零失败；存活满 45 秒成功', () => {
  const lost = createState(); startGame(lost); lost.shields = 1;
  lost.entities = [{ kind: 'rock', angle: lost.angle, radius: ORBIT_RADIUS, size: 12, speed: 0 }];
  advance(lost, 0.01); assert.equal(lost.phase, 'lost');
  const won = createState(); startGame(won); won.elapsed = DURATION - 0.01;
  advance(won, 0.02); assert.equal(won.phase, 'won'); assert.equal(won.score, 450);
});
test('暂停不推进状态；帧时间限制避免后台恢复跳跃', () => {
  const state = createState(); startGame(state); state.phase = 'paused';
  advance(state, 2, { direction: 1 }); assert.equal(state.elapsed, 0);
  state.phase = 'running'; advance(state, 2, { direction: 1 }); assert.equal(state.elapsed, 0.05);
});
