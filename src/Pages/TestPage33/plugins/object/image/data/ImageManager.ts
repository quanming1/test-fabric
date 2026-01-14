import { FabricImage, type FabricObject, type TOptions, type ImageProps } from "fabric";
import { Category, genId, type CanvasEditor, type HistoryRecord } from "../../../../core";
import { EditorMode } from "../../../mode/ModePlugin";
import { ImageHistoryHandler } from "./ImageHistoryHandler";
import { ImageRenderer } from "../render/ImageRenderer";
import { EXTRA_PROPS } from "../types";

/** 图片上传服务地址 */
const UPLOAD_API = "http://localhost:3001/api/upload/image";

export interface ImageManagerOptions {
    editor: CanvasEditor;
}

/**
 * 图片数据管理器
 * 职责：图片的增删改查、历史记录、序列化
 */
export class ImageManager {
    private editor: CanvasEditor;
    private historyHandler: ImageHistoryHandler;
    private renderer: ImageRenderer;

    constructor(options: ImageManagerOptions) {
        this.editor = options.editor;
        this.renderer = new ImageRenderer(this.editor.canvas, this.editor.metadata);
        this.historyHandler = new ImageHistoryHandler({
            editor: this.editor,
            historyManager: this.editor.history,
            pluginName: "image",
            getImageList: () => this.imageList,
        });
    }

    // ─── 查询 ─────────────────────────────────────────

    get imageList(): FabricObject[] {
        return this.renderer.getImages();
    }

    // ─── 图片上传 ─────────────────────────────────────────

    /**
     * 上传图片文件到服务器
     * @returns 图片的访问 URL
     */
    private async uploadImage(file: File): Promise<string> {
        const formData = new FormData();
        formData.append("image", file);

        const response = await fetch(UPLOAD_API, {
            method: "POST",
            body: formData,
        });

        if (!response.ok) {
            throw new Error(`上传失败: ${response.status}`);
        }

        const result = await response.json();
        if (!result.success || !result.url) {
            throw new Error(result.error || "上传失败");
        }

        return result.url;
    }

    // ─── 添加图片 ─────────────────────────────────────────

    async addFromFile(file: File): Promise<FabricImage | null> {
        try {
            // 先上传图片获取 URL
            const url = await this.uploadImage(file);
            console.log("[ImageManager] 图片已上传:", url);

            // 使用 URL 创建图片
            return this.addFromUrl(url);
        } catch (e) {
            console.error("[ImageManager] 上传图片失败:", e);
            return null;
        }
    }

    async addFromUrl(url: string): Promise<FabricImage | null> {
        try {
            const img = await FabricImage.fromURL(url, { crossOrigin: "anonymous" });

            const imgWidth = img.width || 100;
            const imgHeight = img.height || 100;
            const transform = this.renderer.calculateInitialTransform(imgWidth, imgHeight);

            this.renderer.configureNewImage(img, transform);

            // 设置元数据
            const id = genId("img");
            this.editor.metadata.set(img, { category: Category.Image, id });

            // 添加到画布并注册到渲染器
            this.renderer.addImage(id, img);

            // 记录历史
            const snapshot = this.historyHandler.createSnapshot(img);
            this.historyHandler.recordAdd([id], [snapshot]);

            // 在 Select 模式下选中新图片
            const modePlugin = this.editor.getPlugin<any>("mode");
            if ((modePlugin?.mode as EditorMode) === EditorMode.Select) {
                this.renderer.setActiveObject(img);
            }

            this.renderer.requestRender();
            this.editor.eventBus.emit("image:added", img);

            return img;
        } catch (e) {
            console.error("Failed to add image:", e);
            return null;
        }
    }

    // ─── 删除图片 ─────────────────────────────────────────

    remove(ids: string[], recordHistory: boolean): void {
        const images = ids
            .map((id) => this.editor.metadata.getById(id))
            .filter(
                (obj): obj is FabricObject =>
                    obj !== undefined && this.editor.metadata.is(obj, "category", Category.Image)
            );

        if (images.length === 0) return;

        if (recordHistory) {
            this.historyHandler.recordDelete(images);
        }

        ids.forEach((id) => this.renderer.removeImage(id));
    }

    // ─── 克隆图片 ─────────────────────────────────────────

    async clone(
        ids: string[],
        options?: { offset?: { x: number; y: number }; recordHistory?: boolean }
    ): Promise<FabricObject[]> {
        const offset = options?.offset ?? { x: 20, y: 20 };
        const recordHistory = options?.recordHistory ?? true;

        const sources = ids
            .map((id) => this.editor.metadata.getById(id))
            .filter(
                (obj): obj is FabricObject =>
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

    recordClone(objects: FabricObject[]): void {
        this.historyHandler.recordClone(objects);
    }

    // ─── 变换记录 ─────────────────────────────────────────

    onTransformStart(objects: FabricObject[]): void {
        this.historyHandler.onTransformStart(objects);
    }

    onObjectModified(objects: FabricObject[]): void {
        this.historyHandler.onObjectModified(objects);
    }

    // ─── 历史记录 ─────────────────────────────────────────

    async applyUndo(record: HistoryRecord): Promise<void> {
        await this.historyHandler.applyUndo(record);
    }

    async applyRedo(record: HistoryRecord): Promise<void> {
        await this.historyHandler.applyRedo(record);
    }

    // ─── 模式切换 ─────────────────────────────────────────

    applyModeConfig(mode: EditorMode): void {
        this.renderer.setMode(mode);
    }

    applyModeConfigToObject(obj: FabricObject, mode: EditorMode): void {
        this.renderer.applyModeConfigToObject(obj, mode);
    }

    // ─── 序列化 ─────────────────────────────────────────

    exportData(): object[] {
        return this.imageList.map((obj) => obj.toObject([...EXTRA_PROPS]));
    }

    async importData(data: object[]): Promise<void> {
        if (!Array.isArray(data)) return;

        for (const item of data) {
            const img = await FabricImage.fromObject(item as TOptions<ImageProps>);
            const id = this.editor.metadata.get(img as unknown as FabricObject)?.id;
            if (id) {
                this.renderer.addImage(id, img as unknown as FabricObject);
            } else {
                // 兼容没有 id 的旧数据
                this.editor.canvas.add(img as unknown as FabricObject);
            }
        }

        this.renderer.requestRender();
    }

    clearAll(): void {
        this.renderer.clear();
        this.renderer.requestRender();
    }
}
