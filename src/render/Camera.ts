// Pure camera-zoom math, deliberately free of any PixiJS dependency — both
// wheel zoom (desktop) and pinch zoom (touch) in IsoRenderer.ts share this
// one implementation, and it can be unit-tested without a browser.

export interface CameraState {
  x: number;
  y: number;
  scale: number;
}

const MIN_SCALE = 0.5;
const MAX_SCALE = 2.2;

/**
 * Zooms the camera to `targetScale` (clamped to the camera's zoom bounds),
 * keeping whatever world-space point was under (anchorX, anchorY) still
 * under it afterward — "zoom toward the cursor" for a wheel event, "zoom
 * toward the pinch midpoint" for a touch gesture.
 */
export function zoomCameraTo(camera: CameraState, anchorX: number, anchorY: number, targetScale: number): CameraState {
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, targetScale));
  const worldXBefore = (anchorX - camera.x) / camera.scale;
  const worldYBefore = (anchorY - camera.y) / camera.scale;
  return {
    scale,
    x: anchorX - worldXBefore * scale,
    y: anchorY - worldYBefore * scale,
  };
}

export interface ScreenPoint {
  x: number;
  y: number;
}

export function pointerMidpoint(points: ScreenPoint[]): ScreenPoint {
  const x = points.reduce((sum, p) => sum + p.x, 0) / points.length;
  const y = points.reduce((sum, p) => sum + p.y, 0) / points.length;
  return { x, y };
}

export function pointerDistance(a: ScreenPoint, b: ScreenPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
