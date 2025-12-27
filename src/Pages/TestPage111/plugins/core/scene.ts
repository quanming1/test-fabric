import type { Canvas, FabricObject } from "fabric";
import type { FabricPluginContext } from "./types";
import { Element, getElementMetaFromObject } from "./element";
import { ElementRegistry } from "./registry";
import type { ScenePointerEvent, ScenePointerEventName } from "./events";

export type SceneOptions = {
  /**
   * 是否自动监听 zoom 变化并广播给元素/behavior
   */
  watchZoom?: boolean;
  /**
   * 是否在 canvas object:added 时，自动把带 __fx 元信息的对象 wrap 成 Element
   */
  autoWrapFromObjectMeta?: boolean;
};

export type SceneEventMap = {
  "element:added": { scene: Scene; element: Element };
  "element:removed": { scene: Scene; element: Element };
};

type SceneEventName = keyof SceneEventMap;
type SceneListener<N extends SceneEventName> = (payload: SceneEventMap[N]) => void;

/**
 * Scene：你的“上层框架”的核心运行时
 * - 管理元素生命周期（add/remove/find）
 * - 统一事件路由（Fabric -> Element/Behavior）
 * - 提供通用关系能力（例如 follow：A 跟随 B）
 */
export class Scene {
  readonly ctx: FabricPluginContext;
  readonly canvas: Canvas;
  readonly registry: ElementRegistry;

  private byObject = new Map<FabricObject, Element>();
  private byId = new Map<string, Element>();

  // ownerId -> followers
  private followersByOwnerId = new Map<string, Set<Element>>();

  private lastZoom: number | null = null;
  private zoomRaf: number | null = null;

  private disposer: (() => void) | null = null;
  private restoreZOrderPatch: (() => void) | null = null;
  private listeners = new Map<SceneEventName, Set<Function>>();
  private opts: Required<Pick<SceneOptions, "watchZoom" | "autoWrapFromObjectMeta">>;

  constructor(ctx: FabricPluginContext, opts?: SceneOptions) {
    this.ctx = ctx;
    this.canvas = ctx.canvas;
    this.registry = new ElementRegistry();
    this.opts = {
      watchZoom: opts?.watchZoom !== false,
      autoWrapFromObjectMeta: opts?.autoWrapFromObjectMeta !== false,
    };

    this.restoreZOrderPatch = this.patchZOrderApis();
    this.attachCanvasEvents({ watchZoom: this.opts.watchZoom });
  }

  dispose() {
    this.disposer?.();
    this.disposer = null;
    this.restoreZOrderPatch?.();
    this.restoreZOrderPatch = null;
    this.byObject.forEach((el) => el._detach());
    this.byObject.clear();
    this.byId.clear();
    this.followersByOwnerId.clear();
    this.listeners.clear();
  }

  on<N extends SceneEventName>(name: N, fn: SceneListener<N>) {
    const set = this.listeners.get(name) ?? new Set();
    set.add(fn as any);
    this.listeners.set(name, set);
    return () => this.off(name, fn);
  }

  off<N extends SceneEventName>(name: N, fn: SceneListener<N>) {
    const set = this.listeners.get(name);
    if (!set) return;
    set.delete(fn as any);
    if (set.size === 0) this.listeners.delete(name);
  }

  private emit<N extends SceneEventName>(name: N, payload: SceneEventMap[N]) {
    const set = this.listeners.get(name);
    if (!set) return;
    set.forEach((fn) => (fn as any)(payload));
  }

  getZoom() {
    return this.canvas.getZoom();
  }

  add(el: Element, options?: { addToCanvas?: boolean }) {
    if (this.byId.has(el.id)) throw new Error(`Element id already exists: ${el.id}`);
    this.byObject.set(el.obj, el);
    this.byId.set(el.id, el);
    el._attach(this);
    this.emit("element:added", { scene: this, element: el });

    if (options?.addToCanvas) this.canvas.add(el.obj as any);
    return el;
  }

