// Keep all DOM, events and timers inside this independent iframe page.
const scoreOutput = document.querySelector('#score');
const timeOutput = document.querySelector('#time');
const target = document.querySelector('#target');
const start = document.querySelector('#start');
const pauseButton = document.querySelector('#pause');
const status = document.querySelector('#status');
let score = 0;
let remaining = 30;
let phase = 'ready';
let timer = null;
let deadline = 0;

function stopTimer() { clearInterval(timer); timer = null; }
function show() {
  scoreOutput.textContent = score;
  timeOutput.textContent = Math.ceil(remaining);
  target.disabled = phase !== 'running';
  pauseButton.disabled = !['running', 'paused'].includes(phase);
  pauseButton.textContent = phase === 'paused' ? '继续' : '暂停';
}
function runTimer() {
  deadline = performance.now() + remaining * 1000;
  stopTimer();
  timer = setInterval(() => {
    remaining = Math.max(0, (deadline - performance.now()) / 1000);
    if (remaining === 0) {
      phase = 'finished'; stopTimer(); start.textContent = '再玩一次';
      status.textContent = `游戏结束，得分 ${score}。`; start.focus();
    }
    show();
  }, 100);
}
function pause() {
  if (phase !== 'running') return;
  remaining = Math.max(0, (deadline - performance.now()) / 1000);
  phase = 'paused'; stopTimer(); show(); status.textContent = '游戏已暂停。';
}
start.addEventListener('click', () => {
  score = 0; remaining = 30; phase = 'running'; start.textContent = '重新开始';
  target.style.left = 'calc(50% - 28px)'; target.style.top = 'calc(50% - 28px)';
  status.textContent = '点击目标，增加分数。'; show(); runTimer();
});
target.addEventListener('click', () => {
  if (phase !== 'running') return;
  score++;
  const arena = document.querySelector('#arena');
  target.style.left = `${Math.random() * Math.max(0, arena.clientWidth - 64) + 4}px`;
  target.style.top = `${Math.random() * Math.max(0, arena.clientHeight - 64) + 4}px`;
  show();
});
pauseButton.addEventListener('click', () => {
  if (phase === 'paused') { phase = 'running'; show(); runTimer(); status.textContent = '游戏继续。'; }
  else pause();
});
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
window.addEventListener('message', (event) => {
  if (event.source === window.parent && event.data?.type === 'ai-game-lab:pause') pause();
});
window.addEventListener('pagehide', stopTimer);
