/**
 * Pick an accent colour from a wallpaper so the active tab / buttons match it.
 *
 * The image is drawn into a tiny canvas (64px wide), pixels are grouped into
 * 24 hue buckets, and each pixel scores by saturation and by how close its
 * lightness is to the middle (so near-black and near-white pixels barely count).
 * The best bucket's average colour is then nudged to a usable accent:
 * saturated enough to read as a colour and light enough to stand out on the
 * dark glass UI. Mostly grey wallpapers get a soft neutral accent instead.
 */

const SAMPLE_WIDTH = 64;
const HUE_BUCKETS = 24;
/**
 * Below this average "colourfulness" the wallpaper is treated as greyscale.
 * Measured on the bundled set: black-and-white images score 0–0.007, images
 * with one clear colour (red halo, teal sea) 0.02–0.04.
 */
const MIN_COLOUR_SHARE = 0.012;
const NEUTRAL_ACCENT = "#e8e8e8";

/** @typedef {{ accent: string, contrast: string }} AccentResult */

/** @type {Map<string, Promise<AccentResult>>} */
const cache = new Map();
const CACHE_LIMIT = 30;

/** @param {number} r @param {number} g @param {number} b 0..255 → h 0..360, s/l 0..1 */
function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: h * 60, s, l };
}

/** @param {number} h 0..360 @param {number} s 0..1 @param {number} l 0..1 → "#rrggbb" */
function hslToHex(h, s, l) {
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (x) =>
    Math.round(x * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}

/** Relative luminance of "#rrggbb" (WCAG). */
function luminance(hex) {
  const ch = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

/** Black or white, whichever reads better on `hex`. */
export function contrastText(hex) {
  if (!/^#[0-9a-f]{6}$/i.test(hex || "")) return "#000000";
  const L = luminance(hex);
  // Contrast vs black = (L+0.05)/0.05, vs white = 1.05/(L+0.05)
  return (L + 0.05) / 0.05 >= 1.05 / (L + 0.05) ? "#000000" : "#ffffff";
}

/**
 * @param {Uint8ClampedArray} data RGBA pixels
 * @returns {AccentResult}
 */
export function accentFromPixels(data) {
  const buckets = Array.from({ length: HUE_BUCKETS }, () => ({ w: 0, x: 0, y: 0, s: 0, l: 0 }));
  let totalWeight = 0;
  let colourWeight = 0;

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue; // transparent pixels in PNG uploads
    const { h, s, l } = rgbToHsl(data[i], data[i + 1], data[i + 2]);
    totalWeight += 1;
    // Prefer vivid, mid-lightness pixels.
    const lightnessFit = 1 - Math.abs(l - 0.5) * 2; // 1 at 0.5, 0 at black/white
    const w = s * s * lightnessFit;
    if (w <= 0.01) continue;
    colourWeight += w;
    const b = buckets[Math.floor((h / 360) * HUE_BUCKETS) % HUE_BUCKETS];
    // Average hue as a vector so 359° and 1° do not average to 180°.
    const rad = (h * Math.PI) / 180;
    b.w += w;
    b.x += Math.cos(rad) * w;
    b.y += Math.sin(rad) * w;
    b.s += s * w;
    b.l += l * w;
  }

  if (totalWeight === 0 || colourWeight / totalWeight < MIN_COLOUR_SHARE) {
    return { accent: NEUTRAL_ACCENT, contrast: "#000000" };
  }

  // Score each bucket together with its neighbours so a hue split across two buckets still wins.
  let best = 0;
  let bestScore = -1;
  for (let i = 0; i < HUE_BUCKETS; i++) {
    const score =
      buckets[i].w +
      0.5 * (buckets[(i + 1) % HUE_BUCKETS].w + buckets[(i + HUE_BUCKETS - 1) % HUE_BUCKETS].w);
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }

  const b = buckets[best];
  let hue = (Math.atan2(b.y, b.x) * 180) / Math.PI;
  if (hue < 0) hue += 360;
  const sat = Math.min(1, Math.max(0.55, (b.s / b.w) * 1.15));
  // Light enough to pop on the dark tab bar, not so light it turns pastel-white.
  const light = Math.min(0.66, Math.max(0.52, b.l / b.w));
  const accent = hslToHex(hue, sat, light);
  return { accent, contrast: contrastText(accent) };
}

/**
 * @param {string} src image URL or data URL (same-origin, so the canvas is readable)
 * @returns {Promise<AccentResult>}
 */
export function extractAccent(src) {
  if (cache.has(src)) return cache.get(src);
  const promise = new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      try {
        const ratio = SAMPLE_WIDTH / (img.naturalWidth || SAMPLE_WIDTH);
        const w = SAMPLE_WIDTH;
        const h = Math.max(1, Math.round((img.naturalHeight || SAMPLE_WIDTH) * ratio));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) throw new Error("Canvas 2D context unavailable");
        ctx.drawImage(img, 0, 0, w, h);
        resolve(accentFromPixels(ctx.getImageData(0, 0, w, h).data));
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => reject(new Error("Wallpaper could not be loaded for colour sampling"));
    img.src = src;
  });
  // Failed attempts are not cached, so a later retry can succeed.
  promise.catch(() => cache.delete(src));
  cache.set(src, promise);
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
  return promise;
}
