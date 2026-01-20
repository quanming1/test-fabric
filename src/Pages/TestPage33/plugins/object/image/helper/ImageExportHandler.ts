import type { FabricObject, Canvas } from "fabric";
import type { ObjectMetadata } from "../../../../core";
import type { PointData, RegionData, PointStyle, RegionStyle } from "../../marker/types";
import { DEFAULT_POINT_STYLE, DEFAULT_REGION_STYLE } from "../../marker/types";
import { MarkerExportPainter } from "../../marker/helper/MarkerExportPainter";

/** 导出配置 */
export interface ExportOptions {
    /** 输出格式 */
    format?: "png" | "jpeg" | "webp";
    /** JPEG/WebP 质量 (0-1) */
    quality?: number;
    /** 是否包含点标记 */
    includePoints?: boolean;
    /** 是否包含区域标记 */
    includeRegions?: boolean;
    /** 点标记样式覆盖 */
    pointStyle?: Partial<PointStyle>;
    /** 区域标记样式覆盖 */
    regionStyle?: Partial<RegionStyle>;
    /** 缩放比例（默认 1，即原始尺寸） */
    scale?: number;
}

/** 导出结果 */
export interface ExportResult {
    /** base64 数据 URL */
    dataUrl: string;
    /** Blob 对象 */
    blob: Blob;
    /** 图片宽度 */
    width: number;
    /** 图片高度 */
    height: number;
}

/** 带全局序号的点标记数据 */
export interface PointDataWithIndex extends PointData {
    index: number;
}

/** 带全局序号的区域标记数据 */
export interface RegionDataWithIndex extends RegionData {
    index: number;
}

/** 导出所需的标记数据（带全局序号） */
export interface MarkerDataForExport {
    points: PointDataWithIndex[];
    regions: RegionDataWithIndex[];
}

/**
 * 图片导出处理器
 * 职责：将图片和其上的标记（点/区域）合成为新图片导出
 */
export class ImageExportHandler {
    private canvas: Canvas;
    private metadata: ObjectMetadata;

    constructor(canvas: Canvas, metadata: ObjectMetadata) {
        this.canvas = canvas;
        this.metadata = metadata;
    }

    /**
     * 导出图片及其标记
     */
    async exportWithMarkers(
        imageId: string,
        markers: MarkerDataForExport,
        options: ExportOptions = {}
    ): Promise<ExportResult | null> {
        const {
            format = "png",
            quality = 0.92,
            includePoints = true,
            includeRegions = true,
            pointStyle = {},
            regionStyle = {},
            scale = 1,
        } = options;

        const imageObj = this.metadata.getById(imageId);
        if (!imageObj) return null;

        const imgElement = this.getImageElement(imageObj);
        if (!imgElement) return null;

        const width = Math.round(imgElement.naturalWidth * scale);
        const height = Math.round(imgElement.naturalHeight * scale);

        const offscreen = document.createElement("canvas");
        offscreen.width = width;
        offscreen.height = height;
        const ctx = offscreen.getContext("2d");
        if (!ctx) return null;

        // 绘制原图
        ctx.drawImage(imgElement, 0, 0, width, height);

        // 过滤该图片的标记
        const targetPoints = markers.points.filter(p => p.targetId === imageId);
        const targetRegions = markers.regions.filter(r => r.targetId === imageId);

        const mergedPointStyle = { ...DEFAULT_POINT_STYLE, ...pointStyle };
        const mergedRegionStyle = { ...DEFAULT_REGION_STYLE, ...regionStyle };

        // 绘制区域（底层）
        if (includeRegions && targetRegions.length > 0) {
            for (const region of targetRegions) {
                const x = region.nx * width;
                const y = region.ny * height;
                const w = region.nw * width;
                const h = region.nh * height;
                // index + 1 是显示的序号（从 1 开始）
                MarkerExportPainter.drawRegion(ctx, x, y, w, h, region.index + 1, mergedRegionStyle, scale);
            }
        }

        // 绘制点（顶层）
        if (includePoints && targetPoints.length > 0) {
            for (const point of targetPoints) {
                const x = point.nx * width;
                const y = point.ny * height;
                // index + 1 是显示的序号（从 1 开始）
                MarkerExportPainter.drawPoint(ctx, x, y, point.index + 1, mergedPointStyle, scale);
            }
        }

        const mimeType = `image/${format}`;
        const dataUrl = offscreen.toDataURL(mimeType, quality);
        const blob = await fetch(dataUrl).then(r => r.blob());

        return { dataUrl, blob, width, height };
    }

    // ─── 私有方法 ─────────────────────────────────────────

    private getImageElement(obj: FabricObject): HTMLImageElement | null {
        const element = (obj as any)._element;
        return element instanceof HTMLImageElement ? element : null;
    }
}
