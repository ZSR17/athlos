// WCAG relative luminance of a #rrggbb colour.
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

// Text colour to put on top of `bg`: whichever of near-black / white reads better.
export function onColor(bg: string): string {
  return contrastRatio(bg, '#0E1012') >= contrastRatio(bg, '#FFFFFF') ? '#0E1012' : '#FFFFFF';
}

function hue(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (d === 0) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

// Primary and secondary muscle colours must stay distinguishable on the body map. Two shades of the
// same hue blur together even with some lightness gap (e.g. bright vs dark orange), and colours of
// almost equal lightness are hard to tell apart for colour-blind users whatever the hue.
export function tooSimilar(a: string, b: string): boolean {
  const ratio = contrastRatio(a, b);
  const dh = Math.abs(hue(a) - hue(b));
  return ratio < 1.4 || (Math.min(dh, 360 - dh) < 30 && ratio < 3);
}

export function isHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}