  remove(elOrId: Element | string) {
    const el = typeof elOrId === "string" ? this.byId.get(elOrId) : elOrId;
    if (!el) return;

    // detach follow registrations
    this.followersByOwnerId.forEach((set) => set.delete(el));
    this.followersByOwnerId.delete(el.id);

    this.byObject.delete(el.obj);
    this.byId.delete(el.id);
    el._detach();
    this.emit("element:removed", { scene: this, element: el });
  }

  findById(id: string) {
    return this.byId.get(id) ?? null;
  }

  findByObject(obj: FabricObject | undefined | null) {
    if (!obj) return null;
    return this.byObject.get(obj) ?? null;
  }

  /**
   * 当某个对象“先进入 canvas、后补上 __fx 元信息”时，用它来补一次注册。
   * 返回已存在/新创建的 Element；如果对象没有足够的元信息则返回 null。
   */
  ensureElementFromObject(obj: FabricObject) {
    const existed = this.findByObject(obj);
    if (existed) return existed;
    const meta = getElementMetaFromObject(obj);
    if (!meta?.id || !meta?.type) return null;

    const byId = this.findById(meta.id);
    if (byId) {
      // id 已被占用：为了不让框架层“自动 wrap”把应用搞崩，这里选择跳过
      //（也可以在未来提供策略：rename / throw / warn）
      return byId.obj === obj ? byId : null;
    }

    try {
      return this.add(new Element({ obj, type: meta.type, id: meta.id }));
    } catch {
      return null;
    }
  }

  /**
   * 逐步迁移用：把一个 FabricObject 包装成 Element 并注册到 Scene
   */
  wrapAndAdd(obj: FabricObject, type = "fabric") {
    const el = this.registry.wrap(obj, type);
    return this.add(el);
  }

  getElements() {
    return Array.from(this.byId.values());
  }

  getElementsByType(type: string) {
    return this.getElements().filter((e) => e.type === type);
  }

  // ---------------------------
  // follow 关系（供 FollowBehavior 调用）
  // ---------------------------
  _registerFollower(ownerId: string, follower: Element) {
    const set = this.followersByOwnerId.get(ownerId) ?? new Set<Element>();
    set.add(follower);
    this.followersByOwnerId.set(ownerId, set);
  }

  _unregisterFollower(ownerId: string, follower: Element) {
    const set = this.followersByOwnerId.get(ownerId);
    if (!set) return;
    set.delete(follower);
    if (set.size === 0) this.followersByOwnerId.delete(ownerId);
  }

  _emitOwnerTransformed(owner: Element) {
    const followers = this.followersByOwnerId.get(owner.id);
    if (!followers || followers.size === 0) return;
    followers.forEach((f) => f._notifyOwnerTransformed(owner));
  }

  _getFollowers(ownerId: string) {
    return Array.from(this.followersByOwnerId.get(ownerId) ?? []);
  }

