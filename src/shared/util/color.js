// Color helpers --------------------------------------------------------------

/** Convert #rrggbb -> {r,g,b} */
export const hexToRgb = (hex) => {
  const h = hex.replace(/^#/, "");
  if (h.length !== 6) throw new Error(`Invalid hex: ${hex}`);
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
};

/** Convert {r,g,b} -> #rrggbb */
export const rgbToHex = ({ r, g, b }) => `#${[r, g, b].map((x) => clamp(Math.round(x), 0, 255).toString(16).padStart(2, "0")).join("")}`;

/** RGB -> HSL (all 0..1). */
export const rgbToHsl = ({ r, g, b }) => {
  (r /= 255), (g /= 255), (b /= 255);
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  let h,
    s,
    l = (max + min) / 2;
  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }
  return { h, s, l };
};

/** HSL -> RGB (h,s,l in 0..1). */
export const hslToRgb = ({ h, s, l }) => {
  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  let r, g, b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return { r: r * 255, g: g * 255, b: b * 255 };
};

/** Adjust lightness by delta (-1..1), preserving hue & saturation. */
export const adjustHexLightness = (hex, delta) => {
  const hsl = rgbToHsl(hexToRgb(hex));
  hsl.l = clamp(hsl.l + delta, 0, 1);
  return rgbToHex(hslToRgb(hsl));
};

export function randomHexColor() {
  const n = Math.floor(Math.random() * 0xffffff); // 0 to 16777215
  return `#${n.toString(16).padStart(6, "0")}`;
}
