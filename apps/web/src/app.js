import {gameEntryURL, gameSandbox, isLabMessage, validateGameRegistration} from '../../../packages/game-contracts/host.js';
const $ = (selector) => document.querySelector(selector);
const home = $('#home-view');
const player = $('#player-view');
let catalog = [];
let category = '全部';
let iframe = null;
let gameSession = null, readyTimer = 0;
function postToGame(type) { if (iframe?.dataset.origin) iframe.contentWindow?.postMessage({ type, session: gameSession }, iframe.dataset.bridged==='true'?iframe.dataset.origin:'*'); }
let catalogReady = false;
const cards = new Map();
let searchFrame = 0, submissionLoaded = false;
const stage = $('#game-stage');
let layoutFrame = 0;
function fitPlayer() {
  cancelAnimationFrame(layoutFrame);
  layoutFrame = requestAnimationFrame(() => {
    if (player.hidden || document.fullscreenElement || document.body.classList.contains('game-expanded')) return;
    const top = stage.getBoundingClientRect().top + scrollY;
    stage.style.setProperty('--player-height', `${Math.max(280, Math.min(820, innerHeight - top - 16))}px`);
  });
}
function syncDisplay() {
  const full = Boolean(document.fullscreenElement), expanded = document.body.classList.contains('game-expanded');
  $('#fullscreen-game').textContent = full ? '退出全屏' : '全屏游戏 ⛶';
  $('#fullscreen-game').setAttribute('aria-pressed', String(full));
  $('#expand-game').textContent = expanded ? '恢复内嵌' : '铺满窗口';
  $('#expand-game').setAttribute('aria-pressed', String(expanded));
  $('#exit-expanded').hidden = !full && !expanded;
  fitPlayer();
}
function resetDisplay() {
  document.body.classList.remove('game-expanded');
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  syncDisplay();
}

function el(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

function renderGames() {
  const query = $('#game-search').value.trim().toLocaleLowerCase();
  const matches = catalog.filter((game) => (category === '全部' || category === game.category)
    && game.searchText.includes(query));
  const grid = $('#game-grid');
  const fragment = document.createDocumentFragment();
  for (const game of matches) {
    if (cards.has(game.id)) { fragment.append(cards.get(game.id)); continue; }
    const link = el('a', 'game-card');
    link.href = `#/play/${game.id}`;
    link.style.setProperty('--card-accent', game.accent);
    const cover = el('div', 'card-cover');
    const img = el('img');
    img.src = game.cover;
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.width = 640;
    img.height = 480;
    cover.append(img, el('span', 'card-category', game.category), el('span', 'card-play', '↗'));
    const body = el('div', 'card-body');
    const titleRow = el('div', 'card-title-row');
    titleRow.append(el('h3', '', game.title), el('span', 'micro', game.subtitle || 'JS GAME'));
    const tags = el('div', 'tags');
    for (const item of game.controls) tags.append(el('span', 'tag', item));
    body.append(titleRow, el('p', '', game.description), tags);
    link.append(cover, body);
    cards.set(game.id, link);
    fragment.append(link);
  }
  grid.replaceChildren(fragment);
  $('#empty-state').hidden = matches.length > 0;
  $('#game-count').textContent = `${catalog.length} 个可玩实验`;
  $('#catalog-status').textContent = `显示 ${matches.length} 个游戏`;
  for (const button of $('#filters').children) button.setAttribute('aria-pressed', String(button.textContent === category));
}

function clearGame() {
  clearTimeout(readyTimer); readyTimer = 0; gameSession = null;
  if (iframe) { iframe.src = 'about:blank'; iframe.remove(); iframe = null; }
  $('#game-mount').replaceChildren();
}

function mountGame(game) {
  clearGame();
  $('#player-status').textContent = '正在打开游戏…';
  iframe = el('iframe', 'game-frame');
  iframe.title = `${game.title}游戏画面`;
  iframe.setAttribute('sandbox', gameSandbox(game));
  iframe.setAttribute('allow', 'fullscreen; autoplay; gamepad');
  iframe.setAttribute('allowfullscreen', '');
  iframe.setAttribute('referrerpolicy', 'no-referrer');
  gameSession = crypto.randomUUID();
  const session = gameSession, entry = gameEntryURL(game, location.href, session);
  entry.searchParams.set('labSession', session);
  iframe.dataset.game = game.id;
  iframe.dataset.origin = entry.origin;
  iframe.src = entry.href;
  const bridged = game.integration?.protocol === 1;
  iframe.dataset.bridged=String(bridged);
  if (bridged) readyTimer = setTimeout(() => { if (gameSession === session) $('#player-status').textContent = '加载较久，请查看游戏内进度或点击重新加载。'; }, 45000);
  const mounted = iframe;
  iframe.addEventListener('load', () => {
    if (iframe !== mounted) return;
    if (!bridged) $('#player-status').textContent = '点击游戏画面即可操作。';
  }, { once: true });
  $('#game-mount').append(iframe);
}

function route() {
  if (parent !== window) { clearGame(); home.hidden = false; player.hidden = true; return; }
  if (!catalogReady) return;
  const routePath = location.hash.replace(/^#/, '') || '/';
  if (routePath.startsWith('/play/')) {
    const id = routePath.slice(6);
    const game = catalog.find((item) => item.id === id);
    home.hidden = true;
    player.hidden = false;
    $('#reload-game').hidden = !game;
    for (const id of ['standalone-game', 'expand-game', 'fullscreen-game']) $('#'+id).hidden = !game;
    if (!game) {
      clearGame();
      resetDisplay();
      $('#player-title').textContent = '没有找到这个游戏';
      $('#player-description').textContent = '游戏可能已更名，请返回大厅选择。';
      $('#player-controls').replaceChildren();
      $('#player-category').textContent = 'GAME NOT FOUND';
      $('#player-status').textContent = '';
    } else {
      $('#player-title').textContent = game.title;
      const standalone=new URL(game.entry,location.href);standalone.searchParams.set('labReturn',new URL('./index.html',location.href).href);$('#standalone-game').href=standalone.href;
      $('#player-description').textContent = game.description;
      $('#player-category').textContent = game.category;
      $('#player-controls').replaceChildren(...game.controls.map((item) => el('span', 'tag', item)));
      mountGame(game);
    }
    $('#player-title').focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'instant' });
    fitPlayer();
  } else {
    const wasPlaying = !player.hidden;
    resetDisplay();
    clearGame();
    home.hidden = false;
    player.hidden = true;
    const target = routePath === '/guide' ? $('#guide') : routePath === '/collection' ? $('#collection') : routePath === '/submit' ? $('#submit') : null;
    if (target) {
      requestAnimationFrame(() => {
        target.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
        if (routePath === '/guide') $('#guide summary').focus({ preventScroll: true });
        else if (routePath === '/submit') $('#submission-form input').focus({ preventScroll: true });
        else $('#game-search').focus({ preventScroll: true });
      });
    } else if (wasPlaying) {
      $('#collection').scrollIntoView({ behavior: 'instant' });
      $('#game-search').focus({ preventScroll: true });
    }
  }
}

