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
    // 变换过程中更新工具栏位置
    this.canvas.on("object:moving", this.onObjectTransforming);
    this.canvas.on("object:scaling", this.onObjectTransforming);
    this.canvas.on("object:rotating", this.onObjectTransforming);
    this.canvas.on("object:modified", this.onObjectTransformEnd);
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

  /** 变换过程中（移动/缩放/旋转）更新工具栏 */
  private onObjectTransforming = (): void => {
    this.updateToolbar();
  };

  /** 变换结束（modified）后更新工具栏 */
  private onObjectTransformEnd = (): void => {
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

  /** 将一组对象设置为当前选中（支持多选/单选）；传空数组则不做任何事 */
  private setSelection(objects: FabricObject[]): void {
    if (objects.length === 0) return;

    // 清空旧选中，避免 ActiveSelection 混入旧对象
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

  /** 复制当前选中对象（支持多选） */
  async cloneSelected(): Promise<FabricObject[]> {
    const active = this.canvas.getActiveObject();
    if (!active) return [];

    // 关键点：ActiveSelection（多选）时，对象的 left/top 是“相对选区坐标”；
    // 先取出对象列表，再解除 ActiveSelection，让坐标回到画布绝对坐标后再克隆。
    const isMulti = active instanceof ActiveSelection;
    const objects = isMulti ? active.getObjects() : [active];
    if (objects.length === 0) return [];

    if (isMulti) {
      this.canvas.discardActiveObject();
      objects.forEach((obj) => obj.setCoords());
    }

    try {
      // 关键：多选复制是一种“集体操作”，应该只占用历史栈中的 1 个元素
      const clones = await this.editor.history.runBatch(async () => {
        const cloneOptions = { offset: { x: 20, y: 20 }, recordHistory: true };
        const drawPlugin = this.editor.getPlugin<DrawPlugin>("draw");
        const imagePlugin = this.editor.getPlugin<ImagePlugin>("image");

        // 遍历对象，根据 category 派发到对应插件
        const clonePromises: Promise<FabricObject[]>[] = [];
        for (const obj of objects) {
          const meta = this.editor.metadata.get(obj);
          if (!meta?.id || !meta?.category) continue;

          switch (meta.category) {
            case Category.DrawRect:
              clonePromises.push(drawPlugin?.clone([meta.id], cloneOptions) ?? Promise.resolve([]));
              break;
            case Category.Image:
              clonePromises.push(
                imagePlugin?.clone([meta.id], cloneOptions) ?? Promise.resolve([]),
              );
              break;
            default:
              console.warn("[cloneSelected] 未支持的 category:", meta.category);
          }
        }

        return (await Promise.all(clonePromises)).flat();
      });

      // 克隆完成后自动选中克隆出来的对象
      this.setSelection(clones);

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
  async deleteSelected(): Promise<void> {
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

    // 关键：多选删除是一种“集体操作”，应该只占用历史栈中的 1 个元素
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
  }
}
