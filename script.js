const pickBtn = document.getElementById('pick-btn');
const swatch = document.getElementById('swatch');
const hexValue = document.getElementById('hex-value');
const rgbValue = document.getElementById('rgb-value');
const hslValue = document.getElementById('hsl-value');
const copyHex = document.getElementById('copy-hex');
const copyRgb = document.getElementById('copy-rgb');
const copyHsl = document.getElementById('copy-hsl');
const unsupportedBanner = document.getElementById('unsupported-banner');
const historyWrap = document.getElementById('history-wrap');
const historySwatches = document.getElementById('history-swatches');
const historyClear = document.getElementById('history-clear');

const imageDropzone = document.getElementById('image-dropzone');
const imageInput = document.getElementById('image-input');
const canvasWrap = document.getElementById('canvas-wrap');
const imageCanvas = document.getElementById('image-canvas');
const imageChange = document.getElementById('image-change');
const magnifier = document.getElementById('magnifier');
const paletteWrap = document.getElementById('palette-wrap');
const paletteSwatches = document.getElementById('palette-swatches');

const isSupported = typeof window.EyeDropper !== 'undefined';

if (!isSupported) {
  unsupportedBanner.classList.remove('hidden');
  pickBtn.disabled = true;
}

pickBtn.addEventListener('click', async () => {
  const eyeDropper = new EyeDropper();
  try {
    const result = await eyeDropper.open();
    applyColor(result.sRGBHex);
  } catch (e) {
    if (e.name !== 'AbortError') console.error(e);
  }
});

function applyColor(hex) {
  const upperHex = hex.toUpperCase();
  const { r, g, b } = hexToRgb(upperHex);
  const { h, s, l } = rgbToHsl(r, g, b);

  const hexStr = upperHex;
  const rgbStr = `rgb(${r}, ${g}, ${b})`;
  const hslStr = `hsl(${h}, ${s}%, ${l}%)`;

  swatch.style.backgroundColor = hex;
  swatch.classList.remove('empty');

  hexValue.textContent = hexStr;
  rgbValue.textContent = rgbStr;
  hslValue.textContent = hslStr;

  copyHex.disabled = false;
  copyRgb.disabled = false;
  copyHsl.disabled = false;

  copyHex.onclick = () => copyToClipboard(copyHex, hexStr);
  copyRgb.onclick = () => copyToClipboard(copyRgb, rgbStr);
  copyHsl.onclick = () => copyToClipboard(copyHsl, hslStr);

  renderPalette(h, s, l);
  addToHistory(upperHex);
}

function copyToClipboard(btn, text) {
  navigator.clipboard.writeText(text).then(() => {
    btn.textContent = '✓ Copied!';
    btn.classList.add('copied');
    setTimeout(() => {
      btn.textContent = 'Copy';
      btn.classList.remove('copied');
    }, 2000);
  });
}

const HISTORY_KEY = 'pcp_history';
const HISTORY_MAX = 10;

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; }
  catch { return []; }
}

function renderHistory() {
  const history = loadHistory();
  if (history.length === 0) {
    historyWrap.classList.add('hidden');
    return;
  }
  historyWrap.classList.remove('hidden');
  historySwatches.innerHTML = history.map(hex =>
    `<button class="history-swatch" style="background:${hex}" title="${hex}" data-hex="${hex}" aria-label="${hex} 색상 적용"></button>`
  ).join('');
}

function addToHistory(hex) {
  const history = [hex, ...loadHistory().filter(c => c !== hex)].slice(0, HISTORY_MAX);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  renderHistory();
}

historySwatches.addEventListener('click', e => {
  const btn = e.target.closest('.history-swatch');
  if (btn) applyColor(btn.dataset.hex);
});

historyClear.addEventListener('click', () => {
  localStorage.removeItem(HISTORY_KEY);
  renderHistory();
});

renderHistory();

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { r, g, b };
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

function rgbToHex(r, g, b) {
  const toHex = n => n.toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const k = n => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toByte = x => Math.round(x * 255);
  return rgbToHex(toByte(f(0)), toByte(f(8)), toByte(f(4)));
}

