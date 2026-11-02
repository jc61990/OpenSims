// Pure color math for the day/night ambient tint — deliberately free of any
// PixiJS dependency so it can be unit-tested without a browser. IsoRenderer
// draws the result as a full-viewport overlay on top of the scene.

interface TintKeyframe {
  /** Minute of the 24-hour sim day (0-1440). */
  minute: number;
  color: number;
  alpha: number;
}

// Sparse keyframes across the day; computeDayNightTint linearly interpolates
// between whichever two bracket the current time. The last keyframe (1440)
// mirrors the first (0) so midnight loops around smoothly instead of
// snapping.
const KEYFRAMES: TintKeyframe[] = [
  { minute: 0, color: 0x0a1230, alpha: 0.35 }, // midnight
  { minute: 300, color: 0x0a1230, alpha: 0.35 }, // 5:00 AM — still deep night
  { minute: 390, color: 0xff9d5c, alpha: 0.22 }, // 6:30 AM — dawn
  { minute: 480, color: 0xfff4e0, alpha: 0 }, // 8:00 AM — full daylight
  { minute: 1020, color: 0xfff4e0, alpha: 0 }, // 5:00 PM — still full daylight
  { minute: 1110, color: 0xff8a4c, alpha: 0.22 }, // 6:30 PM — dusk
  { minute: 1200, color: 0x2a2a55, alpha: 0.3 }, // 8:00 PM — evening
  { minute: 1320, color: 0x0a1230, alpha: 0.35 }, // 10:00 PM — night
  { minute: 1440, color: 0x0a1230, alpha: 0.35 }, // wraps back to midnight
];

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  const r = Math.round(lerp(ar, br, t));
  const g = Math.round(lerp(ag, bg, t));
  const bl = Math.round(lerp(ab, bb, t));
  return (r << 16) | (g << 8) | bl;
}

export interface DayNightTint {
  color: number;
  /** 0 = no tint (full daylight clarity), higher = a stronger wash over the scene. */
  alpha: number;
}

/** The ambient tint for a given minute of the sim day (0-1440, wraps). */
export function computeDayNightTint(minuteOfDay: number): DayNightTint {
  const m = ((minuteOfDay % 1440) + 1440) % 1440;
  for (let i = 0; i < KEYFRAMES.length - 1; i++) {
    const a = KEYFRAMES[i];
    const b = KEYFRAMES[i + 1];
    if (m >= a.minute && m <= b.minute) {
      const t = (m - a.minute) / (b.minute - a.minute);
      return { color: lerpColor(a.color, b.color, t), alpha: lerp(a.alpha, b.alpha, t) };
    }
  }
  // Unreachable given KEYFRAMES spans 0..1440, but keeps the return type total.
  return { color: KEYFRAMES[0].color, alpha: KEYFRAMES[0].alpha };
}
