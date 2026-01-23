import { type FabricObject, ActiveSelection } from "fabric";
import { BasePlugin } from "../base/Plugin";
import { Category } from "../../core";
import type { ToolbarPosition } from "../../core/types";
import type { DrawPlugin } from "../draw/DrawPlugin";
import type { ImagePlugin } from "../object/image/ImagePlugin";
import type { MarkerPlugin } from "../object/marker/MarkerPlugin";
import { FloatingToolbar } from "./FloatingToolbar";
import { SelectionHotkeyHandler } from "./SelectionHotkeyHandler";

/** 选择插件配置 */
interface SelectionConfig {
  /** 工具栏距离选中对象顶部的偏移量 */
  toolbarOffsetY: number;
}

const DEFAULT_CONFIG: SelectionConfig = {
  toolbarOffsetY: 12,
};

/**
 * 选择插件
 * 功能：对象选择、浮动工具栏定位
 * 事件：selection:change, toolbar:update
 */
export class SelectionPlugin extends BasePlugin {
  readonly name = "selection";

  private activeObject: FabricObject | null = null;
  private config: SelectionConfig;
  private hotkeyHandler: SelectionHotkeyHandler | null = null;
  /** 工具栏宽度（由 FloatingToolbar 组件测量后设置） */
  private toolbarWidth = 72;
  /** 标签区域预留宽度 */
  private static readonly LABEL_RESERVED_WIDTH = 120;

  /** 当前选中对象（单选或 ActiveSelection） */
  get selected(): FabricObject | null {
    return this.activeObject;
  }

  /** 获取所有选中的对象数组（无论单选还是多选） */
  get selectedObjects(): FabricObject[] {
    if (!this.activeObject) return [];
    if (this.activeObject instanceof ActiveSelection) {
      return this.activeObject.getObjects();
    }
    return [this.activeObject];
  }

  /** 是否多选 */
  get isMultiSelection(): boolean {
    return this.activeObject instanceof ActiveSelection;
  }

  /** 获取编辑器实例（供 handler 访问） */
  getEditor() {
    return this.editor;
  }

  constructor(config?: Partial<SelectionConfig>) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  protected onInstall(): void {
    this.canvas.on("selection:created", this.onSelectionCreated);
    this.canvas.on("selection:updated", this.onSelectionUpdated);
    this.canvas.on("selection:cleared", this.onSelectionCleared);
    this.canvas.on("object:moving", this.onObjectTransforming);
    this.canvas.on("object:scaling", this.onObjectTransforming);
    this.canvas.on("object:rotating", this.onObjectTransforming);
    this.canvas.on("object:modified", this.onObjectTransformEnd);
    this.eventBus.on("zoom:change", this.updateToolbar);

    this.hotkeyHandler = new SelectionHotkeyHandler(this, this.editor.hotkey);
    this.hotkeyHandler.bind();

    this.editor.domLayer.register("floating-toolbar", FloatingToolbar, {
      zIndex: 200,
      visible: true,
    });
  }

  private onSelectionCreated = (): void => {
    this.activeObject = this.canvas.getActiveObject() || null;
    this.eventBus.emit("selection:change", this.activeObject);
    requestAnimationFrame(() => this.updateToolbar());
  };

  private onSelectionUpdated = (): void => {
    this.activeObject = this.canvas.getActiveObject() || null;
    this.eventBus.emit("selection:change", this.activeObject);
    requestAnimationFrame(() => this.updateToolbar());
  };

  private onSelectionCleared = (): void => {
    this.activeObject = null;
    this.eventBus.emit("selection:change", null);
    this.eventBus.emit("toolbar:update", { x: 0, y: 0, visible: false });
  };

  private onObjectTransforming = (): void => {
    this.eventBus.emit("toolbar:update", { x: 0, y: 0, visible: false });
  };

  private onObjectTransformEnd = (): void => {
    this.updateToolbar();
  };

  setToolbarWidth(width: number): void {
    this.toolbarWidth = width;
  }

  private updateToolbar = (): void => {
    if (!this.activeObject) {
      this.eventBus.emit("toolbar:update", { x: 0, y: 0, visible: false });
      return;
    }

    const vpt = this.canvas.viewportTransform;
    if (!vpt) return;

    // getBoundingRect() 返回的已经是屏幕坐标，无需再转换
    const boundingRect = this.activeObject.getBoundingRect();
    const screenWidth = boundingRect.width;

    let x = boundingRect.left + screenWidth / 2;
    const y = boundingRect.top - this.config.toolbarOffsetY;

    if (this.shouldAlignRight(screenWidth)) {
      x = boundingRect.left + screenWidth + this.toolbarWidth / 2;
    }

    const pos: ToolbarPosition = { x, y, visible: true };
    this.eventBus.emit("toolbar:update", pos);
  };

  private shouldAlignRight(screenWidth: number): boolean {
    if (this.isMultiSelection) return false;
    const meta = this.editor.metadata.get(this.activeObject!);
    if (meta?.category !== Category.Image) return false;
    const toolbarHalfWidth = this.toolbarWidth / 2;
    const toolbarLeftOffset = screenWidth / 2 - toolbarHalfWidth;
    return toolbarLeftOffset < SelectionPlugin.LABEL_RESERVED_WIDTH;
  }

