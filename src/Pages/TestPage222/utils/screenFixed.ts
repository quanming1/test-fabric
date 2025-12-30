import type { Canvas, FabricObject } from "fabric";
import type { ScreenFixedMeta } from "../types";

export function isScreenFixed(o: FabricObject) {
  const meta = o as any as ScreenFixedMeta;
  return Boolean(meta.__screenFixed);
}

export function syncScreenFixedObjects(canvas: Canvas, zoom: number) {
  canvas.getObjects().forEach((o) => {
    if (!isScreenFixed(o)) return;
    const meta = o as any as ScreenFixedMeta;
    // 固定视觉大小：对 viewport zoom 做反向缩放
    const next: Record<string, any> = { scaleX: 1 / zoom, scaleY: 1 / zoom };

    // 如果该对象有 stroke（或显式注册了 baseStrokeWidth），则同步把描边也固定到屏幕
    const hasStroke = Boolean(o.stroke) || typeof o.strokeWidth === "number";
    const baseStrokeWidth =
      meta.__screenFixedBaseStrokeWidth ?? (hasStroke ? o.strokeWidth ?? 1 : undefined);
    if (typeof baseStrokeWidth === "number") {
      meta.__screenFixedBaseStrokeWidth = baseStrokeWidth;
      next.strokeWidth = baseStrokeWidth / zoom;
    }

    o.set(next);
    o.setCoords();
  });
}

export function registerScreenFixed(o: FabricObject, opts?: { baseStrokeWidth?: number }) {
  const meta = o as any as ScreenFixedMeta;
  meta.__screenFixed = true;
  if (typeof opts?.baseStrokeWidth === "number") {
    meta.__screenFixedBaseStrokeWidth = opts.baseStrokeWidth;
  } else if (typeof o.strokeWidth === "number") {
    meta.__screenFixedBaseStrokeWidth = o.strokeWidth;
  }
}
