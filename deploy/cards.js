'use strict';

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const MISMATCH_MS = 800;          // 안 맞은 카드 노출 시간
const SD_GRID     = 2;            // 서든데스 그리드 (2×2)
const MOBILE_Q    = window.matchMedia('(max-width: 600px)');

// Kakao JavaScript App Key (기존 게임과 동일 앱)
const KAKAO_KEY = '67175d3780cc7f9f4474a8f2b564d3ea';
const SHARE_URL = 'https://pixelcolorpick.co.kr/cards.html';

// 색약 모드에서 카드에 함께 표시하는 기호 (짝마다 고유, 최대 32쌍)
const SYMBOLS = [
  '1','2','3','4','5','6','7','8','9','10','11','12','13','14','15','16',
  '17','18','19','20','21','22','23','24','25','26','27','28','29','30','31','32',
];

// ─── COLOR UTIL (game.js의 hslToRgb를 카드용으로 재사용) ─────────────────────────
function hslToRgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - c / 2;
  let r, g, b;
  if      (h < 60)  { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else              { r = c; g = 0; b = x; }
  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
}

function hslToHex(h, s, l) {
  const [r, g, b] = hslToRgb(h, s, l);
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

// 적응형 팔레트: 그리드가 클수록 채도·명도 폭을 넓혀 N색을 서로 구분되게 만든다.
// 인접 색조끼리 명도/채도 단계를 번갈아 배치해 비슷한 색이 붙지 않도록 한다.
const PALETTE_CONF = {
  4: { light: [0.55],             sat: [0.72] },             // 8색 — 통일된 톤으로 예쁘게
  6: { light: [0.45, 0.66],       sat: [0.85, 0.6] },        // 18색 — 2×2 단계
  8: { light: [0.40, 0.58, 0.74], sat: [0.95, 0.62] },       // 32색 — 3×2 단계로 최대 분리
  2: { light: [0.5],              sat: [0.8] },              // 서든데스 2색
};

function buildPalette(gridSize) {
  const n = (gridSize * gridSize) / 2;
  const conf = PALETTE_CONF[gridSize] || PALETTE_CONF[8];
  const { light, sat } = conf;
  const tiers = light.length * sat.length;
  const colors = [];
  for (let i = 0; i < n; i++) {
    const hue = (i * 360 / n) % 360;
    const tier = i % tiers;
    const l = light[tier % light.length];
    const s = sat[Math.floor(tier / light.length) % sat.length];
    colors.push(hslToHex(hue, s, l));
  }
  return colors;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function buildDeck(gridSize) {
  const colors = buildPalette(gridSize);
  const cards = [];
  let id = 0;
  colors.forEach((color, pairId) => {
    for (let k = 0; k < 2; k++) {
      cards.push({ id: id++, pairId, color, symbol: SYMBOLS[pairId], state: 'hidden' });
    }
  });
  return shuffle(cards);
}

// ─── DOM ──────────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

const screens = {
  setup:  $('screen-setup'),
  play:   $('screen-play'),
  result: $('screen-result'),
};

const boardEl   = $('board');
const hudTimer  = $('hud-timer');
const timerNum  = $('timer-num');
const scoreboard = $('scoreboard');
const sdBanner  = $('sd-banner');

// ─── STATE ────────────────────────────────────────────────────────────────────
let setup = { playerCount: 1, gridSize: 4, names: ['P1'], colorblind: false };
let state = {};

function resetGameState(gridSize, players, colorblind) {
  state = {
    gridSize,
    deck:        buildDeck(gridSize),
    flipped:     [],
    lockInput:   false,
    players,                       // [{ name, score }]
    turn:        0,
    colorblind,
    suddenDeath: false,
    sdPlayers:   null,             // 서든데스 참가 플레이어 인덱스 배열
    solo:        players.length === 1,
    startTime:   0,
    timerId:     null,
    matchedPairs: 0,
    totalPairs:  (gridSize * gridSize) / 2,
  };
}

// ─── SCREENS ──────────────────────────────────────────────────────────────────
function showScreen(name) {
  Object.values(screens).forEach(s => { s.hidden = true; });
  screens[name].hidden = false;
}

// ─── SETUP UI ─────────────────────────────────────────────────────────────────
function renderNameInputs() {
  const wrap = $('name-inputs');
  wrap.innerHTML = '';
  for (let i = 0; i < setup.playerCount; i++) {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'name-input';
    input.maxLength = 8;
    input.placeholder = `P${i + 1}`;
    input.value = setup.names[i] && setup.names[i] !== `P${i + 1}` ? setup.names[i] : '';
    input.addEventListener('input', () => { setup.names[i] = input.value.trim(); });
    wrap.appendChild(input);
  }
}

function applyMobileGridLimit() {
  const isMobile = MOBILE_Q.matches;
  $('grid-hint').hidden = !isMobile;
  $('seg-grid').querySelectorAll('.seg-btn').forEach(btn => {
    const big = btn.dataset.grid !== '4';
    btn.disabled = isMobile && big;
    if (isMobile && big && btn.classList.contains('is-active')) {
      selectSeg('seg-grid', $('seg-grid').querySelector('[data-grid="4"]'));
      setup.gridSize = 4;
    }
  });
}

function selectSeg(groupId, btn) {
  $(groupId).querySelectorAll('.seg-btn').forEach(b => b.classList.remove('is-active'));
  btn.classList.add('is-active');
}

$('seg-players').addEventListener('click', e => {
  const btn = e.target.closest('.seg-btn');
  if (!btn) return;
  selectSeg('seg-players', btn);
  setup.playerCount = Number(btn.dataset.count);
  renderNameInputs();
});

$('seg-grid').addEventListener('click', e => {
  const btn = e.target.closest('.seg-btn');
  if (!btn || btn.disabled) return;
  selectSeg('seg-grid', btn);
  setup.gridSize = Number(btn.dataset.grid);
});

$('toggle-colorblind').addEventListener('change', e => {
  setup.colorblind = e.target.checked;
});

MOBILE_Q.addEventListener('change', applyMobileGridLimit);

// ─── BOARD RENDER ─────────────────────────────────────────────────────────────
function renderBoard(gridSize) {
  boardEl.style.setProperty('--cols', gridSize);
  boardEl.classList.toggle('cb', state.colorblind);
  boardEl.innerHTML = '';
  state.deck.forEach(card => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'card';
    el.dataset.id = card.id;
    el.setAttribute('aria-label', '뒤집힌 카드');
    el.innerHTML = `
      <span class="card-inner">
        <span class="card-face card-back" aria-hidden="true"></span>
        <span class="card-face card-front" style="background:${card.color}">
          <span class="card-symbol">${card.symbol}</span>
        </span>
      </span>`;
    el.addEventListener('click', () => onCardClick(card));
    card.el = el;
    boardEl.appendChild(el);
  });
}

function setCardState(card, st) {
  card.state = st;
  card.el.classList.toggle('is-revealed', st === 'revealed');
  card.el.classList.toggle('is-matched',  st === 'matched');
}

// ─── TURN / MATCH LOGIC ───────────────────────────────────────────────────────
function onCardClick(card) {
  if (state.lockInput) return;
  if (card.state !== 'hidden') return;           // 이미 공개/매칭된 카드
  if (state.flipped.includes(card)) return;      // 같은 카드 두 번 클릭

  if (state.solo && !state.startTime) startTimer();

  setCardState(card, 'revealed');
  state.flipped.push(card);

  if (state.flipped.length < 2) return;

  state.lockInput = true;
  const [a, b] = state.flipped;
  if (a.pairId === b.pairId) {
    setTimeout(() => resolveMatch(), 280);
  } else {
    setTimeout(() => resolveMismatch(), MISMATCH_MS);
  }
}

function resolveMatch() {
  const [a, b] = state.flipped;
  setCardState(a, 'matched');
  setCardState(b, 'matched');
  state.flipped = [];
  state.matchedPairs++;

  if (state.suddenDeath) { endSuddenDeath(state.turn); return; }

  state.players[state.turn].score++;
  updateScoreboard();

  if (state.matchedPairs >= state.totalPairs) { finishGame(); return; }
  state.lockInput = false;                       // 맞으면 같은 사람 계속
}

function resolveMismatch() {
  const [a, b] = state.flipped;
  setCardState(a, 'hidden');
  setCardState(b, 'hidden');
  state.flipped = [];
  if (!state.solo || state.suddenDeath) advanceTurn();
  state.lockInput = false;
}

function activePlayers() {
  return state.suddenDeath ? state.sdPlayers : state.players.map((_, i) => i);
}

function advanceTurn() {
  const order = activePlayers();
  const pos = order.indexOf(state.turn);
  state.turn = order[(pos + 1) % order.length];
  updateScoreboard();
}

// ─── SCOREBOARD / TIMER ───────────────────────────────────────────────────────
function updateScoreboard() {
  if (state.solo && !state.suddenDeath) return;
  scoreboard.innerHTML = '';
  const order = activePlayers();
  order.forEach(i => {
    const p = state.players[i];
    const row = document.createElement('div');
    row.className = 'score-pill' + (i === state.turn ? ' is-turn' : '');
    row.innerHTML = `
      <span class="score-name">${escapeHtml(p.name)}</span>
      <span class="score-val">${state.suddenDeath ? '' : p.score}</span>`;
    scoreboard.appendChild(row);
  });
}

function startTimer() {
  state.startTime = Date.now();
  state.timerId = setInterval(() => {
    timerNum.textContent = fmtTime(Date.now() - state.startTime);
  }, 250);
}

function stopTimer() {
  if (state.timerId) clearInterval(state.timerId);
  state.timerId = null;
}

function fmtTime(ms) {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

// ─── START GAME ───────────────────────────────────────────────────────────────
function startGame() {
  const players = [];
  for (let i = 0; i < setup.playerCount; i++) {
    players.push({ name: setup.names[i]?.trim() || `P${i + 1}`, score: 0 });
  }
  resetGameState(setup.gridSize, players, setup.colorblind);

  sdBanner.hidden = true;
  hudTimer.hidden = !state.solo;
  scoreboard.hidden = state.solo;
  timerNum.textContent = '00:00';

  renderBoard(state.gridSize);
  updateScoreboard();
  showScreen('play');
}

// ─── FINISH (멀티 랭킹 / 솔로 기록) ──────────────────────────────────────────────
function finishGame() {
  stopTimer();
  if (state.solo) return finishSolo();

  const max = Math.max(...state.players.map(p => p.score));
  const winners = state.players.map((p, i) => ({ p, i })).filter(o => o.p.score === max);
  if (winners.length > 1) return startSuddenDeath(winners.map(o => o.i));

  showResultMulti(winners[0].i);
}

function finishSolo() {
  const elapsed = Date.now() - state.startTime;
  const key = `cards_best_${state.gridSize}`;
  const prev = Number(localStorage.getItem(key)) || 0;
  const isBest = !prev || elapsed < prev;
  if (isBest) localStorage.setItem(key, String(elapsed));

  const body = $('result-body');
  body.innerHTML = `
    <div class="result-time">${fmtTime(elapsed)}</div>
    <div class="result-sub">${state.gridSize}×${state.gridSize} 클리어!</div>
    ${isBest
      ? '<div class="result-best">🎉 최고 기록 경신!</div>'
      : `<div class="result-best muted">최고 기록 ${fmtTime(prev)}</div>`}`;
  $('result-title').textContent = '클리어!';
  state.lastResult = { kind: 'solo', time: fmtTime(elapsed), grid: state.gridSize };
  showScreen('result');
}

function showResultMulti(winnerIdx) {
  const ranked = [...state.players].sort((a, b) => b.score - a.score);
  const body = $('result-body');
  body.innerHTML = `
    <div class="result-winner">🏆 ${escapeHtml(state.players[winnerIdx].name)} 승리!</div>
    <div class="ranking">
      ${ranked.map((p, i) => `
        <div class="rank-row">
          <span class="rank-pos">${i + 1}</span>
          <span class="rank-name">${escapeHtml(p.name)}</span>
          <span class="rank-score">${p.score}쌍</span>
        </div>`).join('')}
    </div>`;
  $('result-title').textContent = '게임 종료!';
  state.lastResult = { kind: 'multi', winner: state.players[winnerIdx].name };
  showScreen('result');
}

// ─── SUDDEN DEATH ─────────────────────────────────────────────────────────────
function startSuddenDeath(playerIdxs) {
  state.suddenDeath = true;
  state.sdPlayers = playerIdxs;
  state.turn = playerIdxs[0];
  state.gridSize = SD_GRID;
  state.deck = buildDeck(SD_GRID);
  state.flipped = [];
  state.lockInput = false;
  state.matchedPairs = 0;
  state.totalPairs = (SD_GRID * SD_GRID) / 2;

  sdBanner.hidden = false;
  hudTimer.hidden = true;
  scoreboard.hidden = false;
  renderBoard(SD_GRID);
  updateScoreboard();
  showScreen('play');
}

function endSuddenDeath(winnerIdx) {
  showResultMulti(winnerIdx);
}

// ─── SHARE ────────────────────────────────────────────────────────────────────
function shareKakao() {
  if (!window.Kakao) { showToast('카카오 SDK를 불러오지 못했습니다.'); return; }
  if (!Kakao.isInitialized()) Kakao.init(KAKAO_KEY);

  const r = state.lastResult || {};
  const desc = r.kind === 'solo'
    ? `${r.grid}×${r.grid} 카드를 ${r.time}에 클리어! 도전해보세요.`
    : `${r.winner ? r.winner + ' 승리! ' : ''}색깔 카드 뒤집기에 도전해보세요.`;

  Kakao.Share.sendDefault({
    objectType: 'feed',
    content: {
      title:       '색깔 카드 뒤집기 게임',
      description: desc,
      imageUrl:    'https://pixelcolorpick.co.kr/favicon.png',
      link: { mobileWebUrl: SHARE_URL, webUrl: SHARE_URL },
    },
  });
}

function copyLink() {
  navigator.clipboard.writeText(SHARE_URL)
    .then(() => showToast('링크가 복사되었습니다!'))
    .catch(() => showToast('복사 실패. URL을 직접 복사해주세요.'));
}

function showToast(msg) {
  let toast = $('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function quitToSetup() {
  stopTimer();
  showScreen('setup');
}

// ─── EVENTS / BOOT ────────────────────────────────────────────────────────────
$('btn-start').addEventListener('click', startGame);
$('btn-again').addEventListener('click', () => showScreen('setup'));
$('btn-quit').addEventListener('click', quitToSetup);
$('btn-kakao').addEventListener('click', shareKakao);
$('btn-copy').addEventListener('click', copyLink);

renderNameInputs();
applyMobileGridLimit();

const ks = document.createElement('script');
ks.src = 'https://t1.kakaocdn.net/kakao_js_sdk/2.7.0/kakao.min.js';
ks.crossOrigin = 'anonymous';
document.head.appendChild(ks);
