import { FabricImage, type FabricObject } from "fabric";
import { Category, genId, type CanvasEditor, type HistoryRecord } from "../../../../core";
import { EditorMode } from "../../../mode/ModePlugin";
import { ImageHistoryHandler } from "./ImageHistoryHandler";
import { ImageRenderer } from "../render/ImageRenderer";
import { ImageFactory } from "../helper";
import { EXTRA_PROPS } from "../types";

export interface ImageManagerOptions {
    editor: CanvasEditor;
}

/** 添加图片的配置 */
export interface AddImageConfig {
    id?: string;                // 指定 ID，不传则自动生成
    recordHistory?: boolean;    // 是否记录历史，默认 true
    needSync?: boolean;         // 是否需要同步，默认 true
    setActive?: boolean;        // 是否设为选中，默认 true
}

/** 删除图片的配置 */
export interface RemoveImageConfig {
    recordHistory?: boolean;    // 是否记录历史，默认 true
}

/**
 * 图片数据管理器
 * 职责：图片的增删改查、历史记录、序列化
 * 
 * 这是操作图片的唯一入口，所有图片操作都应该通过这个类
 */
export class ImageManager {
    private editor: CanvasEditor;               // 编辑器实例
    private renderer: ImageRenderer;            // 渲染器
    private historyHandler!: ImageHistoryHandler; // 历史处理器（延迟初始化）

    constructor(options: ImageManagerOptions) {
        this.editor = options.editor;
        this.renderer = new ImageRenderer(this.editor.canvas, this.editor.metadata);

        // 延迟初始化 historyHandler，因为它需要 this
        this.historyHandler = new ImageHistoryHandler({
            editor: this.editor,
            historyManager: this.editor.history,
            pluginName: "image",
            manager: this,
        });
    }

    // ─── 查询（公开） ─────────────────────────────────────────

    /** 获取所有图片列表 */
    get imageList(): FabricObject[] {
        return this.renderer.getImages();
    }

    /** 根据 ID 获取图片 */
    getById(id: string): FabricObject | undefined {
        return this.editor.metadata.getById(id);
    }


    // ─── 核心操作（公开） ─────────────────────────────────────────

    /**
     * 添加图片到画布
     * 这是添加图片的统一入口
     * 
     * @param img FabricImage 对象（由 ImageFactory 创建）
     * @param config 配置选项
     */
    add(img: FabricImage, config?: AddImageConfig): string {
        const {
            id = genId("img"),
            recordHistory = true,
            needSync = true,
            setActive = true,
        } = config ?? {};

        // 1. 设置元数据
        this.editor.metadata.set(img, { category: Category.Image, id });

        // 2. 添加到渲染器（会同时添加到画布和 objects Map）
        this.renderer.addImage(id, img);

        // 3. 记录历史
        if (recordHistory) {
            const snapshot = this.historyHandler.createSnapshot(img);
            this.historyHandler.recordAdd([id], [snapshot], { needSync });
        }

        // 4. 设为选中
        if (setActive) {
            const modePlugin = this.editor.getPlugin<any>("mode");
            if ((modePlugin?.mode as EditorMode) === EditorMode.Select) {
                this.renderer.setActiveObject(img);
            }
        }

        this.renderer.requestRender();
        this.editor.eventBus.emit("image:added", img);

        return id;
    }

    /**
     * 删除图片
     * 
     * @param ids 要删除的图片 ID 列表
     * @param config 配置选项
     */
    remove(ids: string[], config?: RemoveImageConfig): void {
        const { recordHistory = true } = config ?? {};

        // 获取要删除的图片对象（用于记录历史）
        const images = ids
            .map((id) => this.editor.metadata.getById(id))
            .filter((obj): obj is FabricObject =>
                obj !== undefined && this.editor.metadata.is(obj, "category", Category.Image)
            );

        if (images.length === 0) return;

        // 记录历史（在删除之前）
        if (recordHistory) {
            this.historyHandler.recordDelete(images);
        }

        // 从渲染器删除
        ids.forEach((id) => this.renderer.removeImage(id));
        this.renderer.requestRender();
    }

