import type { Element } from "../element";
import type { Scene } from "../scene";

/**
 * 通用配方：把某段“行为挂载逻辑”自动应用到某个 type 的所有元素上
 * - 会先对现有元素执行一次
 * - 再订阅 element:added，对未来新增元素执行
 * 返回 disposer
 */
export function attachBehaviorOnType(scene: Scene, type: string, attach: (el: Element) => void) {
  scene.getElementsByType(type).forEach((el) => attach(el));
  const off = scene.on("element:added", ({ element }) => {
    if (element.type !== type) return;
    attach(element);
  });
  return off;
}


