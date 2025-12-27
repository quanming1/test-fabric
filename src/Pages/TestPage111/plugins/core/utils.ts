export function createId(prefix = "id") {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

export function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

/**
 * 反比缩放策略：返回一个“相对 owner scale 的倍率”
 * 例如 power=2 表示：倍率 = 1 / zoom^2
 */
export function invZoomScalePolicy(opts?: { power?: number; min?: number; max?: number }) {
  const power = opts?.power ?? 1;
  const min = opts?.min ?? -Infinity;
  const max = opts?.max ?? Infinity;
  return (canvasZoom: number) => {
    const z = Math.max(0.001, canvasZoom || 1);
    const raw = 1 / Math.pow(z, power);
    return clamp(raw, min, max);
  };
}