    /**
     * 克隆图片
     */
    async clone(
        ids: string[],
        options?: { offset?: { x: number; y: number }; recordHistory?: boolean }
    ): Promise<FabricObject[]> {
        const offset = options?.offset ?? { x: 20, y: 20 };
        const recordHistory = options?.recordHistory ?? true;

        const sources = ids
            .map((id) => this.editor.metadata.getById(id))
            .filter((obj): obj is FabricObject =>
                obj !== undefined && this.editor.metadata.is(obj, "category", Category.Image)
            );

        if (sources.length === 0) return [];

        const clones: FabricObject[] = [];
        for (const src of sources) {
            const clone = await src.clone();
            clone.set({
                left: (src.left || 0) + offset.x,
                top: (src.top || 0) + offset.y,
            });

            const newId = genId("img");
            this.editor.metadata.clone(src, clone, newId);
            this.renderer.addImage(newId, clone);
            clones.push(clone);
        }

        if (recordHistory) {
            this.historyHandler.recordClone(clones);
        }

        return clones;
    }

    /** 记录克隆操作（供外部调用，如 SelectionPlugin） */
    recordClone(objects: FabricObject[]): void {
        this.historyHandler.recordClone(objects);
    }


    // ─── 便捷方法（公开） ─────────────────────────────────────────

    /**
     * 从 URL 添加图片（便捷方法）
     */
    async addFromUrl(url: string, config?: AddImageConfig): Promise<FabricImage | null> {
        try {
            const img = await ImageFactory.fromUrl(url);
            this.configureNewImage(img);
            this.add(img, config);
            return img;
        } catch (e) {
            console.error("[ImageManager] 从 URL 添加图片失败:", e);
            return null;
        }
    }

    /**
     * 从文件添加图片（便捷方法）
     */
    async addFromFile(file: File, config?: AddImageConfig): Promise<FabricImage | null> {
        try {
            const img = await ImageFactory.fromFile(file);
            this.configureNewImage(img);
            this.add(img, config);
            return img;
        } catch (e) {
            console.error("[ImageManager] 从文件添加图片失败:", e);
            return null;
        }
    }

    // ─── 变换记录（公开） ─────────────────────────────────────────

    onTransformStart(objects: FabricObject[]): void {
        this.historyHandler.onTransformStart(objects);
    }

    onObjectModified(objects: FabricObject[]): void {
        this.historyHandler.onObjectModified(objects);
    }

    // ─── 历史记录（公开） ─────────────────────────────────────────

    async applyUndo(record: HistoryRecord): Promise<void> {
        await this.historyHandler.applyUndo(record);
    }

    async applyRedo(record: HistoryRecord): Promise<void> {
        await this.historyHandler.applyRedo(record);
    }

    // ─── 模式切换（公开） ─────────────────────────────────────────

    applyModeConfig(mode: EditorMode): void {
        this.renderer.setMode(mode);
    }

    applyModeConfigToObject(obj: FabricObject, mode: EditorMode): void {
        this.renderer.applyModeConfigToObject(obj, mode);
    }

    // ─── 序列化（公开） ─────────────────────────────────────────

    exportData(): object[] {
        return this.imageList.map((obj) => obj.toObject([...EXTRA_PROPS]));
    }

    async importData(data: object[]): Promise<void> {
        if (!Array.isArray(data)) return;

        for (const item of data) {
            const img = await ImageFactory.fromSnapshot(item as Record<string, unknown>);
            const existingId = this.editor.metadata.get(img as unknown as FabricObject)?.id;

            // 导入时不记录历史
            this.add(img, {
                id: existingId,
                recordHistory: false,
                needSync: false,
                setActive: false,
            });
        }
    }

    clearAll(): void {
        this.renderer.clear();
        this.renderer.requestRender();
    }

    // ─── 私有方法 ─────────────────────────────────────────

    /**
     * 配置新创建的图片（居中、适应画布）
     */
    private configureNewImage(img: FabricImage): void {
        const imgWidth = img.width || 100;
        const imgHeight = img.height || 100;
        const transform = this.renderer.calculateInitialTransform(imgWidth, imgHeight);
        this.renderer.configureNewImage(img, transform);
    }
}
