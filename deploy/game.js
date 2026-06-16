'use strict';

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const TOTAL_ROUNDS = 5;
const MEMORIZE_MS  = 5000;
const SELECT_MS    = 10000;
const CIRC         = 2 * Math.PI * 28; // SVG timer arc circumference (r=28)

// Kakao JavaScript App Key — 카카오 개발자 콘솔(https://developers.kakao.com)에서 발급
const KAKAO_KEY = '67175d3780cc7f9f4474a8f2b564d3ea';

const DIFFICULTY = [
  { sMin: 0.80, sMax: 1.00, lMin: 0.40, lMax: 0.60 },
  { sMin: 0.60, sMax: 1.00, lMin: 0.35, lMax: 0.65 },
  { sMin: 0.40, sMax: 1.00, lMin: 0.30, lMax: 0.70 },
  { sMin: 0.20, sMax: 1.00, lMin: 0.25, lMax: 0.75 },
  { sMin: 0.10, sMax: 1.00, lMin: 0.20, lMax: 0.80 },
];

// ─── STATE ────────────────────────────────────────────────────────────────────
let state = {};

function resetState() {
  state = {
    round:      0,
    target:     null,
    targets:    [],
    picks:      [],
    scores:     [],
    phase:      'intro',
    cursorPos:  { x: 0, y: 0 },
    wheelSize:  0,
    timerRAF:   null,
  };
}

// ─── DOM ──────────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

const screens = {
  intro:    $('screen-intro'),
  memorize: $('screen-memorize'),
  select:   $('screen-select'),
  result:   $('screen-result'),
  final:    $('screen-final'),
};

const canvas    = $('color-wheel');
const dotEl     = $('selector-dot');
const selectedSwatchEl = $('selected-swatch');
const timerArc  = $('timer-arc');
const timerNum  = $('timer-num');

// ─── COLOR MATH ───────────────────────────────────────────────────────────────

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

function rgbToLab(r, g, b) {
  let rr = r / 255, gg = g / 255, bb = b / 255;
  rr = rr > 0.04045 ? Math.pow((rr + 0.055) / 1.055, 2.4) : rr / 12.92;
  gg = gg > 0.04045 ? Math.pow((gg + 0.055) / 1.055, 2.4) : gg / 12.92;
  bb = bb > 0.04045 ? Math.pow((bb + 0.055) / 1.055, 2.4) : bb / 12.92;
  const X = rr * 0.4124564 + gg * 0.3575761 + bb * 0.1804375;
  const Y = rr * 0.2126729 + gg * 0.7151522 + bb * 0.0721750;
  const Z = rr * 0.0193339 + gg * 0.1191920 + bb * 0.9503041;
  const f = t => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
  return {
    L: 116 * f(Y)          - 16,
    a: 500 * (f(X / 0.95047) - f(Y)),
    b: 200 * (f(Y)           - f(Z / 1.08883)),
  };
}

function deltaE2000(lab1, lab2) {
  const { L: L1, a: a1, b: b1 } = lab1;
  const { L: L2, a: a2, b: b2 } = lab2;

  const C1  = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2);
  const Cb  = (C1 + C2) / 2;
  const Cb7 = Cb ** 7;
  const G   = 0.5 * (1 - Math.sqrt(Cb7 / (Cb7 + 25 ** 7)));

  const a1p = a1 * (1 + G), a2p = a2 * (1 + G);
  const C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);

  const hp = (b, a) => { const v = Math.atan2(b, a) * 180 / Math.PI; return v < 0 ? v + 360 : v; };
  const h1p = C1p === 0 ? 0 : hp(b1, a1p);
  const h2p = C2p === 0 ? 0 : hp(b2, a2p);

  const dLp = L2 - L1;
  const dCp = C2p - C1p;
  let dhp = 0;
  if (C1p * C2p !== 0) {
    if      (Math.abs(h2p - h1p) <= 180) dhp = h2p - h1p;
    else if (h2p - h1p > 180)            dhp = h2p - h1p - 360;
    else                                  dhp = h2p - h1p + 360;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(dhp * Math.PI / 360);

  const Lbp = (L1 + L2) / 2;
  const Cbp = (C1p + C2p) / 2;
  let Hbp = h1p + h2p;
  if (C1p * C2p !== 0) {
    if      (Math.abs(h1p - h2p) <= 180) Hbp = (h1p + h2p) / 2;
    else if (h1p + h2p < 360)            Hbp = (h1p + h2p + 360) / 2;
    else                                  Hbp = (h1p + h2p - 360) / 2;
  }

  const T = 1
    - 0.17 * Math.cos((Hbp - 30)     * Math.PI / 180)
    + 0.24 * Math.cos(2  * Hbp       * Math.PI / 180)
    + 0.32 * Math.cos((3  * Hbp + 6) * Math.PI / 180)
    - 0.20 * Math.cos((4  * Hbp - 63)* Math.PI / 180);

  const SL  = 1 + 0.015 * (Lbp - 50) ** 2 / Math.sqrt(20 + (Lbp - 50) ** 2);
  const SC  = 1 + 0.045 * Cbp;
  const SH  = 1 + 0.015 * Cbp * T;

  const Cbp7 = Cbp ** 7;
  const RC   = 2 * Math.sqrt(Cbp7 / (Cbp7 + 25 ** 7));
  const dTh  = 30 * Math.exp(-(((Hbp - 275) / 25) ** 2));
  const RT   = -Math.sin(2 * dTh * Math.PI / 180) * RC;

  return Math.sqrt(
    (dLp / SL) ** 2 + (dCp / SC) ** 2 + (dHp / SH) ** 2 +
    RT * (dCp / SC) * (dHp / SH)
  );
}

