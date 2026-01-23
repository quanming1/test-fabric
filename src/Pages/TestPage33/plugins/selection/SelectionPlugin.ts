import { type FabricObject, ActiveSelection } from "fabric";
import { BasePlugin } from "../base/Plugin";
import { Category, CoordinateHelper } from "../../core";
import type { ToolbarPosition } from "../../core/types";
import type { DrawPlugin } from "../draw/DrawPlugin";
import type { ImagePlugin } from "../object/image/ImagePlugin";
import type { MarkerPlugin } from "../object/marker/MarkerPlugin";
import { FloatingToolbar } from "./FloatingToolbar";

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

  constructor(config?: Partial<SelectionConfig>) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
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

    // 注册浮动工具栏 DOM 图层
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

  /** 变换过程中（移动/缩放/旋转）隐藏工具栏 */
  private onObjectTransforming = (): void => {
    this.eventBus.emit("toolbar:update", { x: 0, y: 0, visible: false });
  };

  /** 变换结束（modified）后更新工具栏 */
  private onObjectTransformEnd = (): void => {
    this.updateToolbar();
  };

  /** 工具栏宽度（由 FloatingToolbar 组件测量后设置） */
  private toolbarWidth = 72;
  /** 标签区域预留宽度（文件名 + 尺寸信息的最小显示宽度） */
  private static readonly LABEL_RESERVED_WIDTH = 120;

  /** 设置工具栏宽度（由 FloatingToolbar 组件调用） */
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

    const coordHelper = new CoordinateHelper(vpt);
    const boundingRect = this.activeObject.getBoundingRect();
    const topLeft = coordHelper.sceneToScreen({ x: boundingRect.left, y: boundingRect.top });
    const screenWidth = boundingRect.width * vpt[0];

    // 默认居中位置
    let x = topLeft.x + screenWidth / 2;
    const y = topLeft.y - this.config.toolbarOffsetY;

    // 判断是否需要右对齐（避免遮挡图片标签）
    // 条件：单选图片时，工具栏居中会遮挡左侧标签区域
    if (this.shouldAlignRight(screenWidth)) {
      // 工具栏左边缘对齐图片右边缘：x = 图片右边界 + 工具栏半宽（因为 transform: translate(-50%)）
      x = topLeft.x + screenWidth + this.toolbarWidth / 2;
    }

    const pos: ToolbarPosition = { x, y, visible: true };
    this.eventBus.emit("toolbar:update", pos);
  };

  /**
   * 判断工具栏是否应该右对齐
   * 当单选图片且工具栏居中会遮挡标签时返回 true
   */
  private shouldAlignRight(screenWidth: number): boolean {
    // 只有单选时才考虑（多选没有标签）
    if (this.isMultiSelection) return false;

    // 检查是否是图片类型
    const meta = this.editor.metadata.get(this.activeObject!);
    if (meta?.category !== Category.Image) return false;

    // 计算工具栏居中时的左边界距离图片左边界的距离
    const toolbarHalfWidth = this.toolbarWidth / 2;
    const toolbarLeftOffset = screenWidth / 2 - toolbarHalfWidth;

    // 如果工具栏左边界侵入标签预留区域，则需要右对齐
    return toolbarLeftOffset < SelectionPlugin.LABEL_RESERVED_WIDTH;
  }

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
    this.editor.domLayer.unregister("floating-toolbar");
  }
}
