import { Point } from "fabric";

export type PanZoomOptions = {
  getCanvas: () => import("fabric").Canvas | null;
  getMode: () => "select" | "rect";
  isSpaceDown: () => boolean;
  setCursor: (cursor: string) => void;
  zoomToPoint: (nextZoom: number, point: Point) => void;
};

export function attachPanZoom(canvas: import("fabric").Canvas, opts: PanZoomOptions) {
  let isPanning = false;
  let lastX = 0;
  let lastY = 0;
  let startedBy: "space" | "right" = "space";

  const startPan = (e: MouseEvent, by: "space" | "right") => {
    isPanning = true;
    startedBy = by;
    lastX = e.clientX;
    lastY = e.clientY;
    canvas.discardActiveObject();
    canvas.selection = false;
    opts.setCursor("grabbing");
  };

  const endPan = () => {
    if (!isPanning) return;
    isPanning = false;
    canvas.selection = opts.getMode() === "select";
    opts.setCursor(
      opts.isSpaceDown() ? "grab" : opts.getMode() === "rect" ? "crosshair" : "default",
    );
  };

  const onMouseDown = (opt: any) => {
    const e = opt.e as MouseEvent;

    // 右键平移
    if (e.button === 2) {
      e.preventDefault();
      e.stopPropagation();
      startPan(e, "right");
      return;
    }

    // 空格 + 左键 平移
    if (e.button === 0 && opts.isSpaceDown()) {
      e.preventDefault();
      e.stopPropagation();
      startPan(e, "space");
      return;
    }
  };

  const onMouseMove = (opt: any) => {
    if (!isPanning) return;
    const e = opt.e as MouseEvent;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    const vpt = canvas.viewportTransform;
    if (!vpt) return;
    vpt[4] += dx;
    vpt[5] += dy;
    canvas.requestRenderAll();
  };

  const onMouseUp = (opt: any) => {
    if (!isPanning) return;
    const e = opt.e as MouseEvent;
    if (startedBy === "right" ? e.button === 2 : e.button === 0) {
      endPan();
    }
  };

  const onMouseWheel = (opt: any) => {
    const e = opt.e as WheelEvent;
    e.preventDefault();
    e.stopPropagation();
    const delta = e.deltaY;
    const curr = canvas.getZoom();
    const next = Math.min(6, Math.max(0.2, curr * Math.pow(0.999, delta)));
    opts.zoomToPoint(next, new Point(e.offsetX, e.offsetY));
  };

  canvas.on("mouse:down", onMouseDown);
  canvas.on("mouse:move", onMouseMove);
  canvas.on("mouse:up", onMouseUp);
  canvas.on("mouse:wheel", onMouseWheel);

  return () => {
    canvas.off("mouse:down", onMouseDown);
    canvas.off("mouse:move", onMouseMove);
    canvas.off("mouse:up", onMouseUp);
    canvas.off("mouse:wheel", onMouseWheel);
  };
}
