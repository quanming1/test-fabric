import { FabricText, Group, type Canvas, type FabricObject, FabricImage } from "fabric";
import { BaseRenderer } from "../../../../core/render";
import { Category, type ObjectMetadata } from "../../../../core";

// ─── 类型定义 ─────────────────────────────────────────

/** 标签样式配置 */
export interface LabelStyle {
    fontSize: number;
    fontFamily: string;
    textColor: string;
    /** 标签距离图片顶部的偏移（视觉像素） */
    offsetY: number;
    /** 文件名和尺寸之间的最小间距 */
    gap: number;
}

const DEFAULT_LABEL_STYLE: LabelStyle = {
    fontSize: 12,
    fontFamily: "Arial, sans-serif",
    textColor: "#00000073",
    offsetY: 4,
    gap: 8,
};

/** 标签渲染数据 */
export interface LabelRenderData {
    id: string;
    target: FabricObject;
}

// ─── 渲染器实现 ─────────────────────────────────────────

/**
 * 图片标签渲染器
 * 
 * 在选中图片上方显示标签（文件名左对齐 + 尺寸右对齐）
 * - 标签视觉大小固定，不随画布缩放变化
 * - 文件名超长时自动截断显示省略号
 * - 不可选中、不触发事件、不参与序列化和历史记录
 */
export class ImageLabelRenderer extends BaseRenderer<LabelRenderData, LabelStyle, Group> {
    /** 缓存原始文件名 */
    private filenameCache = new Map<string, string>();

    constructor(canvas: Canvas, metadata: ObjectMetadata, style: Partial<LabelStyle> = {}) {
        super(canvas, metadata, DEFAULT_LABEL_STYLE, style);
    }

    protected getDataId(data: LabelRenderData): string {
        return data.id;
    }

    protected createObject(_id: string, data: LabelRenderData, _index: number, inverseZoom: number): void {
        const { fontSize, fontFamily, textColor } = this.style;

        // 缓存文件名
        const filename = this.getFilename(data.target);
        this.filenameCache.set(data.id, filename);

        // 创建两个文本对象
        const filenameText = new FabricText("", { fontSize, fontFamily, fill: textColor, lineHeight: 1 });
        const dimensionsText = new FabricText("", { fontSize, fontFamily, fill: textColor, lineHeight: 1 });

        const group = new Group([filenameText, dimensionsText], {
            originX: "left",
            originY: "bottom",
            selectable: false,
            evented: false,
            excludeFromExport: true,
            hoverCursor: "default",
        });

        this.metadata.set(group, { category: Category.Label, id: `label-${data.id}` });
        this.addObject(data.id, group);

        // 更新内容和位置
        this.updateLabelLayout(group, data, inverseZoom);
        this.canvas.bringObjectToFront(group);
    }

    protected updateObject(_id: string, group: Group, data: LabelRenderData, _index: number, inverseZoom: number): void {
        this.updateLabelLayout(group, data, inverseZoom);
        this.canvas.bringObjectToFront(group);
    }

    /**
     * 更新标签布局（内容 + 位置）
     */
    private updateLabelLayout(group: Group, data: LabelRenderData, inverseZoom: number): void {
        const { fontSize, fontFamily, offsetY, gap } = this.style;
        const target = data.target;

        // 获取图片边界
        const bounds = this.getImageBounds(target);

        // 获取尺寸文本
        const width = Math.round((target.width || 0) * (target.scaleX || 1));
        const height = Math.round((target.height || 0) * (target.scaleY || 1));
        const dimensions = `${width}×${height}`;

        // 计算标签内部宽度（场景宽度转换为内部坐标）
        const labelWidth = bounds.width / inverseZoom;

        // 计算文件名可用宽度并截断
        const dimensionsWidth = this.measureText(dimensions, fontSize, fontFamily);
        const maxFilenameWidth = Math.max(0, labelWidth - dimensionsWidth - gap);
        const filename = this.filenameCache.get(data.id) || "image";
        const truncatedFilename = this.truncateText(filename, maxFilenameWidth, fontSize, fontFamily);

        // 更新文本
        const filenameText = group.item(0) as FabricText;
        const dimensionsText = group.item(1) as FabricText;
        filenameText.set("text", truncatedFilename);
        dimensionsText.set("text", dimensions);

        // 设置子元素位置（相对于 Group 中心）
        const halfWidth = labelWidth / 2;
        const halfHeight = fontSize / 2;

        filenameText.set({ left: -halfWidth, top: -halfHeight, originX: "left", originY: "top" });
        dimensionsText.set({ left: halfWidth, top: -halfHeight, originX: "right", originY: "top" });

        // 设置 Group 位置和缩放
        group.set({
            left: bounds.left,
            top: bounds.top - offsetY * inverseZoom,
            width: labelWidth,
            height: fontSize,
            scaleX: inverseZoom,
            scaleY: inverseZoom,
        });
        group.setCoords();
    }

    // ─── 公开 API ─────────────────────────────────────────

    show(targets: FabricObject[]): void {
        const data: LabelRenderData[] = targets
            .map((target) => {
                const id = this.metadata.get(target)?.id;
                return id ? { id, target } : null;
            })
            .filter((d): d is LabelRenderData => d !== null);
        this.sync(data);
    }

    hide(): void {
        this.sync([]);
    }

    bringToFront(): void {
        for (const group of this.objects.values()) {
            this.canvas.bringObjectToFront(group);
        }
    }

    clear(): void {
        for (const group of this.objects.values()) {
            this.canvas.remove(group);
        }
        this.objects.clear();
    }

    destroy(): void {
        this.clear();
        this.filenameCache.clear();
    }

    // ─── 私有工具方法 ─────────────────────────────────────────

    /** 获取图片边界框（场景坐标，考虑旋转） */
    private getImageBounds(target: FabricObject): { left: number; top: number; width: number } {
        const coords = target.getCoords();
        let minX = Infinity, maxX = -Infinity, minY = Infinity;
        for (const pt of coords) {
            if (pt.x < minX) minX = pt.x;
            if (pt.x > maxX) maxX = pt.x;
            if (pt.y < minY) minY = pt.y;
        }
        return { left: minX, top: minY, width: maxX - minX };
    }

    /** 测量文本宽度 */
    private measureText(text: string, fontSize: number, fontFamily: string): number {
        return new FabricText(text, { fontSize, fontFamily }).width || 0;
    }

    /** 截断文本，超出宽度显示省略号 */
    private truncateText(text: string, maxWidth: number, fontSize: number, fontFamily: string): string {
        if (maxWidth <= 0) return "...";
        if (this.measureText(text, fontSize, fontFamily) <= maxWidth) return text;

        let left = 0, right = text.length;
        while (left < right) {
            const mid = Math.floor((left + right + 1) / 2);
            if (this.measureText(text.slice(0, mid) + "...", fontSize, fontFamily) <= maxWidth) {
                left = mid;
            } else {
                right = mid - 1;
            }
        }
        return left > 0 ? text.slice(0, left) + "..." : "...";
    }

    /** 从图片提取文件名 */
    private getFilename(target: FabricObject): string {
        if (!(target instanceof FabricImage)) return "image";

        const src = (target as any).getSrc?.() || (target as any)._element?.src || "";
        if (!src || src.startsWith("data:")) return "image";

        try {
            const pathname = new URL(src, window.location.href).pathname;
            return pathname.split("/").pop()?.split("?")[0] || "image";
        } catch {
            return "image";
        }
    }
}
