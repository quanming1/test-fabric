import { FabricImage, type FabricObject, type TOptions, type ImageProps } from "fabric";
import { BasePlugin } from "../../base/Plugin";
import { Category, genId, type HistoryRecord } from "../../../core";
import { EditorMode } from "../../mode/ModePlugin";
import { ImageHistoryHandler } from "./ImageHistoryHandler";

/** 图片需要额外序列化的属性 */
const EXTRA_PROPS = ["data", "src", "crossOrigin"] as const;

/**
 * 图片插件
 * 功能：上传图片到画布
 * 事件：image:added
 */
export class ImagePlugin extends BasePlugin {
  readonly name = "image";
  override serializable = true;
  override importOrder = 5;

  private historyHandler!: ImageHistoryHandler;

  protected onInstall(): void {
    this.historyHandler = new ImageHistoryHandler({
      editor: this.editor,
      historyManager: this.editor.history,
      pluginName: this.name,
      getImageList: () => this.imageList,
    });

    this.canvas.on("object:added", this.onObjectAdded);
    this.canvas.on("object:modified", this.onObjectModified);
    // Fabric 内置：变换开始前（drag/scale/rotate 等）
    this.canvas.on("before:transform", this.onBeforeTransform);
    this.eventBus.on("mode:change", this.onModeChange);
  }

  /** 各模式下图片的交互配置 */
  private static readonly MODE_CONFIG: Record<
    EditorMode,
    { selectable: boolean; evented: boolean }
  > = {
    [EditorMode.Select]: { selectable: true, evented: true },
    [EditorMode.Pan]: { selectable: false, evented: false },
    [EditorMode.DrawRect]: { selectable: false, evented: false },
    [EditorMode.RangeSelect]: { selectable: false, evented: true },
  };

  // ─── 历史记录事件 ─────────────────────────────────────────

  /**
   * Fabric: before:transform
   * - opt.transform.action 常见为 drag/scale/scaleX/scaleY/rotate
   * - opt.target 可能是单对象或 ActiveSelection
   */
  private onBeforeTransform = (opt: any): void => {
    const target = opt?.target as FabricObject | undefined;
    if (!target) return;

    const objects =
      target.type === "activeselection"
        ? ((target as any).getObjects() as FabricObject[])
        : [target];

    this.historyHandler.onTransformStart(objects);
  };

  private onObjectModified = (opt: any): void => {
    const target = opt.target as FabricObject;
    if (!target) return;

    const objects =
      target.type === "activeselection"
        ? ((target as any).getObjects() as FabricObject[])
        : [target];

    this.historyHandler.onObjectModified(objects);
  };

  applyUndo(record: HistoryRecord): void {
    this.historyHandler.applyUndo(record);
  }

  applyRedo(record: HistoryRecord): void {
    this.historyHandler.applyRedo(record);
  }

  /**
   * 删除指定 ID 的对象
   * @param ids 要删除的对象 ID 列表
   * @param recordHistory 是否记录历史
   */
  remove(ids: string[], recordHistory: boolean): void {
    const images = ids
      .map((id) => this.editor.metadata.getById(id))
      .filter(
        (obj): obj is FabricObject =>
          obj !== undefined && this.editor.metadata.is(obj, "category", Category.Image),
      );
    if (images.length === 0) return;

    if (recordHistory) {
      this.historyHandler.recordDelete(images);
    }

    images.forEach((obj) => this.canvas.remove(obj));
  }

  /**
   * 记录复制操作（供外部调用）
   */
  recordClone(objects: FabricObject[]): void {
    this.historyHandler.recordClone(objects);
  }

  /**
   * 复制指定 ID 的对象（由插件内部处理克隆、元数据、新 ID、历史记录）
   */
  async clone(
    ids: string[],
    options?: { offset?: { x: number; y: number }; recordHistory?: boolean },
  ): Promise<FabricObject[]> {
    const offset = options?.offset ?? { x: 20, y: 20 };
    const recordHistory = options?.recordHistory ?? true;

    const sources = ids
      .map((id) => this.editor.metadata.getById(id))
      .filter(
        (obj): obj is FabricObject =>
          obj !== undefined && this.editor.metadata.is(obj, "category", Category.Image),
      );
    if (sources.length === 0) return [];

    const clones: FabricObject[] = [];
    for (const src of sources) {
      const clone = await src.clone();
      clone.set({
        left: (src.left || 0) + offset.x,
        top: (src.top || 0) + offset.y,
      });

      // 克隆元数据并生成新 ID（保持 Image 的 id 前缀风格）
      this.editor.metadata.clone(src, clone, genId("img"));

      this.canvas.add(clone);
      clones.push(clone);
    }

    if (recordHistory) {
      this.historyHandler.recordClone(clones);
    }

    return clones;
  }

