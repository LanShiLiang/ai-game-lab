import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';
import { makeServer } from './serve.mjs';
import { root } from './catalog.mjs';

const captureOnly = process.argv.includes('--capture');
const live = process.argv.includes('--live');
const phase = captureOnly ? 'before' : live ? 'live' : 'after';
const out = path.join(root, 'artifacts/experience-20261007', phase);
await mkdir(out, { recursive: true });
const source = process.argv.includes('--baseline') ? path.join(root, 'artifacts/online-deploy/20261007-170917/app') : root;
const server = live ? null : makeServer(source);
if (server) await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = live ? 'https://lslzqco.cn/ai-game-lab' : `http://127.0.0.1:${server.address().port}`;
const report = { date: new Date().toISOString(), base, checks: [], screenshots: [], errors: [], findings: [], limitations: ['Chrome on this Windows PC; mobile uses browser emulation, not a physical phone.', 'No GitHub Issue or message is submitted.', 'FPS end-of-match regression uses a declared score fixture; movement, mouse aim, firing and reload use real browser input.'] };
const check = (name, detail = true) => { report.checks.push({ name, detail }); console.log('PASS ' + name); };
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();
page.on('pageerror', error => report.errors.push(error.message));
page.on('response', response => { if (response.status() >= 400) report.errors.push(`${response.status()} ${response.url()}`); });
const shot = async name => { await page.screenshot({ path: path.join(out, name + '.png') }); report.screenshots.push(name + '.png'); };
try {
  await page.goto(base); await page.locator('.game-card').last().waitFor(); await shot('hall');
  for (const id of ['orbit-dash', 'apex-rush', 'freight-fire']) {
    await page.goto(`${base}/#/play/${id}`); await page.locator('iframe').waitFor();
    const frame = await (await page.locator('iframe').elementHandle()).contentFrame();
    if (id === 'freight-fire') await frame.locator('#loading').waitFor({ state: 'hidden', timeout: 180000 });
    await frame.locator(id === 'orbit-dash' ? '#start-button' : '#start').waitFor();
    await frame.waitForLoadState('load');
    if (id === 'apex-rush') await frame.waitForFunction(() => document.querySelector('#performance').textContent.includes('FPS'));
    await frame.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await shot(id + '-embedded');
    const stage = await page.locator('#game-stage').evaluate(el => ({ top: el.getBoundingClientRect().top, bottom: el.getBoundingClientRect().bottom, height: innerHeight }));
    if (stage.bottom > stage.height + 1) report.findings.push({ id, issue: 'Embedded game extends below viewport', stage });
    if (!captureOnly) {
      assert.ok(stage.bottom <= stage.height + 1, JSON.stringify(stage));
      const button = await frame.locator(id === 'orbit-dash' ? '#pause-button' : '#start').evaluate(el => ({ top: el.getBoundingClientRect().top, bottom: el.getBoundingClientRect().bottom, height: innerHeight }));
      assert.ok(button.top >= 0 && button.bottom <= button.height, JSON.stringify(button));
      if (id === 'freight-fire') assert.ok(await frame.locator('[data-team="0"]').evaluate(el => el.getBoundingClientRect().bottom <= document.querySelector('#start').getBoundingClientRect().top));
      check(id + ': whole embedded frame and primary controls fit the desktop viewport');
    }
  }
  const mobile = await browser.newContext({ viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true });
  const phone = await mobile.newPage();
  await phone.goto(base + '/games/freight-fire/?qa=1'); await phone.waitForFunction(() => window.__freight?.view, null, { timeout: 180000 });
  await phone.screenshot({ path: path.join(out, 'fps-mobile-menu.png') }); report.screenshots.push('fps-mobile-menu.png');
  await phone.bringToFront(); await phone.locator('#start').tap();
  try { await phone.locator('#move-pad').waitFor({ state: 'visible' }); }
  catch (error) { report.mobileDiagnostic = await phone.evaluate(() => ({ coarse: matchMedia('(pointer: coarse)').matches, focused: document.hasFocus(), paused: __freight.paused, time: __freight.snapshot?.time, status: document.querySelector('#status').textContent })); await phone.screenshot({ path: path.join(out, 'fps-mobile-failure.png') }); throw error; }
  await phone.screenshot({ path: path.join(out, 'fps-mobile-play.png') }); report.screenshots.push('fps-mobile-play.png');
  if (!captureOnly) {
    assert.ok(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    check('FPS mobile layout and touch controls available');
    const move = phone.locator('#move-pad'), rect = await move.boundingBox();
    await phone.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2); await phone.mouse.down(); await phone.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2 - 30);
    await phone.waitForTimeout(300); assert.ok(await phone.evaluate(() => __freight.input.forward > .5)); await phone.mouse.up();
    await phone.waitForTimeout(80); assert.equal(await phone.evaluate(() => __freight.input.forward), 0); check('Mobile move pad drives and releases input');
    await phone.setViewportSize({ width: 780, height: 360 });
    for (const selector of ['#move-pad', '#look-pad', '#touch-fire', '#touch-aim', '#menu-button']) {
      assert.ok(await phone.locator(selector).evaluate(el => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth; }), selector);
    }
    await phone.screenshot({ path: path.join(out, 'fps-mobile-landscape.png') }); report.screenshots.push('fps-mobile-landscape.png');
    check('FPS mobile landscape keeps touch and menu controls inside the screen');
  }
  await mobile.close();
  if (captureOnly) {
    await page.goto(base + '/games/freight-fire/?qa=1'); await page.waitForFunction(() => window.__freight?.view, null, { timeout: 180000 }); await page.locator('#start').click();
    await page.evaluate(() => { __freight.match.score = [40, 12]; __freight.match.status = 'ended'; __freight.match.winner = 0; });
    await page.locator('#result-actions').waitFor({ state: 'visible' }); await page.locator('#result-menu').click(); await shot('fps-ended-menu');
    report.findings.push({ id: 'freight-fire', issue: 'Result menu returns to an ended session with a nonfunctional resume button', resumeVisible: await page.locator('#resume').isVisible(), startVisible: await page.locator('#start').isVisible() });
  } else {
    await page.goto(base + '/games/orbit-dash/'); await page.locator('#start-button').click();
    const angle = await page.evaluate(() => state.angle); await page.keyboard.down('ArrowRight'); await page.waitForTimeout(350); await page.keyboard.up('ArrowRight');
    assert.notEqual(await page.evaluate(() => state.angle), angle); check('Orbit real arrow input moves the ship');
    await page.locator('#pause-button').click(); const time = await page.evaluate(() => state.elapsed); await page.waitForTimeout(250); assert.equal(await page.evaluate(() => state.elapsed), time);
    await page.keyboard.press('Space'); await page.waitForTimeout(100); assert.equal(await page.evaluate(() => state.phase), 'running'); check('Orbit button pause and Space resume preserve progress');
    await page.keyboard.down('KeyD'); await page.waitForFunction(() => ['won', 'lost'].includes(state.phase), null, { timeout: 65000 }); await page.keyboard.up('KeyD'); await shot('orbit-result');
    check('Orbit real-time run reaches an end screen', await page.locator('#overlay-title').innerText()); await page.locator('#start-button').click(); assert.ok(await page.evaluate(() => state.elapsed < 1 && state.shields === 3)); check('Orbit retry resets timer and shields');
    await page.goto(base + '/games/freight-fire/?qa=1'); await page.waitForFunction(() => window.__freight?.view, null, { timeout: 180000 }); await page.locator('#start').click(); await page.waitForFunction(() => !__freight.paused);
    const start = await page.evaluate(() => { const p = __freight.snapshot.players.find(p => p.id === __freight.localId); return { x: p.x, z: p.z }; });
    await page.keyboard.down('KeyW');
    try { await page.waitForFunction(start => { const p = __freight.snapshot.players.find(p => p.id === __freight.localId); return Math.hypot(p.x - start.x, p.z - start.z) > 1; }, start, { timeout: 10000 }); }
    finally { await page.keyboard.up('KeyW'); }
    assert.ok(await page.evaluate(start => { const p = __freight.snapshot.players.find(p => p.id === __freight.localId); return Math.hypot(p.x - start.x, p.z - start.z) > 1; }, start)); check('FPS real W input moves the player');
    const yaw = await page.evaluate(() => __freight.input.yaw); await page.mouse.move(700, 400); await page.mouse.move(820, 390); assert.notEqual(await page.evaluate(() => __freight.input.yaw), yaw); check('FPS mouse input turns the view');
    const ammo = await page.evaluate(() => __freight.snapshot.players.find(p => p.id === __freight.localId).ammo[0]); await page.mouse.down(); await page.waitForTimeout(350); await page.mouse.up();
    assert.ok(await page.evaluate(ammo => __freight.snapshot.players.find(p => p.id === __freight.localId).ammo[0] < ammo, ammo));
    await page.keyboard.press('KeyR'); await page.waitForFunction(() => __freight.snapshot.players.find(p => p.id === __freight.localId).ammo[0] === 30); check('FPS mouse firing and R reload update ammo'); await shot('fps-playing');
    await page.keyboard.press('Escape'); const fpsTime = await page.evaluate(() => __freight.snapshot.time); await page.waitForTimeout(200); assert.equal(await page.evaluate(() => __freight.snapshot.time), fpsTime); await page.locator('#resume').click(); check('FPS pause and resume preserve the local match');
    await page.evaluate(() => { __freight.match.score = [40, 12]; __freight.match.status = 'ended'; __freight.match.winner = 0; });
    await page.locator('#result-actions').waitFor({ state: 'visible' }); await page.locator('#result-menu').click();
    assert.equal(await page.locator('#resume').isVisible(), false); assert.equal(await page.locator('#start').isVisible(), true); await page.locator('#start').click(); await page.waitForFunction(() => __freight.snapshot.status === 'playing' && !__freight.paused); check('FPS results return to a fresh setup and a playable new match');
    assert.deepEqual(report.errors, []); check('No page errors or failed assets');
  }
} catch (error) { report.failure = error.stack; throw error; }
finally { await writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n'); await browser.close(); if (server) await new Promise(resolve => server.close(resolve)); }
