import { Rect, Circle, Text, Group, type Canvas } from "fabric";
import type { RegionData, RegionStyle, PointStyle } from "../types";
import { DEFAULT_REGION_STYLE, DEFAULT_POINT_STYLE } from "../types";
import { Category, type ObjectMetadata } from "../../../../core";
import { getFullTransformMatrix, extractScaleAndAngle } from "../../../../utils";

/**
 * 区域渲染器
 * 职责：管理标记区域的创建、更新、删除、预览绘制
 */
export class RegionRenderer {
    private canvas: Canvas;
    private metadata: ObjectMetadata;
    private style: RegionStyle;
    private pointStyle: PointStyle;
    private rects = new Map<string, Rect>();
    private cornerMarkers = new Map<string, Group>();
    private previewRect: Rect | null = null;

    constructor(canvas: Canvas, metadata: ObjectMetadata, style: Partial<RegionStyle> = {}) {
        this.canvas = canvas;
        this.metadata = metadata;
        this.style = { ...DEFAULT_REGION_STYLE, ...style };
        // 右下角标记点使用区域的颜色
        this.pointStyle = {
            ...DEFAULT_POINT_STYLE,
            fill: this.style.stroke,
            hoverFill: this.style.stroke,
        };
    }

    private getZoom(): number {
        return this.canvas.getZoom() || 1;
    }

    /** 同步区域状态 */
    sync(regions: RegionData[]): void {
        const activeIds = new Set(regions.map((r) => r.id));
        const inverseZoom = 1 / this.getZoom();

        // 移除失效的
        for (const [id, rect] of this.rects) {
            if (!activeIds.has(id)) {
                this.canvas.remove(rect);
                this.rects.delete(id);
                const marker = this.cornerMarkers.get(id);
                if (marker) {
                    this.canvas.remove(marker);
                    this.cornerMarkers.delete(id);
                }
            }
        }

        // 创建或更新
        regions.forEach((region, i) => {
            const pos = this.getTransformedRect(region);
            if (!pos) return;
            const rect = this.rects.get(region.id);
            const marker = this.cornerMarkers.get(region.id);

            if (rect && marker) {
                // 更新边框宽度以保持视觉一致
                rect.set({ ...pos, strokeWidth: this.style.strokeWidth * inverseZoom });
                rect.setCoords();
                // 更新右下角标记点位置
                const cornerPos = this.getCornerPosition(pos);
                marker.set({ ...cornerPos, scaleX: inverseZoom, scaleY: inverseZoom });
                marker.setCoords();
                this.setMarkerLabel(marker, i + 1);
            } else {
                this.createRegion(region.id, pos, i + 1, inverseZoom);
            }
        });

        this.canvas.requestRenderAll();
    }

    /** 清空所有区域 */
    clear(): void {
        for (const rect of this.rects.values()) {
            this.canvas.remove(rect);
        }
        for (const marker of this.cornerMarkers.values()) {
            this.canvas.remove(marker);
        }
        this.rects.clear();
        this.cornerMarkers.clear();
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
        for (const marker of this.cornerMarkers.values()) {
            this.canvas.bringObjectToFront(marker);
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

    // ─── 预览框相关 ─────────────────────────────────────────

    /** 创建预览框 */
    createPreview(scenePt: { x: number; y: number }): void {
        const { fill, stroke, strokeWidth, rx, ry } = this.style;
        this.previewRect = new Rect({
            left: scenePt.x, top: scenePt.y, width: 0, height: 0,
            fill, stroke, strokeWidth, strokeUniform: true, rx, ry,
            strokeDashArray: [6, 4],
            originX: "left", originY: "top",
            selectable: false, evented: false,
        });
        this.canvas.add(this.previewRect);
    }

    /** 更新预览框 */
    updatePreview(startPt: { x: number; y: number }, currentPt: { x: number; y: number }): void {
        if (!this.previewRect) return;

        const left = Math.min(startPt.x, currentPt.x);
        const top = Math.min(startPt.y, currentPt.y);
        const width = Math.abs(currentPt.x - startPt.x);
        const height = Math.abs(currentPt.y - startPt.y);

        this.previewRect.set({ left, top, width, height });
        this.canvas.requestRenderAll();
    }

    /** 移除预览框 */
    removePreview(): void {
        if (this.previewRect) {
            this.canvas.remove(this.previewRect);
            this.previewRect = null;
        }
    }

    // ─── Private ─────────────────────────────────────────

    private createRegion(id: string, pos: { left: number; top: number; width: number; height: number; angle: number }, label: number, scale: number): void {
        const { fill, stroke, strokeWidth, rx, ry } = this.style;

        const rect = new Rect({
            ...pos, fill, stroke,
            strokeWidth: strokeWidth * scale, // 根据缩放调整边框宽度
            strokeUniform: true, rx, ry,
            strokeDashArray: [6, 4], // 虚线边框
            originX: "left", originY: "top",
            selectable: false, evented: false,
            excludeFromExport: true, hoverCursor: "move",
        });

        this.metadata.set(rect, { category: Category.Region, id });
        this.canvas.add(rect);
        this.rects.set(id, rect);

        // 创建右下角标记点
        const cornerPos = this.getCornerPosition(pos);
        this.createCornerMarker(id, cornerPos, label, scale);
    }

    private createCornerMarker(id: string, pos: { left: number; top: number }, label: number, scale: number): void {
        const { radius, fill, stroke, strokeWidth, textColor, fontSize } = this.pointStyle;

        const circle = new Circle({
            radius, fill, stroke, strokeWidth,
            originX: "center", originY: "center",
        });

        const text = new Text(String(label), {
            fontSize, fill: textColor, fontWeight: "bold", fontFamily: "Arial",
            originX: "center", originY: "center",
        });

        const group = new Group([circle, text], {
            ...pos, scaleX: scale, scaleY: scale,
            originX: "center", originY: "center",
            selectable: false, evented: false,
            excludeFromExport: true,
        });

        this.metadata.set(group, { category: Category.Region, id: `${id}-corner` });
        this.canvas.add(group);
        this.cornerMarkers.set(id, group);
    }

    private getCornerPosition(rect: { left: number; top: number; width: number; height: number; angle: number }): { left: number; top: number } {
        const { left, top, width, height, angle } = rect;
        const rad = (angle * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);

        // 右下角相对于左上角的偏移
        return {
            left: left + width * cos - height * sin,
            top: top + width * sin + height * cos,
        };
    }

    private setMarkerLabel(group: Group, label: number): void {
        const text = group.item(1) as Text;
        if (text.text !== String(label)) {
            text.set("text", String(label));
        }
    }

    private getTransformedRect(region: RegionData): { left: number; top: number; width: number; height: number; angle: number } | null {
        const { targetId, nx, ny, nw, nh } = region;
        const target = this.metadata.getById(targetId);
        if (!target?.width || !target?.height) return null;

        const tw = target.width;
        const th = target.height;

        const localX = nx * tw - tw / 2;
        const localY = ny * th - th / 2;
        const localW = nw * tw;
        const localH = nh * th;

        // 使用工具函数获取完整变换矩阵
        const matrix = getFullTransformMatrix(this.canvas, target);
        const [a, b, c, d, tx, ty] = matrix;
        const { scaleX, scaleY, angle } = extractScaleAndAngle(matrix);

        return {
            left: a * localX + c * localY + tx,
            top: b * localX + d * localY + ty,
            width: localW * scaleX,
            height: localH * scaleY,
            angle,
        };
    }
}
