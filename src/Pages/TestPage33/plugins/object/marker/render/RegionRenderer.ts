import { Rect, type Canvas } from "fabric";
import type { RegionData, RegionStyle } from "../types";
import { DEFAULT_REGION_STYLE } from "../types";
import { Category, type ObjectMetadata } from "../../../../core";

/**
 * 区域渲染器
 * 职责：管理标记区域的创建、更新、删除
 */
export class RegionRenderer {
    private canvas: Canvas;
    private metadata: ObjectMetadata;
    private style: RegionStyle;
    private rects = new Map<string, Rect>();

    constructor(canvas: Canvas, metadata: ObjectMetadata, style: Partial<RegionStyle> = {}) {
        this.canvas = canvas;
        this.metadata = metadata;
        this.style = { ...DEFAULT_REGION_STYLE, ...style };
    }

    /** 同步区域状态 */
    sync(regions: RegionData[]): void {
        const activeIds = new Set(regions.map((r) => r.id));

        // 移除失效的
        for (const [id, rect] of this.rects) {
            if (!activeIds.has(id)) {
                this.canvas.remove(rect);
                this.rects.delete(id);
            }
        }

        // 创建或更新
        regions.forEach((region) => {
            const pos = this.getTransformedRect(region);
            if (!pos) return;

            const rect = this.rects.get(region.id);
            if (rect) {
                rect.set(pos);
                rect.setCoords();
            } else {
                this.createRegion(region.id, pos);
            }
        });

        this.canvas.requestRenderAll();
    }

    /** 清空所有区域 */
    clear(): void {
        for (const rect of this.rects.values()) {
            this.canvas.remove(rect);
        }
        this.rects.clear();
    }

    /** 获取区域对象 */
    get(id: string): Rect | undefined {
        return this.rects.get(id);
    }

    /** 置顶所有区域 */
    bringToFront(): void {
        for (const rect of this.rects.values()) {
            this.canvas.bringObjectToFront(rect);
        }
    }

    /** 更新样式 */
    setStyle(style: Partial<RegionStyle>): void {
        this.style = { ...this.style, ...style };
    }

    /** 设置所有区域的 evented 状态 */
    setEvented(evented: boolean): void {
        this.metadata.filter("category", Category.Region).forEach((obj) => {
            obj.evented = evented;
        });
    }

    // ─── Private ─────────────────────────────────────────

    private createRegion(id: string, pos: { left: number; top: number; width: number; height: number; angle: number }): void {
        const { fill, stroke, strokeWidth, rx, ry } = this.style;

        const rect = new Rect({
            ...pos, fill, stroke, strokeWidth,
            strokeUniform: true, rx, ry,
            originX: "left", originY: "top",
            selectable: false, evented: false,
            excludeFromExport: true, hoverCursor: "move",
        });

        this.metadata.set(rect, { category: Category.Region, id });
        this.canvas.add(rect);
        this.rects.set(id, rect);
    }

    private getTransformedRect(region: RegionData): { left: number; top: number; width: number; height: number; angle: number } | null {
        const { targetId, nx, ny, nw, nh } = region;
        const target = this.metadata.getById(targetId);
        if (!target?.width || !target?.height) return null;

        const tw = target.width;
        const th = target.height;
        const scaleX = target.scaleX ?? 1;
        const scaleY = target.scaleY ?? 1;
        const angle = target.angle ?? 0;

        const localX = nx * tw - tw / 2;
        const localY = ny * th - th / 2;
        const localW = nw * tw;
        const localH = nh * th;

        const [a, b, c, d, tx, ty] = target.calcTransformMatrix();
        return {
            left: a * localX + c * localY + tx,
            top: b * localX + d * localY + ty,
            width: localW * scaleX,
            height: localH * scaleY,
            angle,
        };
    }
}