function calcScore(r1, g1, b1, r2, g2, b2) {
  const dE = deltaE2000(rgbToLab(r1, g1, b1), rgbToLab(r2, g2, b2));
  return Math.max(0, Math.round(100 - dE * 2));
}

// ─── COLOR WHEEL ──────────────────────────────────────────────────────────────

function initWheel() {
  const dpr  = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const css  = rect.width;
  state.wheelSize = css;
  canvas.width  = Math.round(css * dpr);
  canvas.height = Math.round(css * dpr);
  const mid = css / 2;
  state.cursorPos = { x: mid, y: mid };
  moveDot(mid, mid);
}

function drawWheel(targetHue) {
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.width, H = canvas.height;
  const cx = W / 2, cy = H / 2, R = W / 2;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(W, H);
  const d = img.data;

  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const dx = px - cx, dy = py - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > R) continue;
      const angleDeg = Math.atan2(dy, dx) * 180 / Math.PI;
      const hue = ((angleDeg + 90 + targetHue) % 360 + 360) % 360;
      const sat = dist / R;
      const [r, g, b] = hslToRgb(hue, sat, 0.5);
      const i = (py * W + px) * 4;
      d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

function getColorAtCursor() {
  const dpr = window.devicePixelRatio || 1;
  const x = Math.round(Math.max(0, Math.min(state.cursorPos.x * dpr, canvas.width  - 1)));
  const y = Math.round(Math.max(0, Math.min(state.cursorPos.y * dpr, canvas.height - 1)));
  const p = canvas.getContext('2d').getImageData(x, y, 1, 1).data;
  return { r: p[0], g: p[1], b: p[2] };
}

function moveDot(cssX, cssY) {
  const ws = state.wheelSize;
  const cx = ws / 2, cy = ws / 2;
  const dx = cssX - cx, dy = cssY - cy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const R = ws / 2 - 1;
  let fx = cssX, fy = cssY;
  if (dist > R) { fx = cx + dx / dist * R; fy = cy + dy / dist * R; }
  state.cursorPos = { x: fx, y: fy };
  dotEl.style.left = fx + 'px';
  dotEl.style.top  = fy + 'px';
  const c = getColorAtCursor();
  dotEl.style.background = `rgb(${c.r},${c.g},${c.b})`;
  selectedSwatchEl.style.background = `rgb(${c.r},${c.g},${c.b})`;
}

function getCanvasPos(e) {
  const rect = canvas.getBoundingClientRect();
  const src  = e.touches ? e.touches[0] : e;
  return { x: src.clientX - rect.left, y: src.clientY - rect.top };
}

canvas.addEventListener('mousemove', e => {
  if (state.phase !== 'select') return;
  const { x, y } = getCanvasPos(e); moveDot(x, y);
});
canvas.addEventListener('click', e => {
  if (state.phase !== 'select') return;
  const { x, y } = getCanvasPos(e); moveDot(x, y);
});
canvas.addEventListener('touchstart', e => {
  if (state.phase !== 'select') return;
  e.preventDefault();
  const { x, y } = getCanvasPos(e); moveDot(x, y);
}, { passive: false });
canvas.addEventListener('touchmove', e => {
  if (state.phase !== 'select') return;
  e.preventDefault();
  const { x, y } = getCanvasPos(e); moveDot(x, y);
}, { passive: false });

// ─── SCREEN ───────────────────────────────────────────────────────────────────

function showScreen(name) {
  Object.values(screens).forEach(s => { s.hidden = true; });
  screens[name].hidden = false;
  state.phase = name;
}

// ─── GAME PHASES ──────────────────────────────────────────────────────────────

function generateTarget(round) {
  const { sMin, sMax, lMin, lMax } = DIFFICULTY[round];
  const h = Math.random() * 360;
  const s = sMin + Math.random() * (sMax - sMin);
  const l = lMin + Math.random() * (lMax - lMin);
  const [r, g, b] = hslToRgb(h, s, l);
  return { h, r, g, b };
}

function startMemorize() {
  state.target = generateTarget(state.round);
  state.targets.push(state.target);

  $('memorize-round').textContent = state.round + 1;
  $('target-swatch').style.background =
    `rgb(${state.target.r},${state.target.g},${state.target.b})`;

  let count = 5;
  $('memorize-count').textContent = count;
  showScreen('memorize');

  function tick() {
    count--;
    $('memorize-count').textContent = count;
    if (count > 0) setTimeout(tick, 1000);
    else startSelect();
  }
  setTimeout(tick, 1000);
}

