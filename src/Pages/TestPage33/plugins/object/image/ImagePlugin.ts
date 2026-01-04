import { FabricImage, type FabricObject, type TOptions, type ImageProps } from "fabric";
import { BasePlugin } from "../../base/Plugin";
import { Category, genId } from "../../../core";
import { EditorMode } from "../../mode/ModePlugin";

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

    protected onInstall(): void {
        this.canvas.on("object:added", this.onObjectAdded);
        this.eventBus.on("mode:change", this.onModeChange);
    }

    /** 各模式下图片的交互配置 */
    private static readonly MODE_CONFIG: Record<EditorMode, { selectable: boolean; evented: boolean }> = {
        [EditorMode.Select]: { selectable: true, evented: true },
        [EditorMode.Pan]: { selectable: false, evented: false },
        [EditorMode.DrawRect]: { selectable: false, evented: false },
        [EditorMode.RangeSelect]: { selectable: false, evented: true },
    };

    /**
     * 模式变化时更新图片的可选状态
     */
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

    /**
     * 新图片添加时设置可选状态
     */
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

    /**
     * 通过文件上传图片
     */
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

    /**
     * 通过 URL 添加图片
     */
    async addImageFromUrl(url: string): Promise<FabricImage | null> {
        try {
            const img = await FabricImage.fromURL(url, { crossOrigin: "anonymous" });

            // 计算合适的初始尺寸（不超过画布的 80%）
            const canvasWidth = this.canvas.width || 800;
            const canvasHeight = this.canvas.height || 600;
            const maxWidth = canvasWidth * 0.8;
            const maxHeight = canvasHeight * 0.8;

            const imgWidth = img.width || 100;
            const imgHeight = img.height || 100;
            const scale = Math.min(maxWidth / imgWidth, maxHeight / imgHeight, 1);

            // 居中放置
            const vpt = this.canvas.viewportTransform;
            const zoom = this.canvas.getZoom();
            let centerX = canvasWidth / 2;
            let centerY = canvasHeight / 2;

            if (vpt) {
                // 考虑视口变换，计算场景中心
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

            // 标记元数据
            this.editor.metadata.set(img, {
                category: Category.Image,
                id: genId("img"),
            });

            this.canvas.add(img);
            // 只有在选择模式下才自动选中图片
            const modePlugin = this.editor.getPlugin<any>("mode");
            if (modePlugin?.mode === EditorMode.Select) {
                this.canvas.setActiveObject(img);
            }
            // // 图片被添加之后，自动切换到选择模式
            // this.editor.getPlugin<ModePlugin>("mode")?.setMode(EditorMode.Select);
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
        this.eventBus.off("mode:change", this.onModeChange);
    }

    // ─── 序列化 ─────────────────────────────────────────

    /** 获取所有图片对象 */
    private get imageList(): FabricObject[] {
        return this.editor.metadata.filter("category", Category.Image);
    }

    /** 导出所有图片数据 */
    exportData(): object[] {
        return this.imageList.map((obj) => obj.toObject([...EXTRA_PROPS]));
    }

    /** 导入图片数据 */
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

    /** 清空所有图片 */
    clearAll(): void {
        this.imageList.forEach((obj) => this.canvas.remove(obj));
        this.canvas.requestRenderAll();
    }
}
