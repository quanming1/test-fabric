import type { FabricObject } from "fabric";
import { createId } from "./utils";
import { Bag } from "./bag";
import type { Behavior } from "./behavior";
import type { SceneEvent, ScenePointerEvent } from "./events";
import type { Scene } from "./scene";

export const ELEMENT_BAG_KEY = "__fx";

export type ElementMeta = {
  id?: string;
  type?: string;
};

export function getElementMetaFromObject(obj: FabricObject): ElementMeta | undefined {
  return Bag.get<ElementMeta>(obj, ELEMENT_BAG_KEY);
}

export function ensureElementMetaOnObject(obj: FabricObject, patch?: ElementMeta) {
  const meta = Bag.ensure<ElementMeta>(obj, ELEMENT_BAG_KEY);
  if (patch?.id != null) meta.id = patch.id;
  if (patch?.type != null) meta.type = patch.type;
  return meta;
}

export type ElementOptions<TObj extends FabricObject = FabricObject> = {
  obj: TObj;
  /**
   * 语义类型（业务无关）：例如 "image" / "marker" / "bbox" / "text" ...
   */
  type: string;
  id?: string;
};

/**
 * Element：对 FabricObject 的面向对象封装（把“语义/职责/交互”抽象出来）
 */
export class Element<TObj extends FabricObject = FabricObject> {
  readonly obj: TObj;
  readonly type: string;
  readonly id: string;

  scene: Scene | null = null;
  private behaviors: Behavior[] = [];

  constructor(opts: ElementOptions<TObj>) {
    this.obj = opts.obj;
    this.type = opts.type;
    this.id = opts.id ?? ensureElementMetaOnObject(this.obj).id ?? createId("el");

    const meta = ensureElementMetaOnObject(this.obj);
    meta.id = this.id;
    meta.type = this.type;
  }

  get meta(): ElementMeta {
    return Bag.ensure<ElementMeta>(this.obj, ELEMENT_BAG_KEY);
  }

  /**
   * 绑定到场景（由 Scene 调用）
   */
  _attach(scene: Scene) {
    this.scene = scene;
    this.behaviors.forEach((b) => b.onAttach?.(this));
    this.onAttach?.();
  }

  /**
   * 从场景解绑（由 Scene 调用）
   */
  _detach() {
    this.onDetach?.();
    this.behaviors.forEach((b) => b.onDetach?.(this));
    this.scene = null;
  }

  addBehavior(b: Behavior) {
    this.behaviors.push(b);
    if (this.scene) b.onAttach?.(this);
    return this;
  }

  removeBehavior(predicate: (b: Behavior) => boolean) {
    const removed: Behavior[] = [];
    this.behaviors = this.behaviors.filter((b) => {
      if (!predicate(b)) return true;
      removed.push(b);
      return false;
    });
    removed.forEach((b) => b.onDetach?.(this));
    return this;
  }

  getBehaviors() {
    return [...this.behaviors];
  }

  /**
   * Scene 事件分发入口（由 Scene 调用）
   */
  _handleSceneEvent(ev: SceneEvent) {
    // element-level hook
    if (this.onSceneEvent?.(ev) === true) return true;

    if (ev.name.startsWith("pointer:")) {
      const pe = ev as ScenePointerEvent;
      switch (pe.name) {
        case "pointer:down":
          if (this.onPointerDown?.(pe) === true) return true;
          break;
        case "pointer:up":
          if (this.onPointerUp?.(pe) === true) return true;
          break;
        case "pointer:move":
          if (this.onPointerMove?.(pe) === true) return true;
          break;
        case "pointer:over":
          if (this.onPointerOver?.(pe) === true) return true;
          break;
        case "pointer:out":
          if (this.onPointerOut?.(pe) === true) return true;
          break;
      }
    }

    // behaviors
    for (const b of this.behaviors) {
      const ret = b.onSceneEvent?.(this, ev);
      if (ret === true) return true;
    }
    return false;
  }

  /**
   * owner 变换通知入口（由 Scene 调用）
   */
  _notifyOwnerTransformed(owner: Element) {
    for (const b of this.behaviors) b.onOwnerTransformed?.(this, owner);
  }

  /**
   * zoom 变化通知入口（由 Scene 调用）
   */
  _notifyZoomChanged(zoom: number) {
    for (const b of this.behaviors) b.onZoomChanged?.(this, zoom);
  }

  // ---------------------------
  // 可覆盖的生命周期 / 交互钩子
  // ---------------------------
  onAttach?(): void;
  onDetach?(): void;
  onSceneEvent?(ev: SceneEvent): boolean | void;

  onPointerDown?(ev: ScenePointerEvent): boolean | void;
  onPointerUp?(ev: ScenePointerEvent): boolean | void;
  onPointerMove?(ev: ScenePointerEvent): boolean | void;
  onPointerOver?(ev: ScenePointerEvent): boolean | void;
  onPointerOut?(ev: ScenePointerEvent): boolean | void;
}
