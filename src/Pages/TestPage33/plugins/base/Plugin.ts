import { CanvasEditor } from "../../core";
import type { HistoryRecord } from "../../core";

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

  // ─── 可选：序列化支持 ─────────────────────────────────

  /** 是否支持序列化 */
  serializable?: boolean;

  /** 导入优先级，数值越小越先导入，默认 0 */
  importOrder?: number;

  /** 导出插件数据 */
  exportData?(): unknown;

  /** 导入插件数据（支持异步） */
  importData?(data: unknown): void | Promise<void>;

  /** 清空插件数据 */
  clearAll?(): void;

  // ─── 可选：历史记录支持 ─────────────────────────────────

  /** 应用撤销操作，子类实现 */
  applyUndo?(record: HistoryRecord): void;

  /** 应用重做操作，子类实现 */
  applyRedo?(record: HistoryRecord): void;

  // ─── 可选：删除支持 ─────────────────────────────────

  /**
   * 删除指定 ID 的对象
   * @param ids 要删除的对象 ID 列表
   * @param recordHistory 是否记录历史
   */
  remove?(ids: string[], recordHistory: boolean): void;
}

/**
 * 插件基类（可选继承）
 * 提供通用的生命周期管理
 */
export abstract class BasePlugin implements Plugin {
  abstract readonly name: string;
  protected editor!: CanvasEditor;
  protected disposed = false;

  /** 是否支持序列化，子类设为 true 并实现 exportData/importData */
  serializable = false;

  /** 导入优先级，数值越小越先导入 */
  importOrder = 0;

  /** 导出插件数据，子类实现 */
  exportData?(): unknown;

  /** 导入插件数据，子类实现（支持异步） */
  importData?(data: unknown): void | Promise<void>;

  /** 清空插件数据，子类实现 */
  clearAll?(): void;

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

  /**
   * 应用撤销操作，子类可重写
   */
  applyUndo?(record: HistoryRecord): void;

  /**
   * 应用重做操作，子类可重写
   */
  applyRedo?(record: HistoryRecord): void;

  /**
   * 删除指定 ID 的对象，子类可重写
   * @param ids 要删除的对象 ID 列表
   * @param recordHistory 是否记录历史
   */
  remove?(ids: string[], recordHistory: boolean): void;
}
