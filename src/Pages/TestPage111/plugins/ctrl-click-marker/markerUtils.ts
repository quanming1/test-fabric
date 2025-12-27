import { FabricObject, Point, util } from "fabric";
import type { FabricPluginContext } from "../core/types";
import { createId } from "../core/utils";

export class MarkerUtils {
  // ---------------------------
  // 基础：数值/类型判断（业务无关）
  // ---------------------------
  static clamp(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, n));
  }

  /**
   * FabricObject 的 type 是字符串，例如 "image"/"rect"/...
   * 业务侧如果要做更精确的 instance 判断，可以自己叠加 ctor check。
   */
  static isType(obj: unknown, type: string): obj is FabricObject {
    const o = obj as any;
    return !!o && o.type === type;
  }

  // ---------------------------
  // 基础：在 object 上挂载 bag（__meta/__binding/...），业务无关
  // ---------------------------
  static getBag<T extends Record<string, any> = Record<string, any>>(
    obj: FabricObject,
    bagKey: string,
  ): T | undefined {
    return (obj as any)[bagKey] as T | undefined;
  }

  static ensureBag<T extends Record<string, any> = Record<string, any>>(
    obj: FabricObject,
    bagKey: string,
  ): T {
    return ((obj as any)[bagKey] ??= {}) as unknown as T;
  }

  static setBag<T extends Record<string, any> = Record<string, any>>(
    obj: FabricObject,
    bagKey: string,
    bag: T | undefined,
  ) {
    (obj as any)[bagKey] = bag;
  }

  // ---------------------------
  // 通用：id / meta / binding（业务无关）
  // ---------------------------
  static ensureId(obj: FabricObject, prefix: string, bagKey = "__meta", idKey = "id") {
    const meta = MarkerUtils.ensureBag<Record<string, any>>(obj, bagKey);
    meta[idKey] ??= createId(prefix);
    return meta[idKey] as string;
  }

  static getId(obj: FabricObject, bagKey = "__meta", idKey = "id") {
    const meta = MarkerUtils.getBag<Record<string, any>>(obj, bagKey);
    return meta?.[idKey] as string | undefined;
  }

  static getBinding<T = any>(obj: FabricObject, bagKey = "__binding"): T | undefined {
    return MarkerUtils.getBag<T & Record<string, any>>(obj, bagKey);
  }

  static setBinding<T = any>(obj: FabricObject, binding: T, bagKey = "__binding") {
    MarkerUtils.setBag(obj, bagKey, binding as unknown as Record<string, any>);
  }

  // ---------------------------
  // 变换：local/object <-> scene plane（业务无关）
  // ---------------------------
  static calcSceneTransformBasics(owner: FabricObject) {
    const m = owner.calcTransformMatrix(); // object -> scene plane
    const scaleX = Math.hypot(m[0], m[1]);
    const scaleY = Math.hypot(m[2], m[3]);
    const angle = (Math.atan2(m[1], m[0]) * 180) / Math.PI;
    return { matrix: m, scaleX, scaleY, angle };
  }

  static localToScenePoint(owner: FabricObject, localX: number, localY: number) {
    const m = owner.calcTransformMatrix();
    return util.transformPoint(new Point(localX, localY), m);
  }

  static sceneToLocalPoint(owner: FabricObject, sceneX: number, sceneY: number) {
    const inv = util.invertTransform(owner.calcTransformMatrix());
    return util.transformPoint(new Point(sceneX, sceneY), inv);
  }

  /**
   * 从原生事件获取 scene plane 坐标，兼容不同 Fabric 版本（getScenePoint/getPointer/restorePointerVpt）。
   */
  static getScenePointFromEvent(canvas: any, e: MouseEvent | PointerEvent) {
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

  // ---------------------------
  // follower：让任意对象跟随 owner（业务无关，可注入 scalePolicy）
  // ---------------------------
  static invZoomScalePolicy(opts?: { power?: number; min?: number; max?: number }) {
    const power = opts?.power ?? 1;
    const min = opts?.min ?? -Infinity;
    const max = opts?.max ?? Infinity;
    return (canvasZoom: number) => {
      const z = Math.max(0.001, canvasZoom || 1);
      const raw = 1 / Math.pow(z, power);
      return MarkerUtils.clamp(raw, min, max);
    };
  }

  static applyFollowerTransformByLocalPoint(
    follower: FabricObject,
    owner: FabricObject,
    localX: number,
    localY: number,
    options?: {
      canvasZoom?: number;
      originX?: FabricObject["originX"];
      originY?: FabricObject["originY"];
      inheritAngle?: boolean;
      scalePolicy?: (canvasZoom: number) => number; // 返回一个“相对 owner scale 的倍率”
      extraScale?: number; // 额外倍率（默认 1）
    },
  ) {
    const { matrix, scaleX, scaleY, angle } = MarkerUtils.calcSceneTransformBasics(owner);
    const scenePt = util.transformPoint(new Point(localX, localY), matrix);

    const z = Math.max(0.001, options?.canvasZoom ?? 1);
    const base = options?.scalePolicy ? options.scalePolicy(z) : 1;
    const extra = options?.extraScale ?? 1;
    const mul = base * extra;

    const patch: any = {
      left: scenePt.x,
      top: scenePt.y,
      scaleX: scaleX * mul,
      scaleY: scaleY * mul,
    };
    if (options?.originX != null) patch.originX = options.originX;
    if (options?.originY != null) patch.originY = options.originY;
    if (options?.inheritAngle !== false) patch.angle = angle;
    follower.set(patch);
    follower.setCoords();
  }

  static applyFollowerTransformFromBinding<
    TBinding extends { localX: number; localY: number } = { localX: number; localY: number },
  >(
    follower: FabricObject,
    owner: FabricObject,
    options?: Parameters<typeof MarkerUtils.applyFollowerTransformByLocalPoint>[4],
    bindingKey = "__binding",
  ) {
    const binding = MarkerUtils.getBinding<TBinding>(follower, bindingKey);
    if (!binding) return;
    MarkerUtils.applyFollowerTransformByLocalPoint(
      follower,
      owner,
      binding.localX,
      binding.localY,
      options,
    );
  }

  // ---------------------------
  // z-order：把 followers 放到 owner 上方/下方并保持顺序（业务无关）
  // ---------------------------
  private static moveObjectToIndex(canvas: any, obj: FabricObject, targetIdx: number) {
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
      // best-effort: bring forward until index >= targetIdx
      while (canvas.getObjects().indexOf(obj) < targetIdx) {
        canvas.bringObjectForward(obj);
      }
    }
  }

  static syncFollowersZOrder<T extends FabricObject = FabricObject>(
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

    // Keep followers around owner, while preserving follower internal order.
    const alive = followers.filter((m) => c.getObjects().includes(m));
    const sorted = [...alive];
    if (options?.sortKey) {
      sorted.sort((a, b) => options.sortKey!(a) - options.sortKey!(b));
    }

    const place = options?.place ?? "above";
    sorted.forEach((m, i) => {
      // 注意：移动 followers 可能改变 owner 的 index（尤其 follower 原本在 owner 前面时）
      // 所以这里每次都重新取一次 ownerIdx，确保 placement 稳定。
      const ownerIdx = c.getObjects().indexOf(owner);
      if (ownerIdx < 0) return;
      const targetIdx =
        place === "above" ? ownerIdx + 1 + i : Math.max(0, ownerIdx - (sorted.length - i));
      MarkerUtils.moveObjectToIndex(c as any, m, targetIdx);
    });
  }
}