  // ─── 模式切换 ─────────────────────────────────────────

  private onModeChange = ({ mode }: { mode: EditorMode }): void => {
    const config = ImagePlugin.MODE_CONFIG[mode];
    if (!config) {
      throw new Error("[onModeChange] 未知的mode");
    }

    this.editor.metadata.filter("category", Category.Image).forEach((obj) => {
      obj.selectable = config.selectable;
      obj.evented = config.evented;
      obj.setCoords();
    });
  };

  private onObjectAdded = (opt: any): void => {
    const obj = opt.target;
    if (!obj) return;

    const isImage = this.editor.metadata.is(obj, "category", Category.Image);
    if (!isImage) return;

    const modePlugin = this.editor.getPlugin<any>("mode");
    const mode = modePlugin?.mode as EditorMode;
    const config = ImagePlugin.MODE_CONFIG[mode] ?? { selectable: false, evented: false };
    obj.selectable = config.selectable;
    obj.evented = config.evented;
  };

  // ─── 公开 API ─────────────────────────────────────────

  async addImageFromFile(file: File): Promise<FabricImage | null> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const dataUrl = e.target?.result as string;
        if (!dataUrl) {
          resolve(null);
          return;
        }
        const img = await this.addImageFromUrl(dataUrl);
        resolve(img);
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
  }

  async addImageFromUrl(url: string): Promise<FabricImage | null> {
    try {
      const img = await FabricImage.fromURL(url, { crossOrigin: "anonymous" });

      const canvasWidth = this.canvas.width || 800;
      const canvasHeight = this.canvas.height || 600;
      const maxWidth = canvasWidth * 0.8;
      const maxHeight = canvasHeight * 0.8;

      const imgWidth = img.width || 100;
      const imgHeight = img.height || 100;
      const scale = Math.min(maxWidth / imgWidth, maxHeight / imgHeight, 1);

      const vpt = this.canvas.viewportTransform;
      const zoom = this.canvas.getZoom();
      let centerX = canvasWidth / 2;
      let centerY = canvasHeight / 2;

      if (vpt) {
        centerX = (centerX - vpt[4]) / zoom;
        centerY = (centerY - vpt[5]) / zoom;
      }

      img.set({
        left: centerX,
        top: centerY,
        originX: "center",
        originY: "center",
        scaleX: scale,
        scaleY: scale,
        selectable: true,
        evented: true,
      });

      const id = genId("img");
      this.editor.metadata.set(img, { category: Category.Image, id });

      this.canvas.add(img);

      // 记录添加操作
      const snapshot = this.historyHandler.createSnapshot(img);
      this.historyHandler.recordAdd([id], [snapshot]);

      const modePlugin = this.editor.getPlugin<any>("mode");
      if (modePlugin?.mode === EditorMode.Select) {
        this.canvas.setActiveObject(img);
      }
      this.canvas.requestRenderAll();

      this.eventBus.emit("image:added", img);
      return img;
    } catch (e) {
      console.error("Failed to add image:", e);
      return null;
    }
  }

  protected onDestroy(): void {
    this.canvas.off("object:added", this.onObjectAdded);
    this.canvas.off("object:modified", this.onObjectModified);
    this.canvas.off("before:transform", this.onBeforeTransform);
    this.eventBus.off("mode:change", this.onModeChange);
  }

  // ─── 序列化 ─────────────────────────────────────────

  private get imageList(): FabricObject[] {
    return this.editor.metadata.filter("category", Category.Image);
  }

  exportData(): object[] {
    return this.imageList.map((obj) => obj.toObject([...EXTRA_PROPS]));
  }

  async importData(data: object[]): Promise<void> {
    if (!Array.isArray(data)) return;

    for (const item of data) {
      const img = await FabricImage.fromObject(item as TOptions<ImageProps>);
      this.canvas.add(img as unknown as FabricObject);
    }

    const modePlugin = this.editor.getPlugin<any>("mode");
    const mode = modePlugin?.mode as EditorMode;
    if (mode) this.onModeChange({ mode });
    this.canvas.requestRenderAll();
  }

  clearAll(): void {
    this.imageList.forEach((obj) => this.canvas.remove(obj));
    this.canvas.requestRenderAll();
  }
}
