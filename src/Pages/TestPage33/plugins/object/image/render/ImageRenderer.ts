import { FabricImage, type FabricObject, type Canvas } from "fabric";
import { BaseRenderer } from "../../../../core/render";
import { Category, type ObjectMetadata } from "../../../../core";
import { EditorMode } from "../../../mode/ModePlugin";
import { IMAGE_MODE_CONFIG, type ImageStyle, DEFAULT_IMAGE_STYLE } from "../types";

/** 图片渲染数据（用于 sync） */
export interface ImageRenderData {
    id: string;
    obj: FabricObject;
}

/** Hover 边框样式配置 */
const HOVER_BORDER_STYLE = {
    stroke: "#7171ee",
    strokeWidth: 1,
};

/**
 * 图片渲染器
 * 继承 BaseRenderer，管理图片对象的渲染状态、交互配置
 * 
 * 注意：与 MarkerRenderer 不同，Image 的 Fabric 对象由外部创建并传入，
 * 本渲染器主要负责状态同步和交互配置，而非创建对象
 */
export class ImageRenderer extends BaseRenderer<ImageRenderData, ImageStyle, FabricObject> {
    private currentMode: EditorMode = EditorMode.Select;
    private hoveredObject: FabricObject | null = null;
    private hoverHandlersBound = false;

    constructor(canvas: Canvas, metadata: ObjectMetadata, style: Partial<ImageStyle> = {}) {
        super(canvas, metadata, DEFAULT_IMAGE_STYLE, style);
        this.bindHoverHandlers();
    }

    /** 绑定 hover 事件处理 */
    private bindHoverHandlers(): void {
        if (this.hoverHandlersBound) return;

        this.canvas.on("mouse:over", (e) => {
            const target = e.target;
            if (!target || !this.isImageObject(target)) return;
            // active 状态不加 hover 边框
            if (this.canvas.getActiveObject() === target) return;

            this.hoveredObject = target;
            this.applyHoverBorder(target);
            this.canvas.requestRenderAll();
        });

        this.canvas.on("mouse:out", (e) => {
            const target = e.target;
            if (!target || target !== this.hoveredObject) return;

            this.clearHoverBorder(target);
            this.hoveredObject = null;
            this.canvas.requestRenderAll();
        });

        // 选中时立即移除 hover 边框
        const clearHoverOnSelect = (target: FabricObject | undefined) => {
            if (target && target === this.hoveredObject) {
                this.clearHoverBorder(target);
                this.hoveredObject = null;
                this.canvas.requestRenderAll();
            }
        };

        this.canvas.on("selection:created", (e) => clearHoverOnSelect(e.selected?.[0]));
        this.canvas.on("selection:updated", (e) => clearHoverOnSelect(e.selected?.[0]));

        this.hoverHandlersBound = true;
    }

    /** 应用 hover 边框（宽度不随 zoom 和图片缩放变化） */
    private applyHoverBorder(target: FabricObject): void {
        const zoom = this.canvas.getZoom();
        const scaleX = target.scaleX || 1;
        // 边框宽度需要除以 zoom 和图片缩放，保持视觉宽度一致
        target.set({
            stroke: HOVER_BORDER_STYLE.stroke,
            strokeWidth: HOVER_BORDER_STYLE.strokeWidth / zoom / scaleX,
        });
    }

    /** 清除 hover 边框 */
    private clearHoverBorder(target: FabricObject): void {
        target.set({
            stroke: undefined,
            strokeWidth: 0,
        });
    }

    /** 更新 hover 边框（zoom 变化时调用） */
    updateHoverBorder(): void {
        if (this.hoveredObject) {
            this.applyHoverBorder(this.hoveredObject);
            this.canvas.requestRenderAll();
        }
    }

    /** 判断对象是否为图片 */
    private isImageObject(obj: FabricObject): boolean {
        const meta = this.metadata.get(obj);
        return meta?.category === Category.Image;
    }

    protected getDataId(data: ImageRenderData): string {
        return data.id;
    }

