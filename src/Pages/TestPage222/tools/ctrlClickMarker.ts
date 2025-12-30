import { Circle, Point } from "fabric";
import type { Canvas, FabricObject, Rect } from "fabric";
import type { NormalRectMeta } from "../types";
import { getScenePointFromEvent } from "../utils/pointer";
import { isScreenFixed, registerScreenFixed, syncScreenFixedObjects } from "../utils/screenFixed";
import type { FollowerManager } from "../lib/follow";

function isNormalRect(o: FabricObject | undefined | null): o is Rect {
  if (!o) return false;
  if (isScreenFixed(o)) return false;
  if (o.type !== "rect") return false;
  return Boolean((o as any as NormalRectMeta).__normalRect);
}

export function attachCtrlClickMarker(canvas: Canvas, followerMgr: FollowerManager) {
  const onMouseDown = (opt: any) => {
    const e = opt.e as MouseEvent;
    if (e.button !== 0) return;
    if (!e.ctrlKey) return;

    const target = opt.target as FabricObject | undefined;
    if (!isNormalRect(target)) return;

    e.preventDefault();
    e.stopPropagation();

    const scenePoint = getScenePointFromEvent(canvas as any, e);

    const mk = new Circle({
      originX: "center",
      originY: "center",
      left: scenePoint.x,
      top: scenePoint.y,
      radius: 6,
      fill: "rgba(255, 77, 79, 0.95)",
      stroke: "#ffffff",
      strokeWidth: 2,
      strokeUniform: true,
      // 点不抢事件，避免挡住继续 ctrl 点
      selectable: false,
      evented: false,
      objectCaching: false,
    });

    (mk as any).__followOwner = target;
    registerScreenFixed(mk);
    // 绑定 follower 到 owner：以 owner 的 local 坐标作为锚点，多选变形也能实时跟随
    followerMgr.bindScenePointAsLocal(target, mk, scenePoint);

    canvas.add(mk);
    syncScreenFixedObjects(canvas, canvas.getZoom());
    canvas.requestRenderAll();
  };

  canvas.on("mouse:down", onMouseDown);

  return () => {
    canvas.off("mouse:down", onMouseDown);
  };
}
