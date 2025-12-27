import type { FabricObject } from "fabric";
import type { Scene } from "./scene";
import { Element } from "./element";

export type ElementFactory<P = any> = (scene: Scene, props: P) => Element;

export type ElementTypeDef<P = any> = {
  type: string;
  create: ElementFactory<P>;
};

/**
 * Registry：元素 type -> 工厂（类似 React 组件注册表 / 插件系统）
 */
export class ElementRegistry {
  private factories = new Map<string, ElementFactory<any>>();

  register<P>(def: ElementTypeDef<P>) {
    if (this.factories.has(def.type)) {
      throw new Error(`Element type already registered: ${def.type}`);
    }
    this.factories.set(def.type, def.create);
  }

  has(type: string) {
    return this.factories.has(type);
  }

  create<P>(scene: Scene, type: string, props: P): Element {
    const f = this.factories.get(type);
    if (!f) throw new Error(`Unknown element type: ${type}`);
    return f(scene, props);
  }

  /**
   * 将一个“外部创建的 FabricObject”包装成 Element（type 可自定义）。
   * 适用于：你已有大量 Fabric 原生逻辑，想逐步迁移到框架层。
   */
  wrap(obj: FabricObject, type = "fabric") {
    return new Element({ obj, type });
  }
}
