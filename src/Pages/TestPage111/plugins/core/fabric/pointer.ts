import { Point } from "fabric";

/**
 * 从原生事件获取 scene plane 坐标，兼容不同 Fabric 版本（getScenePoint/getPointer/restorePointerVpt）。
 * 说明：fabric 的 event/坐标 API 在不同版本差异很大，所以这里用 any。
 */
export function getScenePointFromEvent(canvas: any, e: MouseEvent | PointerEvent) {
  if (typeof canvas?.getScenePoint === "function") {
    const p = canvas.getScenePoint(e);
    return new Point(p.x, p.y);
  }
  if (typeof canvas?.getPointer === "function") {
    const p = canvas.getPointer(e);
    return new Point(p.x, p.y);
  }
  const vp = new Point((e as any).offsetX ?? 0, (e as any).offsetY ?? 0);
  if (typeof canvas?.restorePointerVpt === "function") {
    const p = canvas.restorePointerVpt(vp);
    return new Point(p.x, p.y);
  }
  return vp;
}