// ── 색조 팔레트 (밝기 10% ~ 100%) ──
function renderPalette(h, s, l) {
  const steps = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  // 현재 색의 밝기에 가장 가까운 단계에 체크 표시
  const closest = steps.reduce((a, b) => (Math.abs(b - l) < Math.abs(a - l) ? b : a));
  paletteSwatches.innerHTML = steps.map(level => {
    const hex = hslToHex(h, s, level);
    const checked = level === closest;
    // 밝은 칸은 어두운 체크, 어두운 칸은 밝은 체크
    const checkColor = level >= 55 ? '#1a1a2e' : '#ffffff';
    return `<button type="button" class="palette-swatch${checked ? ' active' : ''}" style="background:${hex}${checked ? `;color:${checkColor}` : ''}" data-hex="${hex}" title="${hex} (밝기 ${level}%)" aria-label="${hex} 색상 적용">${checked ? '✔' : ''}</button>`;
  }).join('');
  paletteWrap.classList.remove('hidden');
}

paletteSwatches.addEventListener('click', e => {
  const btn = e.target.closest('.palette-swatch');
  if (btn) applyColor(btn.dataset.hex);
});

// ── 이미지 업로드 & 캔버스 색상 추출 ──
const ctx = imageCanvas.getContext('2d', { willReadFrequently: true });
let imageLoaded = false;

function loadImageFile(file) {
  if (!file || !file.type.startsWith('image/')) return;
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    imageCanvas.width = img.naturalWidth;
    imageCanvas.height = img.naturalHeight;
    ctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(url);
    imageLoaded = true;
    imageDropzone.classList.add('hidden');
    canvasWrap.classList.remove('hidden');
  };
  img.src = url;
}

imageDropzone.addEventListener('click', () => imageInput.click());
imageChange.addEventListener('click', () => imageInput.click());

imageInput.addEventListener('change', e => {
  if (e.target.files[0]) loadImageFile(e.target.files[0]);
  imageInput.value = ''; // 같은 파일 재선택 허용
});

['dragenter', 'dragover'].forEach(evt =>
  imageDropzone.addEventListener(evt, e => {
    e.preventDefault();
    imageDropzone.classList.add('dragover');
  })
);
['dragleave', 'drop'].forEach(evt =>
  imageDropzone.addEventListener(evt, e => {
    e.preventDefault();
    imageDropzone.classList.remove('dragover');
  })
);
imageDropzone.addEventListener('drop', e => {
  if (e.dataTransfer.files[0]) loadImageFile(e.dataTransfer.files[0]);
});

// 캔버스 좌표 → 원본 픽셀 좌표
function canvasPixel(e) {
  const rect = imageCanvas.getBoundingClientRect();
  const x = Math.floor((e.clientX - rect.left) * (imageCanvas.width / rect.width));
  const y = Math.floor((e.clientY - rect.top) * (imageCanvas.height / rect.height));
  return { x, y };
}

imageCanvas.addEventListener('click', e => {
  if (!imageLoaded) return;
  const { x, y } = canvasPixel(e);
  const [r, g, b] = ctx.getImageData(x, y, 1, 1).data;
  applyColor(rgbToHex(r, g, b));
});

// 돋보기 미리보기
const MAG_SIZE = 100;   // 확대경 지름(px)
const MAG_ZOOM = 8;     // 확대 배율
imageCanvas.addEventListener('mousemove', e => {
  if (!imageLoaded) return;
  const wrapRect = canvasWrap.getBoundingClientRect();
  const { x, y } = canvasPixel(e);
  const src = MAG_SIZE / MAG_ZOOM;

  let mc = magnifier._canvas;
  if (!mc) {
    mc = magnifier._canvas = document.createElement('canvas');
    mc.width = MAG_SIZE; mc.height = MAG_SIZE;
    magnifier.appendChild(mc);
  }
  const mctx = mc.getContext('2d');
  mctx.imageSmoothingEnabled = false;
  mctx.clearRect(0, 0, MAG_SIZE, MAG_SIZE);
  mctx.drawImage(imageCanvas, x - src / 2, y - src / 2, src, src, 0, 0, MAG_SIZE, MAG_SIZE);

  magnifier.style.left = `${e.clientX - wrapRect.left}px`;
  magnifier.style.top = `${e.clientY - wrapRect.top}px`;
  magnifier.classList.remove('hidden');
});

imageCanvas.addEventListener('mouseleave', () => magnifier.classList.add('hidden'));