function startSelect() {
  $('select-round').textContent = state.round + 1;
  showScreen('select');

  requestAnimationFrame(() => {
    initWheel();
    drawWheel(state.target.h);
    moveDot(state.cursorPos.x, state.cursorPos.y);

    const startTs = performance.now();
    let lastSec = 10;
    timerNum.textContent = '10';
    timerArc.style.strokeDashoffset = '0';
    timerArc.style.stroke = '#22c55e';

    function tick(now) {
      const elapsed   = now - startTs;
      const remaining = SELECT_MS - elapsed;
      const secLeft   = Math.ceil(remaining / 1000);

      if (secLeft !== lastSec) {
        lastSec = secLeft;
        timerNum.textContent = Math.max(0, secLeft);
        if      (secLeft <= 3) timerArc.style.stroke = '#ef4444';
        else if (secLeft <= 6) timerArc.style.stroke = '#f59e0b';
      }

      timerArc.style.strokeDashoffset =
        String(Math.min(CIRC, CIRC * elapsed / SELECT_MS));

      if (elapsed >= SELECT_MS) { submitAnswer(); return; }
      state.timerRAF = requestAnimationFrame(tick);
    }
    state.timerRAF = requestAnimationFrame(tick);
  });
}

function submitAnswer() {
  cancelAnimationFrame(state.timerRAF);
  const pick  = getColorAtCursor();
  const score = calcScore(
    state.target.r, state.target.g, state.target.b,
    pick.r, pick.g, pick.b
  );
  state.picks.push(pick);
  state.scores.push(score);

  $('result-round').textContent = state.round + 1;
  $('answer-swatch').style.background =
    `rgb(${state.target.r},${state.target.g},${state.target.b})`;
  $('picked-swatch').style.background =
    `rgb(${pick.r},${pick.g},${pick.b})`;
  $('round-score').textContent = score;
  showScreen('result');
}

function nextRound() {
  state.round++;
  if (state.round < TOTAL_ROUNDS) {
    startMemorize();
  } else {
    showFinal();
  }
}

function showFinal() {
  const total = state.scores.reduce((a, b) => a + b, 0);
  $('total-score').textContent = total;

  const summary = $('rounds-summary');
  summary.innerHTML = '';
  state.scores.forEach((score, i) => {
    const t = state.targets[i];
    const p = state.picks[i];
    const row = document.createElement('div');
    row.className = 'summary-row';
    row.innerHTML = `
      <span class="summary-round">R${i + 1}</span>
      <span class="summary-swatch" style="background:rgb(${t.r},${t.g},${t.b})"></span>
      <span class="summary-vs">vs</span>
      <span class="summary-swatch" style="background:rgb(${p.r},${p.g},${p.b})"></span>
      <span class="summary-score">${score}점</span>
    `;
    summary.appendChild(row);
  });

  showScreen('final');
}

// ─── SHARE ────────────────────────────────────────────────────────────────────

function shareKakao() {
  if (KAKAO_KEY === 'YOUR_KAKAO_JS_APP_KEY') {
    showToast('카카오 앱 키가 설정되지 않았습니다.');
    return;
  }
  const total = state.scores.reduce((a, b) => a + b, 0);
  if (!window.Kakao || !window.Kakao.isInitialized()) {
    Kakao.init(KAKAO_KEY);
  }
  Kakao.Share.sendDefault({
    objectType: 'feed',
    content: {
      title:       '색깔 맞추기 게임',
      description: `내 색깔 감각 점수는 ${total}/500점! 도전해보세요.`,
      imageUrl:    'https://pixelcolorpick.co.kr/favicon.png',
      link: {
        mobileWebUrl: 'https://pixelcolorpick.co.kr/game.html',
        webUrl:       'https://pixelcolorpick.co.kr/game.html',
      },
    },
  });
}

function copyLink() {
  navigator.clipboard.writeText('https://pixelcolorpick.co.kr/game.html')
    .then(()  => showToast('링크가 복사되었습니다!'))
    .catch(()  => showToast('복사 실패. URL을 직접 복사해주세요.'));
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

// ─── EVENTS ───────────────────────────────────────────────────────────────────

$('btn-start').addEventListener('click',   () => { resetState(); startMemorize(); });
$('btn-next').addEventListener('click',    nextRound);
$('btn-restart').addEventListener('click', () => { resetState(); showScreen('intro'); });
$('btn-kakao').addEventListener('click',   shareKakao);
$('btn-copy').addEventListener('click',    copyLink);

// ─── BOOT ─────────────────────────────────────────────────────────────────────

resetState();

if (KAKAO_KEY !== 'YOUR_KAKAO_JS_APP_KEY') {
  const s = document.createElement('script');
  s.src = 'https://t1.kakaocdn.net/kakao_js_sdk/2.7.0/kakao.min.js';
  s.crossOrigin = 'anonymous';
  document.head.appendChild(s);
}
