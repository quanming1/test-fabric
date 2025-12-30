import { Point } from "fabric";
import type { Canvas, FabricObject } from "fabric";
import type { PersistMeta } from "../types";
import { ensureId } from "../utils/id";
import { isScreenFixed, registerScreenFixed, syncScreenFixedObjects } from "../utils/screenFixed";
import type { FollowerManager } from "./follow";

export const DEFAULT_OBJECT_EXTRA_PROPS = [
  "__id",
  "__screenFixed",
  "__screenFixedBaseStrokeWidth",
  "__follow",
  "__meta",
  "__normalRect",
] as const;

type FixedSnapshot = {
  obj: FabricObject;
  scaleX?: number;
  scaleY?: number;
  strokeWidth?: number;
};

/**
 * 导出前把 screenFixed 对象“归一化”到 zoom=1 的基准状态，
 * 这样 JSON 在任意环境导入后都可以通过 rehydrate 正确恢复。
 */
function withNormalizedScreenFixed(canvas: Canvas, fn: () => any) {
  const snapshots: FixedSnapshot[] = [];
  canvas.getObjects().forEach((o) => {
    if (!isScreenFixed(o)) return;
    const baseStrokeWidth = (o as any).__screenFixedBaseStrokeWidth ?? o.strokeWidth;
    snapshots.push({ obj: o, scaleX: o.scaleX, scaleY: o.scaleY, strokeWidth: o.strokeWidth });
    o.set({
      scaleX: 1,
      scaleY: 1,
      ...(typeof baseStrokeWidth === "number" ? { strokeWidth: baseStrokeWidth } : null),
    });
    o.setCoords();
  });

  try {
    return fn();
  } finally {
    snapshots.forEach((s) => {
      s.obj.set({ scaleX: s.scaleX, scaleY: s.scaleY, strokeWidth: s.strokeWidth });
      s.obj.setCoords();
    });
  }
}

export function exportCanvasToJSONString(canvas: Canvas, extraProps = DEFAULT_OBJECT_EXTRA_PROPS) {
  canvas.getObjects().forEach((o) => ensureId(o));
  const data = withNormalizedScreenFixed(canvas, () => (canvas as any).toJSON([...extraProps]));
  return JSON.stringify(data, null, 2);
}

export async function importCanvasFromJSONString(
  canvas: Canvas,
  json: string,
  deps: { followerMgr: FollowerManager },
) {
  await (canvas as any).loadFromJSON(json, (o: any, obj: any) => {
    // 关键：fabric 的 enliven 过程不保证保留自定义字段，这里用 reviver 强制恢复元数据
    DEFAULT_OBJECT_EXTRA_PROPS.forEach((k) => {
      if (o && Object.prototype.hasOwnProperty.call(o, k)) {
        obj[k] = o[k];
      }
    });
  });
  // 载入后 Fabric 会自动 renderOnAddRemove=false 地清空+add，这里主动渲染一次
  canvas.requestRenderAll();
  rehydrateCanvas(canvas, deps);
  canvas.requestRenderAll();
}

export function rehydrateCanvas(canvas: Canvas, deps: { followerMgr: FollowerManager }) {
  const idMap = new Map<string, FabricObject>();
  canvas.getObjects().forEach((o) => {
    const id = ensureId(o);
    idMap.set(id, o);
  });

  // 1) 重建 follow 关系（把 follower 绑定回 owner）
  canvas.getObjects().forEach((o) => {
    const meta = o as any as PersistMeta;
    const follow = meta.__follow;
    if (!follow?.ownerId) return;
    const owner = idMap.get(follow.ownerId);
    if (!owner) return;
    if (follow.mode === "localPoint") {
      deps.followerMgr.bindLocalPoint(owner, o, new Point(follow.local.x, follow.local.y));
    }
  });

  // 2) 恢复 screenFixed：重新注册 + 按当前 zoom 同步视觉
  canvas.getObjects().forEach((o) => {
    const m = o as any;
    if (!m.__screenFixed) return;
    registerScreenFixed(o, { baseStrokeWidth: m.__screenFixedBaseStrokeWidth });
  });
  syncScreenFixedObjects(canvas, canvas.getZoom());
}
