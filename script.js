const pickBtn = document.getElementById('pick-btn');
const swatch = document.getElementById('swatch');
const hexValue = document.getElementById('hex-value');
const rgbValue = document.getElementById('rgb-value');
const hslValue = document.getElementById('hsl-value');
const copyHex = document.getElementById('copy-hex');
const copyRgb = document.getElementById('copy-rgb');
const copyHsl = document.getElementById('copy-hsl');
const unsupportedBanner = document.getElementById('unsupported-banner');

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