async function loadCatalog() {
  $('#retry-catalog').hidden = true;
  try {
    const response = await fetch('./games.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error('清单读取失败');
    const games = await response.json();
    if (!Array.isArray(games) || !games.every(validateGameRegistration)) {
      throw new Error('游戏清单格式无效');
    }
    cards.clear();
    catalog = games.map(game => ({ ...game, searchText: [game.title, game.subtitle, game.description, ...game.tags].join(' ').toLocaleLowerCase() }));
    catalogReady = true;
    category = '全部';
    $('#filters').replaceChildren();
    for (const item of ['全部', ...new Set(games.map((game) => game.category))]) {
      const button = el('button', 'filter', item);
      button.type = 'button';
      button.addEventListener('click', () => { category = item; renderGames(); });
      $('#filters').append(button);
    }
    const featured = games.find((game) => game.featured) || games[0];
    if (featured) {
      $('#featured-cover').src = featured.cover;
      $('#featured-cover').alt = `${featured.title}游戏封面`;
      $('#featured-title').textContent = featured.title;
      $('#featured-description').textContent = featured.description;
      $('#featured-play').disabled = false;
      $('#featured-play').setAttribute('aria-label', `开始${featured.title}`);
      $('#featured-play').onclick = () => { location.hash = `/play/${featured.id}`; };
    } else {
      $('#featured-title').textContent = '等待你的第一个实验';
      $('#featured-description').textContent = '查看下方创作指南，加入新游戏。';
      $('#featured-play').disabled = true;
    }
    renderGames();
    route();
  } catch (error) {
    $('#catalog-status').textContent = '游戏清单暂时无法载入，请检查网络后重试。';
    $('#game-count').textContent = '清单未载入';
    $('#retry-catalog').hidden = false;
    console.error(error);
  }
}

$('#game-search').addEventListener('input', () => {
  cancelAnimationFrame(searchFrame); searchFrame = requestAnimationFrame(renderGames);
});
$('#expand-game').onclick = () => { document.body.classList.toggle('game-expanded'); syncDisplay(); };
$('#fullscreen-game').onclick = async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (stage.requestFullscreen && document.fullscreenEnabled) await stage.requestFullscreen();
    else throw new Error('Fullscreen unavailable');
    iframe?.focus();
  } catch {
    document.body.classList.add('game-expanded');
    $('#player-status').textContent = '浏览器未允许全屏，已铺满窗口。也可使用独立窗口游玩。';
  }
  syncDisplay();
};
$('#exit-expanded').onclick = resetDisplay;
$('#standalone-game').onclick = () => postToGame('ai-game-lab:pause');
document.addEventListener('fullscreenchange', syncDisplay);
window.addEventListener('message', event => {
  if (!iframe || !isLabMessage(event, {source:iframe.contentWindow,origin:iframe.dataset.origin,session:gameSession})) return;
  if (event.data.type === 'ai-game-lab:ready') { clearTimeout(readyTimer); $('#player-status').textContent = '点击游戏画面即可操作。'; }
  else if (event.data.type === 'ai-game-lab:exit') { resetDisplay(); location.hash = '/'; }
  else if (event.data.type === 'ai-game-lab:expand') { document.body.classList.add('game-expanded'); syncDisplay(); }
});
document.addEventListener('keydown', event => { if (event.key === 'Escape' && !document.fullscreenElement) resetDisplay(); });
const submissionObserver = new IntersectionObserver(entries => {
  if (submissionLoaded || !entries.some(entry => entry.isIntersecting)) return;
  submissionLoaded = true; submissionObserver.disconnect();
  import('./submission.js').then(module => module.initializeSubmission()).catch(() => {
    $('#submission-status').textContent = '投稿入口载入失败，请刷新后重试。';
  });
}, { rootMargin: '200px' });
submissionObserver.observe($('#submit'));
$('#retry-catalog').addEventListener('click', loadCatalog);
$('#reload-game').addEventListener('click', () => {
  const game = catalog.find((item) => `/play/${item.id}` === location.hash.slice(1));
  if (game) mountGame(game);
});
window.addEventListener('hashchange', route);
window.addEventListener('resize', fitPlayer);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) postToGame('ai-game-lab:pause');
});
loadCatalog();
