import { Rect } from "fabric";
import { getScenePointFromEvent } from "../utils/pointer";

export type RectDrawOptions = {
  getMode: () => "select" | "rect";
  setCursor: (cursor: string) => void;
};

export function attachRectDrawTool(canvas: import("fabric").Canvas, opts: RectDrawOptions) {
  let rect: Rect | null = null;
  let startX = 0;
  let startY = 0;
  let isDrawing = false;

  const onMouseDown = (opt: any) => {
    const e = opt.e as MouseEvent;
    if (e.button !== 0) return;
    // Ctrl+左键留给打点交互
    if (e.ctrlKey) return;
    if (opts.getMode() !== "rect") return;

    const p = getScenePointFromEvent(canvas as any, e);
    rect = new Rect({
      left: p.x,
      top: p.y,
      width: 1,
      height: 1,
      fill: "rgba(24, 144, 255, 0.16)",
      stroke: "rgba(24, 144, 255, 0.95)",
      strokeWidth: 2,
      transparentCorners: false,
      cornerColor: "#1677ff",
      cornerStyle: "circle",
      objectCaching: false,
      selectable: false,
      evented: false,
    });

    canvas.add(rect);
    startX = p.x;
    startY = p.y;
    isDrawing = true;
    opts.setCursor("crosshair");
  };

  const onMouseMove = (opt: any) => {
    if (!isDrawing || !rect) return;
    const e = opt.e as MouseEvent;
    const p = getScenePointFromEvent(canvas as any, e);

    const left = Math.min(startX, p.x);
    const top = Math.min(startY, p.y);
    const w = Math.abs(p.x - startX);
    const h = Math.abs(p.y - startY);
    rect.set({ left, top, width: w, height: h });
    rect.setCoords();
    canvas.requestRenderAll();
  };

  const onMouseUp = () => {
    if (!isDrawing) return;
    isDrawing = false;

    if (!rect) return;
    const w = rect.width ?? 0;
    const h = rect.height ?? 0;
    if (w < 6 || h < 6) {
      canvas.remove(rect);
      rect = null;
      canvas.requestRenderAll();
      return;
    }

    rect.set({ selectable: true, evented: true });
    (rect as any).__normalRect = true;
    // 业务可扩展元数据：会随 JSON 一起导入导出
    (rect as any).__meta = {
      kind: "rect",
      role: "normal",
      createdAt: Date.now(),
    };
    canvas.setActiveObject(rect);
    rect = null;
    canvas.requestRenderAll();
  };

  canvas.on("mouse:down", onMouseDown);
  canvas.on("mouse:move", onMouseMove);
  canvas.on("mouse:up", onMouseUp);

  return () => {
    canvas.off("mouse:down", onMouseDown);
    canvas.off("mouse:move", onMouseMove);
    canvas.off("mouse:up", onMouseUp);
  };
}
