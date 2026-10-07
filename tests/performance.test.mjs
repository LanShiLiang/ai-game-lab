import test from 'node:test';
import assert from 'node:assert/strict';
import { ResolutionBudget as RacingBudget } from '../games/apex-rush/performance.js';
import { ResolutionBudget as FPSBudget } from '../games/freight-fire/performance.js';

for (const [name, Budget] of [['racing', RacingBudget], ['fps', FPSBudget]]) {
  test(`${name}: automatic rendering fits a 4K display within the pixel budget`, () => {
    const budget = new Budget();
    const ratio = budget.ratio(3, 3840, 2160);
    assert.ok(3840 * 2160 * ratio ** 2 <= 2400001);
    assert.ok(budget.ratio(1, 1000, 600) <= 1);
  });
  test(`${name}: sustained slow play reduces resolution; menus and manual quality do not`, () => {
    const budget = new Budget(); const initial = budget.ratio(2, 1000, 600);
    for (let i = 0; i < 160; i++) budget.sample(1 / 30, false);
    assert.equal(budget.ratio(2, 1000, 600), initial);
    for (let i = 0; i < 160; i++) budget.sample(1 / 30, true);
    assert.ok(budget.ratio(2, 1000, 600) < initial);
    const reduced = budget.ratio(2, 1000, 600);
    for (let i = 0; i < 720; i++) budget.sample(1 / 60, true);
    assert.ok(budget.ratio(2, 1000, 600) > reduced);
    budget.setQuality('high');
    for (let i = 0; i < 160; i++) budget.sample(1 / 20, true);
    assert.equal(budget.ratio(2, 1000, 600), 1.7);
  });
}
