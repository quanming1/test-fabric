import { type FabricObject } from "fabric";
import { BasePlugin } from "../base/Plugin";
import type { ToolbarPosition } from "../../core/types";
import { CoordinateHelper } from "../../core/coordinateUtils";

/**
 * 选择插件
 * 功能：对象选择、浮动工具栏定位
 * 事件：selection:change, toolbar:update
 */
export class SelectionPlugin extends BasePlugin {
  readonly name = "selection";

  private activeObject: FabricObject | null = null;

  get selected(): FabricObject | null {
    return this.activeObject;
  }

  protected onInstall(): void {
    this.canvas.on("selection:created", this.onSelectionCreated);
    this.canvas.on("selection:updated", this.onSelectionUpdated);
    this.canvas.on("selection:cleared", this.onSelectionCleared);
    this.canvas.on("object:moving", this.updateToolbar);
    this.canvas.on("object:scaling", this.updateToolbar);
    this.canvas.on("object:rotating", this.updateToolbar);
    this.canvas.on("object:modified", this.updateToolbar);

    // 监听缩放变化，更新工具栏位置
    this.eventBus.on("zoom:change", this.updateToolbar);
  }

  private onSelectionCreated = (opt: any): void => {
    this.activeObject = opt.selected?.[0] || null;
    this.eventBus.emit("selection:change", this.activeObject);
    requestAnimationFrame(() => this.updateToolbar());
  };

  private onSelectionUpdated = (opt: any): void => {
    this.activeObject = opt.selected?.[0] || null;
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

  /** 复制当前选中对象 */
  async cloneSelected(): Promise<FabricObject | null> {
    if (!this.activeObject) return null;

    try {
      const clone = await this.activeObject.clone();
      clone.set({
        left: (this.activeObject.left || 0) + 20,
        top: (this.activeObject.top || 0) + 20,
      });
      this.canvas.add(clone);
      this.canvas.setActiveObject(clone);
      this.activeObject = clone;
      this.canvas.requestRenderAll();
      requestAnimationFrame(() => this.updateToolbar());
      return clone;
    } catch (e) {
      console.error("Clone failed:", e);
      return null;
    }
  }

  /** 置顶 */
  bringToFront(): void {
    if (this.activeObject) {
      this.canvas.bringObjectToFront(this.activeObject);
      this.eventBus.emit("layer:change");
      this.canvas.requestRenderAll();
    }
  }

  /** 置底 */
  sendToBack(): void {
    if (this.activeObject) {
      this.canvas.sendObjectToBack(this.activeObject);
      this.eventBus.emit("layer:change");
      this.canvas.requestRenderAll();
    }
  }

  /** 删除选中对象 */
  deleteSelected(): void {
    if (this.activeObject) {
      this.canvas.remove(this.activeObject);
      this.canvas.discardActiveObject();
      this.activeObject = null;
      this.canvas.requestRenderAll();
      this.eventBus.emit("selection:change", null);
      this.eventBus.emit("toolbar:update", { x: 0, y: 0, visible: false });
    }
  }

  protected onDestroy(): void {
    this.canvas.off("selection:created", this.onSelectionCreated);
    this.canvas.off("selection:updated", this.onSelectionUpdated);
    this.canvas.off("selection:cleared", this.onSelectionCleared);
    this.canvas.off("object:moving", this.updateToolbar);
    this.canvas.off("object:scaling", this.updateToolbar);
    this.canvas.off("object:rotating", this.updateToolbar);
    this.canvas.off("object:modified", this.updateToolbar);
  }
}
