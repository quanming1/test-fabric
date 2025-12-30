import { CanvasEditor } from "../../core";

/**
 * 插件接口
 * 所有插件必须实现此接口
 */
export interface Plugin {
  /** 插件唯一名称 */
  readonly name: string;

  /** 安装插件，由 editor.use() 调用 */
  install(editor: CanvasEditor): void;

  /** 销毁插件，清理事件监听等资源 */
  destroy(): void;
}

/**
 * 插件基类（可选继承）
 * 提供通用的生命周期管理
 */
export abstract class BasePlugin implements Plugin {
  abstract readonly name: string;
  protected editor!: CanvasEditor;
  protected disposed = false;

  install(editor: CanvasEditor): void {
    this.editor = editor;
    this.onInstall();
  }

  /** 子类实现具体安装逻辑 */
  protected abstract onInstall(): void;

  destroy(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.onDestroy();
  }

  /** 子类实现具体销毁逻辑 */
  protected onDestroy(): void { }

  /** 快捷访问 canvas */
  protected get canvas() {
    return this.editor.canvas;
  }

  /** 快捷访问事件总线 */
  protected get eventBus() {
    return this.editor.eventBus;
  }
}