  // ---------------------------
  // canvas events
  // ---------------------------
  private attachCanvasEvents(opts: { watchZoom: boolean }) {
    const c = this.canvas as any;

    const onObjectAdded = (raw: any) => {
      if (!this.opts.autoWrapFromObjectMeta) return;
      const obj = raw?.target as FabricObject | undefined;
      if (!obj) return;
      this.ensureElementFromObject(obj);
    };
    c.on("object:added", onObjectAdded);

    const onPointer = (name: ScenePointerEventName) => (raw: any) => {
      const e = (raw?.e ?? raw) as MouseEvent | PointerEvent;
      const target = raw?.target as FabricObject | undefined;
      const el = this.findByObject(target);
      if (!el) return;
      const ev: ScenePointerEvent = { name, scene: this, raw, e, target };
      el._handleSceneEvent(ev);
    };

    const onMouseDown = onPointer("pointer:down");
    const onMouseUp = onPointer("pointer:up");
    const onMouseMove = onPointer("pointer:move");
    const onMouseOver = onPointer("pointer:over");
    const onMouseOut = onPointer("pointer:out");

    c.on("mouse:down", onMouseDown);
    c.on("mouse:up", onMouseUp);
    c.on("mouse:move", onMouseMove);
    c.on("mouse:over", onMouseOver);
    c.on("mouse:out", onMouseOut);

    const onObjectTransforming = (raw: any) => {
      const obj = raw?.target as FabricObject | undefined;
      const owner = this.findByObject(obj);
      if (!owner) return;
      this._emitOwnerTransformed(owner);
    };
    c.on("object:moving", onObjectTransforming);
    c.on("object:scaling", onObjectTransforming);
    c.on("object:rotating", onObjectTransforming);
    c.on("object:skewing", onObjectTransforming);
    c.on("object:modified", onObjectTransforming);

    const onObjectRemoved = (raw: any) => {
      const obj = raw?.target as FabricObject | undefined;
      const el = this.findByObject(obj);
      if (!el) return;
      this.remove(el);
    };
    c.on("object:removed", onObjectRemoved);

    const onAfterRender = () => {
      if (!opts.watchZoom) return;
      const z = this.canvas.getZoom();
      if (this.lastZoom == null) this.lastZoom = z;
      if (Math.abs(z - this.lastZoom) < 1e-6) return;
      this.lastZoom = z;

      if (this.zoomRaf != null) cancelAnimationFrame(this.zoomRaf);
      this.zoomRaf = requestAnimationFrame(() => {
        this.zoomRaf = null;
        this.byId.forEach((el) => el._notifyZoomChanged(z));
      });
    };
    c.on("after:render", onAfterRender);

    this.disposer = () => {
      c.off("mouse:down", onMouseDown);
      c.off("mouse:up", onMouseUp);
      c.off("mouse:move", onMouseMove);
      c.off("mouse:over", onMouseOver);
      c.off("mouse:out", onMouseOut);

      c.off("object:moving", onObjectTransforming);
      c.off("object:scaling", onObjectTransforming);
      c.off("object:rotating", onObjectTransforming);
      c.off("object:skewing", onObjectTransforming);
      c.off("object:modified", onObjectTransforming);
      c.off("object:removed", onObjectRemoved);
      c.off("object:added", onObjectAdded);

      c.off("after:render", onAfterRender);
      if (this.zoomRaf != null) cancelAnimationFrame(this.zoomRaf);
      this.zoomRaf = null;
      this.lastZoom = null;
    };
  }

  /**
   * 让任何“置顶/置底”也能触发 follower 的重排（尤其是 z-order 跟随）。
   * 这是框架层能力：业务插件不应该每个都去 patch。
   */
  private patchZOrderApis() {
    const c: any = this.canvas as any;

    // Fabric 常见 API（不同版本/封装可能会有不同命名）
    const origBringObjectToFront = c.bringObjectToFront?.bind(c);
    const origSendObjectToBack = c.sendObjectToBack?.bind(c);
    const origBringToFront = c.bringToFront?.bind(c);
    const origSendToBack = c.sendToBack?.bind(c);

    const afterZOrderChange = (obj: any) => {
      const owner = this.findByObject(obj as any);
      if (!owner) return;
      this._emitOwnerTransformed(owner);
    };

    if (origBringObjectToFront) {
      c.bringObjectToFront = (obj: any) => {
        const ret = origBringObjectToFront(obj);
        if (obj) afterZOrderChange(obj);
        return ret;
      };
    }
    if (origSendObjectToBack) {
      c.sendObjectToBack = (obj: any) => {
        const ret = origSendObjectToBack(obj);
        if (obj) afterZOrderChange(obj);
        return ret;
      };
    }
    if (origBringToFront) {
      c.bringToFront = (obj: any) => {
        const ret = origBringToFront(obj);
        if (obj) afterZOrderChange(obj);
        return ret;
      };
    }
    if (origSendToBack) {
      c.sendToBack = (obj: any) => {
        const ret = origSendToBack(obj);
        if (obj) afterZOrderChange(obj);
        return ret;
      };
    }

    return () => {
      if (origBringObjectToFront) c.bringObjectToFront = origBringObjectToFront;
      if (origSendObjectToBack) c.sendObjectToBack = origSendObjectToBack;
      if (origBringToFront) c.bringToFront = origBringToFront;
      if (origSendToBack) c.sendToBack = origSendToBack;
    };
  }
}
