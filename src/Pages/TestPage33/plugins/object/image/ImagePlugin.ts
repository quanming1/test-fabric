import { FabricImage, type FabricObject, ActiveSelection, type TPointerEvent, type Transform, type TEvent, type BasicTransformEvent, type ModifiedEvent } from "fabric";
import { BasePlugin } from "../../base/Plugin";
import { Category, type HistoryRecord } from "../../../core";
import { EditorMode } from "../../mode/ModePlugin";
import { ImageManager } from "./data/ImageManager";
import { ImageLabelRenderer } from "./render/ImageLabelRenderer";

/**
 * 图片插件
 * 
 * 职责：
 * - 图片的上传、添加、删除、克隆
 * - 选中图片时显示浮动标签（文件名 + 尺寸）
 * - 响应模式切换，调整图片的交互状态
 * - 集成历史记录，支持撤销/重做
 * 
 * 架构：
 * - ImageManager: 数据管理层，处理图片的增删改查和历史记录
 * - ImageLabelRenderer: 渲染层，管理选中图片上方的浮动标签
 * 
 * 事件：
 * - image:added: 图片添加完成后触发
 */
export class ImagePlugin extends BasePlugin {
  readonly name = "image";
  override serializable = true;
  override importOrder = 5; // 确保在基础对象之后加载

  /** 数据管理器 - 负责图片的增删改查、历史记录 */
  private manager!: ImageManager;
  /** 标签渲染器 - 负责选中图片上方的浮动标签 */
  private labelRenderer!: ImageLabelRenderer;

  protected onInstall(): void {
    this.manager = new ImageManager({ editor: this.editor });
    this.labelRenderer = new ImageLabelRenderer(this.canvas, this.editor.metadata);

    this.bindCanvasEvents();
    this.bindEditorEvents();
  }

  /** 绑定画布事件 */
  private bindCanvasEvents(): void {
    // 对象生命周期
    this.canvas.on("object:added", this.onObjectAdded);
    this.canvas.on("object:modified", this.onObjectModified);
    this.canvas.on("before:transform", this.onBeforeTransform);

    // 选中状态变化 - 用于显示/隐藏标签
    this.canvas.on("selection:created", this.onSelectionChange);
    this.canvas.on("selection:updated", this.onSelectionChange);
    this.canvas.on("selection:cleared", this.onSelectionCleared);

    // 变换过程 - 用于实时更新标签位置和尺寸
    this.canvas.on("object:moving", this.onObjectTransform);
    this.canvas.on("object:scaling", this.onObjectTransform);
    this.canvas.on("object:rotating", this.onObjectTransform);
  }

  /** 绑定编辑器事件 */
  private bindEditorEvents(): void {
    // 模式切换 - 调整图片的 selectable/evented 状态
    this.eventBus.on("mode:change", this.onModeChange);
    // 缩放变化 - 更新标签位置（保持视觉大小不变）
    this.eventBus.on("zoom:change", this.onZoomChange);
  }

  // ─── 标签相关事件 ─────────────────────────────────────────

  /**
   * 获取当前选中的图片对象列表
   * 支持单选和多选（ActiveSelection）
   */
  private getSelectedImages(): FabricObject[] {
    const active = this.canvas.getActiveObject();
    if (!active) return [];

    // 多选时从 ActiveSelection 中提取对象
    const objects = active instanceof ActiveSelection
      ? active.getObjects()
      : [active];

    // 只保留图片类型的对象
    return objects.filter((obj) =>
      this.editor.metadata.is(obj, "category", Category.Image)
    );
  }

  /** 选中状态变化 - 显示选中图片的标签 */
  private onSelectionChange = (): void => {
    const images = this.getSelectedImages();
    this.labelRenderer.show(images);
  };

  /** 取消选中 - 隐藏所有标签 */
  private onSelectionCleared = (): void => {
    this.labelRenderer.hide();
  };

  /** 变换过程中 - 实时更新标签位置和尺寸信息 */
  private onObjectTransform = (opt: BasicTransformEvent<TPointerEvent> & { target: FabricObject }): void => {
    const target = opt.target;
    if (!target) return;

    // 获取实际变换的对象（多选时需要从 ActiveSelection 中提取）
    const objects = target instanceof ActiveSelection
      ? target.getObjects()
      : [target];

    const images = objects.filter((obj) =>
      this.editor.metadata.is(obj, "category", Category.Image)
    );

    if (images.length > 0) {
      this.labelRenderer.show(images);
    }
  };

  /** 缩放变化 - 更新标签位置 */
  private onZoomChange = (): void => {
    const images = this.getSelectedImages();
    this.labelRenderer.show(images);
  };

  // ─── 历史记录事件 ─────────────────────────────────────────

