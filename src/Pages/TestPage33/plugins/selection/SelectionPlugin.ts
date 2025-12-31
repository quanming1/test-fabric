import { type FabricObject, ActiveSelection } from "fabric";
import { BasePlugin } from "../base/Plugin";
import { CoordinateHelper } from "../../core";
import type { ToolbarPosition } from "../../core/types";

/**
 * 选择插件
 * 功能：对象选择、浮动工具栏定位
 * 事件：selection:change, toolbar:update
 */
export class SelectionPlugin extends BasePlugin {
  readonly name = "selection";

  private activeObject: FabricObject | null = null;

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
    this.canvas.on("object:moving", this.updateToolbar);
    this.canvas.on("object:scaling", this.updateToolbar);
    this.canvas.on("object:rotating", this.updateToolbar);
    this.canvas.on("object:modified", this.updateToolbar);

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
      const clones: FabricObject[] = [];

      for (const obj of objects) {
        const clone = await obj.clone();
        clone.set({
          left: (obj.left || 0) + 20,
          top: (obj.top || 0) + 20,
        });

        // 克隆元数据并生成新 ID
        this.editor.metadata.clone(obj, clone);

        this.canvas.add(clone);
        clones.push(clone);
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

    this.canvas.discardActiveObject();
    objects.forEach((obj) => {
      this.canvas.remove(obj);
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
    this.canvas.off("object:moving", this.updateToolbar);
    this.canvas.off("object:scaling", this.updateToolbar);
    this.canvas.off("object:rotating", this.updateToolbar);
    this.canvas.off("object:modified", this.updateToolbar);
    this.eventBus.off("zoom:change", this.updateToolbar);
  }
}
