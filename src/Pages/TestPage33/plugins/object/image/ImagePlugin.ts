import { FabricImage } from "fabric";
import { BasePlugin } from "../../base/Plugin";
import { Category, genId } from "../../../core";
import { EditorMode } from "../../mode/ModePlugin";

/**
 * 图片插件
 * 功能：上传图片到画布
 * 事件：image:added
 */
export class ImagePlugin extends BasePlugin {
    readonly name = "image";

    protected onInstall(): void {
        this.canvas.on("object:added", this.onObjectAdded);
        this.eventBus.on("mode:change", this.onModeChange);
    }

    /**
     * 模式变化时更新图片的可选状态
     */
    private onModeChange = ({ mode }: { mode: EditorMode }): void => {
        const selectable = mode === EditorMode.Select;
        this.setImagesSelectable(selectable);
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
        const isSelectMode = modePlugin?.mode === EditorMode.Select;
        obj.selectable = isSelectMode;
        obj.evented = isSelectMode;
    };

    /**
     * 设置所有图片的可选状态
     */
    private setImagesSelectable(selectable: boolean): void {
        this.editor.metadata.filter("category", Category.Image).forEach((obj) => {
            console.log(obj);

            obj.selectable = selectable;
            obj.evented = selectable;
            obj.setCoords();
        });
    }

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
            this.canvas.requestRenderAll();

            this.eventBus.emit("image:added", img);
            return img;
        } catch (e) {
            console.error("Failed to add image:", e);
            return null;
        }
    }

    /**
     * 打开文件选择器上传图片
     */
    openFilePicker(): void {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "image/*";
        input.onchange = async (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (file) {
                await this.addImageFromFile(file);
            }
        };
        input.click();
    }

    protected onDestroy(): void {
        this.canvas.off("object:added", this.onObjectAdded);
        this.eventBus.off("mode:change", this.onModeChange);
    }
}
