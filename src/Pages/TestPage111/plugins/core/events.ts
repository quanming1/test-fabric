import type { FabricObject } from "fabric";
import type { Scene } from "./scene";

export type ScenePointerEventName =
  | "pointer:down"
  | "pointer:up"
  | "pointer:move"
  | "pointer:over"
  | "pointer:out";

/**
 * 统一事件模型（屏蔽 Fabric 版本差异，先用 any；后续可逐步收紧类型）。
 */
export type FabricCanvasEvent = any;

export type ScenePointerEvent = {
  name: ScenePointerEventName;
  scene: Scene;
  /**
   * 原始 Fabric 事件对象（fabric.IEvent / fabric.TPointerEvent 等，版本差异较大）
   */
  raw: FabricCanvasEvent;
  /**
   * 原生事件（MouseEvent/PointerEvent），便于读取 ctrlKey/button 等。
   */
  e: MouseEvent | PointerEvent;
  /**
   * Fabric 命中对象（可能为空）
   */
  target?: FabricObject;
};

export type SceneEvent = ScenePointerEvent;