  /** 变换开始前 - 保存快照用于历史记录 */
  private onBeforeTransform = (opt: TEvent<TPointerEvent> & { transform: Transform }): void => {
    const target = opt.transform?.target;
    if (!target) return;

    const objects = target.type === "activeselection"
      ? ((target as ActiveSelection).getObjects() as FabricObject[])
      : [target];

    this.manager.onTransformStart(objects);
  };

  /** 变换结束 - 记录历史并更新标签 */
  private onObjectModified = (opt: ModifiedEvent<TPointerEvent>): void => {
    const target = opt.target;
    if (!target) return;

    const objects = target.type === "activeselection"
      ? ((target as ActiveSelection).getObjects() as FabricObject[])
      : [target];

    // 记录历史
    this.manager.onObjectModified(objects);

    // 变换结束后更新标签（尺寸可能已变化）
    const images = objects.filter((obj) =>
      this.editor.metadata.is(obj, "category", Category.Image)
    );
    if (images.length > 0) {
      this.labelRenderer.show(images);
    }
  };

  /** 应用撤销 */
  applyUndo(record: HistoryRecord): void {
    this.manager.applyUndo(record);
  }

  /** 应用重做 */
  applyRedo(record: HistoryRecord): void {
    this.manager.applyRedo(record);
  }

  // ─── 公开 API ─────────────────────────────────────────

  /**
   * 删除指定 ID 的图片
   * @param ids 要删除的图片 ID 列表
   * @param recordHistory 是否记录历史
   */
  remove(ids: string[], recordHistory: boolean): void {
    this.manager.remove(ids, recordHistory);
    this.labelRenderer.hide();
  }

  /**
   * 记录克隆操作（供外部调用，如 SelectionPlugin）
   */
  recordClone(objects: FabricObject[]): void {
    this.manager.recordClone(objects);
  }

  /**
   * 克隆指定 ID 的图片
   * @param ids 要克隆的图片 ID 列表
   * @param options 克隆选项（偏移量、是否记录历史）
   */
  async clone(
    ids: string[],
    options?: { offset?: { x: number; y: number }; recordHistory?: boolean }
  ): Promise<FabricObject[]> {
    return this.manager.clone(ids, options);
  }

  /**
   * 从文件添加图片
   * @param file 图片文件
   */
  async addImageFromFile(file: File): Promise<FabricImage | null> {
    return this.manager.addFromFile(file);
  }

  /**
   * 从 URL 添加图片
   * @param url 图片 URL（支持 data URL）
   */
  async addImageFromUrl(url: string): Promise<FabricImage | null> {
    return this.manager.addFromUrl(url);
  }

  // ─── 模式切换 ─────────────────────────────────────────

  /** 模式变化 - 更新所有图片的交互状态 */
  private onModeChange = ({ mode }: { mode: EditorMode }): void => {
    this.manager.applyModeConfig(mode);
  };

  /** 新图片添加到画布 - 应用当前模式的交互配置 */
  private onObjectAdded = (opt: { target: FabricObject }): void => {
    const obj = opt.target;
    if (!obj) return;

    const isImage = this.editor.metadata.is(obj, "category", Category.Image);
    if (!isImage) return;

    const modePlugin = this.editor.getPlugin<any>("mode");
    const mode = (modePlugin?.mode as EditorMode) ?? EditorMode.Select;
    this.manager.applyModeConfigToObject(obj, mode);
  };

  protected onDestroy(): void {
    // 移除画布事件
    this.canvas.off("object:added", this.onObjectAdded);
    this.canvas.off("object:modified", this.onObjectModified);
    this.canvas.off("before:transform", this.onBeforeTransform);
    this.canvas.off("selection:created", this.onSelectionChange);
    this.canvas.off("selection:updated", this.onSelectionChange);
    this.canvas.off("selection:cleared", this.onSelectionCleared);
    this.canvas.off("object:moving", this.onObjectTransform);
    this.canvas.off("object:scaling", this.onObjectTransform);
    this.canvas.off("object:rotating", this.onObjectTransform);

    // 移除编辑器事件
    this.eventBus.off("mode:change", this.onModeChange);
    this.eventBus.off("zoom:change", this.onZoomChange);

    this.labelRenderer.destroy();
  }

  // ─── 序列化 ─────────────────────────────────────────

  /** 导出图片数据 */
  exportData(): object[] {
    return this.manager.exportData();
  }

  /** 导入图片数据 */
  async importData(data: object[]): Promise<void> {
    await this.manager.importData(data);

    // 导入后应用当前模式配置
    const modePlugin = this.editor.getPlugin<any>("mode");
    const mode = modePlugin?.mode as EditorMode;
    if (mode) this.onModeChange({ mode });
  }

  /** 清空所有图片 */
  clearAll(): void {
    this.manager.clearAll();
    this.labelRenderer.hide();
  }
}