    /**
     * 图片对象由外部创建，这里只做注册
     */
    protected createObject(_id: string, data: ImageRenderData, _index: number, _inverseZoom: number): void {
        this.objects.set(data.id, data.obj);
        this.applyModeConfigToObject(data.obj, this.currentMode);
    }

    /**
     * 更新图片状态（主要是交互配置）
     */
    protected updateObject(_id: string, obj: FabricObject, _data: ImageRenderData, _index: number, _inverseZoom: number): void {
        this.applyModeConfigToObject(obj, this.currentMode);
    }

    // ─── 模式管理 ─────────────────────────────────────────

    /**
     * 设置当前模式并更新所有图片的交互状态
     */
    setMode(mode: EditorMode): void {
        this.currentMode = mode;
        const config = IMAGE_MODE_CONFIG[mode];
        if (!config) {
            throw new Error(`[ImageRenderer] 未知的 mode: ${mode}`);
        }

        for (const obj of this.objects.values()) {
            obj.selectable = config.selectable;
            obj.evented = config.evented;
            obj.setCoords();
        }
    }

    /**
     * 为单个图片应用模式配置
     */
    applyModeConfigToObject(obj: FabricObject, mode: EditorMode): void {
        const config = IMAGE_MODE_CONFIG[mode] ?? { selectable: false, evented: false };
        obj.selectable = config.selectable;
        obj.evented = config.evented;
    }

    // ─── 图片创建辅助 ─────────────────────────────────────────

    /**
     * 计算图片的初始位置和缩放（居中显示，适应画布）
     */
    calculateInitialTransform(
        imgWidth: number,
        imgHeight: number
    ): { left: number; top: number; scale: number } {
        const canvasWidth = this.canvas.width || 800;
        const canvasHeight = this.canvas.height || 600;
        const maxWidth = canvasWidth * 0.8;
        const maxHeight = canvasHeight * 0.8;

        const scale = Math.min(maxWidth / imgWidth, maxHeight / imgHeight, 1);

        const vpt = this.canvas.viewportTransform;
        const zoom = this.canvas.getZoom();
        let centerX = canvasWidth / 2;
        let centerY = canvasHeight / 2;

        if (vpt) {
            centerX = (centerX - vpt[4]) / zoom;
            centerY = (centerY - vpt[5]) / zoom;
        }

        return { left: centerX, top: centerY, scale };
    }

    /**
     * 配置新创建的图片对象
     */
    configureNewImage(
        img: FabricImage,
        transform: { left: number; top: number; scale: number }
    ): void {
        img.set({
            left: transform.left,
            top: transform.top,
            originX: "center",
            originY: "center",
            scaleX: transform.scale,
            scaleY: transform.scale,
            selectable: true,
            evented: true,
        });
    }

    // ─── 画布操作 ─────────────────────────────────────────

    /**
     * 添加图片到画布并注册
     */
    addImage(id: string, img: FabricObject): void {
        this.canvas.add(img);
        this.objects.set(id, img);
        this.applyModeConfigToObject(img, this.currentMode);
    }

    /**
     * 从画布移除图片
     */
    removeImage(id: string): void {
        const obj = this.objects.get(id);
        if (obj) {
            this.canvas.remove(obj);
            this.objects.delete(id);
        }
    }

    /**
     * 设置活动对象
     */
    setActiveObject(img: FabricObject): void {
        this.canvas.setActiveObject(img);
    }

    /**
     * 清空所有图片
     */
    clear(): void {
        for (const obj of this.objects.values()) {
            this.canvas.remove(obj);
        }
        this.objects.clear();
    }

    /**
     * 请求重新渲染（覆盖为 public）
     */
    override requestRender(): void {
        this.canvas.requestRenderAll();
    }

    // ─── 查询 ─────────────────────────────────────────

    /**
     * 获取所有图片对象
     */
    getImages(): FabricObject[] {
        return this.metadata.filter("category", Category.Image);
    }

    /**
     * 根据 ID 获取图片
     */
    getById(id: string): FabricObject | undefined {
        return this.metadata.getById(id);
    }

    /**
     * 检查是否已注册
     */
    has(id: string): boolean {
        return this.objects.has(id);
    }
}
