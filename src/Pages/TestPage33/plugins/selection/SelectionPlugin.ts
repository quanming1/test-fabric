import { type FabricObject, ActiveSelection } from "fabric";
import { BasePlugin } from "../base/Plugin";
import { Category, CoordinateHelper } from "../../core";
import type { ToolbarPosition } from "../../core/types";
import type { DrawPlugin } from "../draw/DrawPlugin";
import type { ImagePlugin } from "../object/image/ImagePlugin";
import type { MarkerPlugin } from "../object/marker/MarkerPlugin";

/**
 * 选择插件
 * 功能：对象选择、浮动工具栏定位
 * 事件：selection:change, toolbar:update, object:transformStart
 */
export class SelectionPlugin extends BasePlugin {
  readonly name = "selection";

  private activeObject: FabricObject | null = null;
  /** 是否正在变换（拖拽/缩放/旋转） */
  private isTransforming = false;

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

  protected onInstall(): void {
    this.canvas.on("selection:created", this.onSelectionCreated);
    this.canvas.on("selection:updated", this.onSelectionUpdated);
    this.canvas.on("selection:cleared", this.onSelectionCleared);
    this.canvas.on("object:moving", this.onTransformStart);
    this.canvas.on("object:scaling", this.onTransformStart);
    this.canvas.on("object:rotating", this.onTransformStart);
    this.canvas.on("object:modified", this.onObjectModified);

    // 监听缩放变化
    this.eventBus.on("zoom:change", this.updateToolbar);
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

  /**
   * 变换开始时（移动/缩放/旋转）触发事件记录初始状态
   */
  private onTransformStart = (): void => {
    this.updateToolbar();

    // 只在变换开始时触发一次
    if (!this.isTransforming) {
      this.isTransforming = true;
      const objects = this.selectedObjects;
      if (objects.length > 0) {
        this.eventBus.emit("object:transformStart", objects);
      }
    }
  };

  /**
   * 对象修改完成时重置变换状态
   */
  private onObjectModified = (): void => {
    this.isTransforming = false;
    this.updateToolbar();
  };

  private updateToolbar = (): void => {
    if (!this.activeObject) {
      this.eventBus.emit("toolbar:update", { x: 0, y: 0, visible: false });
      return;
    }

    const vpt = this.canvas.viewportTransform;
    if (!vpt) return;

    const coordHelper = new CoordinateHelper(vpt);
    const boundingRect = this.activeObject.getBoundingRect();
    const topLeft = coordHelper.sceneToScreen({ x: boundingRect.left, y: boundingRect.top });

    const pos: ToolbarPosition = {
      x: topLeft.x + (boundingRect.width * vpt[0]) / 2,
      y: topLeft.y - 10,
      visible: true,
    };

    this.eventBus.emit("toolbar:update", pos);
  };

  /** 复制当前选中对象（支持多选） */
  async cloneSelected(): Promise<FabricObject[]> {
    const objects = this.selectedObjects;
    if (objects.length === 0) return [];

    try {
      const drawPlugin = this.editor.getPlugin<DrawPlugin>("draw");
      const imagePlugin = this.editor.getPlugin<ImagePlugin>("image");
      const offset = { x: 20, y: 20 };

      const clones: FabricObject[] = [];

      // 按对象分类分发克隆请求，由各插件内部完成 clone/metadata/历史记录
      for (const obj of objects) {
        const meta = this.editor.metadata.get(obj);
        const id = meta?.id;
        const category = meta?.category;
        if (!id || !category) continue;

        switch (category) {
          case Category.DrawRect: {
            const c = await drawPlugin?.clone([id], { offset, recordHistory: true });
            if (c?.length) clones.push(...c);
            break;
          }
          case Category.Image: {
            const c = await imagePlugin?.clone([id], { offset, recordHistory: true });
            if (c?.length) clones.push(...c);
            break;
          }
          default:
            // 未知分类：交给对应插件实现（目前忽略）
            console.warn("[cloneSelected] 未支持的 category:", category, "id:", id);
            break;
        }
      }

      // 多选时创建新的 ActiveSelection，单选时直接选中
      if (clones.length > 1) {
        const selection = new ActiveSelection(clones, { canvas: this.canvas });
        this.canvas.setActiveObject(selection);
        this.activeObject = selection;
      } else if (clones.length === 1) {
        this.canvas.setActiveObject(clones[0]);
        this.activeObject = clones[0];
      }

      this.canvas.requestRenderAll();
      requestAnimationFrame(() => this.updateToolbar());
      return clones;
    } catch (e) {
      console.error("Clone failed:", e);
      return [];
    }
  }

  /** 置顶（支持多选） */
  bringToFront(): void {
    const objects = this.selectedObjects;
    if (objects.length === 0) return;

    objects.forEach((obj) => {
      this.canvas.bringObjectToFront(obj);
    });
    this.eventBus.emit("layer:change");
    this.canvas.requestRenderAll();
  }

  /** 置底（支持多选） */
  sendToBack(): void {
    const objects = this.selectedObjects;
    if (objects.length === 0) return;

    // 反向遍历保持相对顺序
    [...objects].reverse().forEach((obj) => {
      this.canvas.sendObjectToBack(obj);
    });
    this.eventBus.emit("layer:change");
    this.canvas.requestRenderAll();
  }

  /** 删除选中对象（支持多选） */
  deleteSelected(): void {
    const objects = this.selectedObjects;
    if (objects.length === 0) return;

    // 获取所有选中对象的 ID
    const ids = objects
      .map((obj) => this.editor.metadata.get(obj)?.id)
      .filter((id): id is string => id !== undefined);

    this.canvas.discardActiveObject();

    // 调用各插件的 remove 方法，由插件内部处理删除和历史记录
    const drawPlugin = this.editor.getPlugin<DrawPlugin>("draw");
    const imagePlugin = this.editor.getPlugin<ImagePlugin>("image");
    const markerPlugin = this.editor.getPlugin<MarkerPlugin>("marker");

    drawPlugin?.remove(ids, true);
    imagePlugin?.remove(ids, true);
    markerPlugin?.remove(ids, true);

    this.activeObject = null;
    this.canvas.requestRenderAll();
    this.eventBus.emit("selection:change", null);
    this.eventBus.emit("toolbar:update", { x: 0, y: 0, visible: false });
  }

  protected onDestroy(): void {
    this.canvas.off("selection:created", this.onSelectionCreated);
    this.canvas.off("selection:updated", this.onSelectionUpdated);
    this.canvas.off("selection:cleared", this.onSelectionCleared);
    this.canvas.off("object:moving", this.onTransformStart);
    this.canvas.off("object:scaling", this.onTransformStart);
    this.canvas.off("object:rotating", this.onTransformStart);
    this.canvas.off("object:modified", this.onObjectModified);
    this.eventBus.off("zoom:change", this.updateToolbar);
  }
}
