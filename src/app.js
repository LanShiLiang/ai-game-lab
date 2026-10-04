const $ = (selector) => document.querySelector(selector);
const home = $('#home-view');
const player = $('#player-view');
let catalog = [];
let category = '全部';
let iframe = null;
let catalogReady = false;

function el(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

function renderGames() {
  const query = $('#game-search').value.trim().toLocaleLowerCase();
  const matches = catalog.filter((game) => (category === '全部' || category === game.category)
    && [game.title, game.subtitle, game.description, ...game.tags].join(' ').toLocaleLowerCase().includes(query));
  const grid = $('#game-grid');
  grid.replaceChildren();
  for (const game of matches) {
    const link = el('a', 'game-card');
    link.href = `#/play/${game.id}`;
    link.style.setProperty('--card-accent', game.accent);
    const cover = el('div', 'card-cover');
    const img = el('img');
    img.src = `./${game.cover}`;
    img.alt = '';
    img.loading = 'lazy';
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
    grid.append(link);
  }
  $('#empty-state').hidden = matches.length > 0;
  $('#game-count').textContent = `${catalog.length} 个可玩实验`;
  $('#catalog-status').textContent = `显示 ${matches.length} 个游戏`;
  for (const button of $('#filters').children) button.setAttribute('aria-pressed', String(button.textContent === category));
}

function clearGame() {
  if (iframe) { iframe.src = 'about:blank'; iframe.remove(); iframe = null; }
  $('#game-stage').replaceChildren();
}

function mountGame(game) {
  clearGame();
  $('#player-status').textContent = '正在打开游戏…';
  iframe = el('iframe', 'game-frame');
  iframe.title = `${game.title}游戏画面`;
  iframe.setAttribute('sandbox', game.id === 'apex-rush' ? 'allow-scripts allow-same-origin' : 'allow-scripts');
  iframe.setAttribute('allow', 'fullscreen');
  iframe.setAttribute('referrerpolicy', 'no-referrer');
  iframe.src = `./${game.entry}`;
  iframe.addEventListener('load', () => {
    $('#player-status').textContent = '点击游戏画面即可操作。';
  }, { once: true });
  $('#game-stage').append(iframe);
}

function route() {
  if (!catalogReady) return;
  const routePath = location.hash.replace(/^#/, '') || '/';
  if (routePath.startsWith('/play/')) {
    const id = routePath.slice(6);
    const game = catalog.find((item) => item.id === id);
    home.hidden = true;
    player.hidden = false;
    $('#reload-game').hidden = !game;
    if (!game) {
      clearGame();
      $('#player-title').textContent = '没有找到这个游戏';
      $('#player-description').textContent = '游戏可能已更名，请返回大厅选择。';
      $('#player-controls').replaceChildren();
      $('#player-category').textContent = 'GAME NOT FOUND';
      $('#player-status').textContent = '';
    } else {
      $('#player-title').textContent = game.title;
      $('#player-description').textContent = game.description;
      $('#player-category').textContent = game.category;
      $('#player-controls').replaceChildren(...game.controls.map((item) => el('span', 'tag', item)));
      mountGame(game);
    }
    $('#player-title').focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'instant' });
  } else {
    const wasPlaying = !player.hidden;
    clearGame();
    home.hidden = false;
    player.hidden = true;
    const target = routePath === '/guide' ? $('#guide') : routePath === '/collection' ? $('#collection') : null;
    if (target) {
      requestAnimationFrame(() => {
        target.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
        if (routePath === '/guide') $('#guide summary').focus({ preventScroll: true });
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
    if (!Array.isArray(games) || !games.every((game) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(game.id)
      && Array.isArray(game.tags) && Array.isArray(game.controls)
      && ['entry', 'cover'].every((field) => typeof game[field] === 'string'
        && game[field].startsWith(`games/${game.id}/`) && !/[\\?#%]|\.\./.test(game[field])))) {
      throw new Error('游戏清单格式无效');
    }
    catalog = games;
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
      $('#featured-cover').src = `./${featured.cover}`;
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
    $('#catalog-status').textContent = '无法读取游戏清单。请使用 npm run dev 启动，并检查 games.json。';
    $('#game-count').textContent = '清单未载入';
    $('#retry-catalog').hidden = false;
    console.error(error);
  }
}

$('#game-search').addEventListener('input', renderGames);
$('#retry-catalog').addEventListener('click', loadCatalog);
$('#reload-game').addEventListener('click', () => {
  const game = catalog.find((item) => `/play/${item.id}` === location.hash.slice(1));
  if (game) mountGame(game);
});
window.addEventListener('hashchange', route);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) iframe?.contentWindow?.postMessage({ type: 'ai-game-lab:pause' }, '*');
});
loadCatalog();
