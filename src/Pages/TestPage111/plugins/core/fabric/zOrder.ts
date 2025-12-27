import type { FabricObject } from "fabric";
import type { FabricPluginContext } from "../types";

function moveObjectToIndex(canvas: any, obj: FabricObject, targetIdx: number) {
  if (typeof canvas?.moveObjectTo === "function") {
    canvas.moveObjectTo(obj, targetIdx);
    return;
  }
  const anyObj = obj as any;
  if (typeof anyObj.moveTo === "function") {
    anyObj.moveTo(targetIdx);
    return;
  }
  if (typeof canvas?.bringObjectForward === "function") {
    while (canvas.getObjects().indexOf(obj) < targetIdx) {
      canvas.bringObjectForward(obj);
    }
  }
}

export function syncFollowersZOrder<T extends FabricObject = FabricObject>(
  ctx: FabricPluginContext,
  owner: FabricObject,
  followers: T[],
  options?: {
    place?: "above" | "below";
    sortKey?: (obj: T) => number;
  },
) {
  const c = ctx.canvas;
  if (!followers.length) return;

  const alive = followers.filter((m) => c.getObjects().includes(m));
  const sorted = [...alive];
  if (options?.sortKey) sorted.sort((a, b) => options.sortKey!(a) - options.sortKey!(b));

  const place = options?.place ?? "above";
  sorted.forEach((m, i) => {
    const ownerIdx = c.getObjects().indexOf(owner);
    if (ownerIdx < 0) return;
    const targetIdx =
      place === "above" ? ownerIdx + 1 + i : Math.max(0, ownerIdx - (sorted.length - i));
    moveObjectToIndex(c as any, m, targetIdx);
  });
}