  /** 将一组对象设置为当前选中 */
  private setSelection(objects: FabricObject[]): void {
    if (objects.length === 0) return;
    this.canvas.discardActiveObject();
    if (objects.length === 1) {
      this.canvas.setActiveObject(objects[0]);
      objects[0].setCoords();
      return;
    }
    const selection = new ActiveSelection(objects, { canvas: this.canvas });
    selection.setCoords();
    this.canvas.setActiveObject(selection);
  }

  /** 可全选的对象分类 */
  private static readonly SELECTABLE_CATEGORIES: Category[] = [Category.Image];

  /** 全选画布上所有可选元素（根据 category 判断） */
  selectAll(): void {
    const objects = this.canvas.getObjects().filter((obj) => {
      const meta = this.editor.metadata.get(obj);
      if (!meta?.category) return false;
      return SelectionPlugin.SELECTABLE_CATEGORIES.includes(meta.category);
    });
    this.setSelection(objects);
    this.canvas.requestRenderAll();
  }

  /** 复制当前选中对象（支持多选） */
  async cloneSelected(): Promise<FabricObject[]> {
    const active = this.canvas.getActiveObject();
    if (!active) return [];

    const isMulti = active instanceof ActiveSelection;
    const objects = isMulti ? active.getObjects() : [active];
    if (objects.length === 0) return [];

    if (isMulti) {
      this.canvas.discardActiveObject();
      objects.forEach((obj) => obj.setCoords());
    }

    try {
      const clones = await this.editor.history.runBatch(async () => {
        const cloneOptions = { offset: { x: 20, y: 20 }, recordHistory: true };
        const drawPlugin = this.editor.getPlugin<DrawPlugin>("draw");
        const imagePlugin = this.editor.getPlugin<ImagePlugin>("image");

        const clonePromises: Promise<FabricObject[]>[] = [];
        for (const obj of objects) {
          const meta = this.editor.metadata.get(obj);
          if (!meta?.id || !meta?.category) continue;

          switch (meta.category) {
            case Category.DrawRect:
              clonePromises.push(drawPlugin?.clone([meta.id], cloneOptions) ?? Promise.resolve([]));
              break;
            case Category.Image:
              clonePromises.push(imagePlugin?.clone([meta.id], cloneOptions) ?? Promise.resolve([]));
              break;
          }
        }
        return (await Promise.all(clonePromises)).flat();
      });

      this.setSelection(clones);
      this.canvas.requestRenderAll();
      requestAnimationFrame(() => this.updateToolbar());
      return clones;
    } catch (e) {
      console.error("Clone failed:", e);
      return [];
    }
  }

  bringToFront(): void {
    const objects = this.selectedObjects;
    if (objects.length === 0) return;
    objects.forEach((obj) => this.canvas.bringObjectToFront(obj));
    this.eventBus.emit("layer:change");
    this.canvas.requestRenderAll();
  }

  sendToBack(): void {
    const objects = this.selectedObjects;
    if (objects.length === 0) return;
    [...objects].reverse().forEach((obj) => this.canvas.sendObjectToBack(obj));
    this.eventBus.emit("layer:change");
    this.canvas.requestRenderAll();
  }

  async deleteSelected(): Promise<void> {
    const objects = this.selectedObjects;
    if (objects.length === 0) return;

    const ids = objects
      .map((obj) => this.editor.metadata.get(obj)?.id)
      .filter((id): id is string => id !== undefined);

    this.canvas.discardActiveObject();

    const drawPlugin = this.editor.getPlugin<DrawPlugin>("draw");
    const imagePlugin = this.editor.getPlugin<ImagePlugin>("image");
    const markerPlugin = this.editor.getPlugin<MarkerPlugin>("marker");

    await this.editor.history.runBatch(() => {
      drawPlugin?.remove(ids, true);
      imagePlugin?.remove(ids, true);
      markerPlugin?.remove(ids, true);
    });

    this.activeObject = null;
    this.canvas.requestRenderAll();
    this.eventBus.emit("selection:change", null);
    this.eventBus.emit("toolbar:update", { x: 0, y: 0, visible: false });
  }

  protected onDestroy(): void {
    this.canvas.off("selection:created", this.onSelectionCreated);
    this.canvas.off("selection:updated", this.onSelectionUpdated);
    this.canvas.off("selection:cleared", this.onSelectionCleared);
    this.canvas.off("object:moving", this.onObjectTransforming);
    this.canvas.off("object:scaling", this.onObjectTransforming);
    this.canvas.off("object:rotating", this.onObjectTransforming);
    this.canvas.off("object:modified", this.onObjectTransformEnd);
    this.eventBus.off("zoom:change", this.updateToolbar);
    this.hotkeyHandler?.unbind();
    this.editor.domLayer.unregister("floating-toolbar");
  }
}
