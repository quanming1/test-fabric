import type { SceneEvent } from "./events";
import type { Element } from "./element";

/**
 * Behavior：把“能力”从元素本体剥离出来（跟随/吸附/快捷键/hover 样式...）
 * 你可以把它类比为：React hooks / Unity component / ECS 的 system。
 */
export interface Behavior {
  /**
   * 用于调试/序列化（可选）
   */
  id?: string;

  onAttach?(el: Element): void;
  onDetach?(el: Element): void;

  /**
   * Scene 事件（pointer over/out/down...）
   * 返回 true 表示“已消费”，Scene 可以选择停止继续冒泡（当前实现先不强制）。
   */
  onSceneEvent?(el: Element, ev: SceneEvent): boolean | void;

  /**
   * 当某个 owner 元素发生变换（moving/scaling/rotating/...）时通知。
   * 例如 FollowBehavior 可以订阅它的 owner，在这里更新 follower。
   */
  onOwnerTransformed?(el: Element, owner: Element): void;

  /**
   * 画布 zoom 变化（after:render 检测到 zoom 变了）
   */
  onZoomChanged?(el: Element, zoom: number): void;
}
