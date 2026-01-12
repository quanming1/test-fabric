import { FabricText, Group, type Canvas, type FabricObject, FabricImage } from "fabric";
import { BaseRenderer } from "../../../../core/render";
import { Category, type ObjectMetadata } from "../../../../core";

// ─── 类型定义 ─────────────────────────────────────────

/** 标签样式配置 */
export interface LabelStyle {
    /** 字体大小 */
    fontSize: number;
    /** 字体族 */
    fontFamily: string;
    /** 文字颜色 */
    textColor: string;
    /** 标签距离图片顶部的偏移（场景坐标） */
    offsetY: number;
}

/** 默认标签样式 */
const DEFAULT_LABEL_STYLE: LabelStyle = {
    fontSize: 13,
    fontFamily: "Arial, sans-serif",
    textColor: "#666666ff", // 淡雅灰
    offsetY: 3,
};

/** 标签渲染数据 */
export interface LabelRenderData {
    /** 关联的图片 ID */
    id: string;
    /** 关联的图片对象（用于计算位置和获取尺寸信息） */
    target: FabricObject;
}

// ─── 渲染器实现 ─────────────────────────────────────────

/**
 * 图片标签渲染器
 * 
 * 继承 BaseRenderer，管理选中图片上方的浮动标签。
 * 
 * 功能：
 * - 选中图片时在其上方显示标签（文件名 + 尺寸）
 * - 支持多选：每个选中的图片都显示独立标签
 * - 拖拽/缩放/旋转时实时跟随更新
 * - 标签大小不随画布缩放变化（保持固定视觉大小）
 * 
 * 特性：
 * - excludeFromExport: true - 不参与序列化
 * - Category.Label - 不参与历史记录
 */
export class ImageLabelRenderer extends BaseRenderer<LabelRenderData, LabelStyle, Group> {

    constructor(canvas: Canvas, metadata: ObjectMetadata, style: Partial<LabelStyle> = {}) {
        super(canvas, metadata, DEFAULT_LABEL_STYLE, style);
    }

    // ─── BaseRenderer 抽象方法实现 ─────────────────────────────

    protected getDataId(data: LabelRenderData): string {
        return data.id;
    }

    /**
     * 创建标签对象
     * 标签由 Group 包裹 FabricText，便于整体定位和缩放
     */
    protected createObject(id: string, data: LabelRenderData, index: number, inverseZoom: number): void {
        const content = this.getLabelContent(data.target);
        const { fontSize, fontFamily, textColor } = this.style;

        // 创建文本对象
        const text = new FabricText(content, {
            fontSize,
            fontFamily,
            fill: textColor,
            originX: "left",
            originY: "bottom", // 底部对齐，便于定位在图片上方
        });

        // 计算标签位置（图片左上角上方）
        const pos = this.calculatePosition(data.target, inverseZoom);

        // 用 Group 包裹，便于整体缩放（保持视觉大小不变）
        const group = new Group([text], {
            left: pos.left,
            top: pos.top,
            scaleX: inverseZoom,
            scaleY: inverseZoom,
            originX: "left",
            originY: "bottom",
            selectable: false,
            evented: false,
            excludeFromExport: true, // 不参与序列化
        });

        // 标记为标签类型，不参与历史记录等逻辑
        this.metadata.set(group, { category: Category.Label, id: `label-${id}` });

        this.addObject(id, group);
        this.canvas.bringObjectToFront(group);
    }

    /**
     * 更新标签对象
     * 更新内容（尺寸可能变化）和位置（图片可能移动/旋转）
     */
    protected updateObject(id: string, group: Group, data: LabelRenderData, index: number, inverseZoom: number): void {
        // 更新文本内容
        const content = this.getLabelContent(data.target);
        const text = group.item(0) as FabricText;
        if (text.text !== content) {
            text.set("text", content);
        }

        // 更新位置和缩放
        const pos = this.calculatePosition(data.target, inverseZoom);
        group.set({
            left: pos.left,
            top: pos.top,
            scaleX: inverseZoom,
            scaleY: inverseZoom,
        });
        group.setCoords();

        // 确保标签在最上层
        this.canvas.bringObjectToFront(group);
    }

    // ─── 公开 API ─────────────────────────────────────────

    /**
     * 显示标签
     * @param targets 选中的图片对象列表
     */
    show(targets: FabricObject[]): void {
        // 转换为渲染数据格式
        const data: LabelRenderData[] = targets
            .map((target) => {
                const id = this.metadata.get(target)?.id;
                return id ? { id, target } : null;
            })
            .filter((d): d is LabelRenderData => d !== null);

        // 调用 BaseRenderer.sync 进行 diff 更新
        this.sync(data);
    }

    /**
     * 隐藏所有标签
     */
    hide(): void {
        this.sync([]);
    }

    /**
     * 置顶所有标签（图层变化后调用）
     */
    bringToFront(): void {
        for (const group of this.objects.values()) {
            this.canvas.bringObjectToFront(group);
        }
    }

    /**
     * 清空所有标签
     */
    clear(): void {
        for (const group of this.objects.values()) {
            this.canvas.remove(group);
        }
        this.objects.clear();
    }

    destroy(): void {
        this.clear();
    }

    // ─── 私有方法 ─────────────────────────────────────────

    /**
     * 计算标签位置
     * 定位在图片边界框的左上角上方（考虑旋转）
     */
    private calculatePosition(target: FabricObject, inverseZoom: number): { left: number; top: number } {
        // 获取图片的四个角点（场景坐标，已考虑旋转）
        const coords = target.getCoords();

        // 找到最小的 x 和 y（边界框左上角）
        let minY = Infinity;
        let minX = Infinity;
        for (const pt of coords) {
            if (pt.y < minY) minY = pt.y;
            if (pt.x < minX) minX = pt.x;
        }

        return {
            left: minX,
            top: minY - this.style.offsetY * inverseZoom,
        };
    }

    /**
     * 生成标签内容
     * 格式：文件名  宽×高
     */
    private getLabelContent(target: FabricObject): string {
        const filename = this.getFilename(target);
        // 计算实际渲染尺寸（原始尺寸 × 缩放比例）
        const width = Math.round((target.width || 0) * (target.scaleX || 1));
        const height = Math.round((target.height || 0) * (target.scaleY || 1));

        return `${filename}  ${width}×${height}`;
    }

    /**
     * 从图片对象提取文件名
     * - data URL: 返回 "image"
     * - 普通 URL: 提取路径中的文件名
     */
    private getFilename(target: FabricObject): string {
        if (target instanceof FabricImage) {
            const src = (target as any).getSrc?.() || (target as any)._element?.src || "";
            if (src) {
                // data URL 无法提取文件名
                if (src.startsWith("data:")) {
                    return "image";
                }
                // 从 URL 路径提取文件名
                try {
                    const url = new URL(src, window.location.href);
                    const pathname = url.pathname;
                    const filename = pathname.split("/").pop() || "image";
                    return filename.split("?")[0]; // 移除查询参数
                } catch {
                    return "image";
                }
            }
        }
        return "image";
    }
}
