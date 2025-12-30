import { Circle, Text, Group, Rect, type Canvas, type FabricObject } from "fabric";
import type { MarkerData, MarkerStyle, RegionStyle } from "../types";
import { DEFAULT_MARKER_STYLE, DEFAULT_REGION_STYLE } from "../types";
import { Category, type ObjectMetadata } from "../../../../core";

/**
 * 标记点渲染器
 * 职责：管理标记点和区域标记的创建、更新、删除和交互
 */
export class MarkerRenderer {
    private canvas: Canvas;
    private metadata: ObjectMetadata;
    private style: MarkerStyle;
    private regionStyle: RegionStyle;
    private groups = new Map<string, Group | Rect>();
    private previewRect: Rect | null = null;

    constructor(
        canvas: Canvas,
        metadata: ObjectMetadata,
        style: Partial<MarkerStyle> = {},
        regionStyle: Partial<RegionStyle> = {}
    ) {
        this.canvas = canvas;
        this.metadata = metadata;
        this.style = { ...DEFAULT_MARKER_STYLE, ...style };
        this.regionStyle = { ...DEFAULT_REGION_STYLE, ...regionStyle };
    }

    /** 获取当前缩放比例 */
    private getZoom(): number {
        return this.canvas.getZoom() || 1;
    }

    /** 同步标记状态 */
    sync(markers: MarkerData[]): void {
        const activeIds = new Set(markers.map((m) => m.id));
        const inverseZoom = 1 / this.getZoom();

        // 移除失效的
        for (const [id, obj] of this.groups) {
            if (!activeIds.has(id)) {
                this.canvas.remove(obj);
                this.groups.delete(id);
            }
        }

        // 分离点标记和区域标记
        let pointIndex = 0;
        markers.forEach((marker) => {
            if (marker.type === "point") {
                this.syncPointMarker(marker, ++pointIndex, inverseZoom);
            } else {
                this.syncRegionMarker(marker);
            }
        });

        this.canvas.requestRenderAll();
    }

    /** 同步点标记 */
    private syncPointMarker(marker: MarkerData, label: number, inverseZoom: number): void {
        const pos = this.getPointPosition(marker);
        if (!pos) return;

        const group = this.groups.get(marker.id) as Group | undefined;
        if (group) {
            group.set({
                ...pos,
                scaleX: inverseZoom,
                scaleY: inverseZoom,
            });
            group.setCoords();
            this.setLabel(group, label);
        } else {
            this.createPointMarker(marker.id, pos, label, inverseZoom);
        }
    }

    /** 同步区域标记 */
    private syncRegionMarker(marker: MarkerData): void {
        const bounds = this.getRegionBounds(marker);
        if (!bounds) return;

        const rect = this.groups.get(marker.id) as Rect | undefined;
        if (rect) {
            rect.set(bounds);
            rect.setCoords();
        } else {
            this.createRegionMarker(marker.id, bounds);
        }
    }

    /** 更新拖拽预览矩形 */
    updatePreview(
        target: FabricObject,
        startLocalPt: { x: number; y: number },
        endLocalPt: { x: number; y: number }
    ): void {
        const w = target.width ?? 0;
        const h = target.height ?? 0;
        if (!w || !h) return;

        // 计算局部坐标范围
        const x1 = Math.min(startLocalPt.x, endLocalPt.x);
        const y1 = Math.min(startLocalPt.y, endLocalPt.y);
        const x2 = Math.max(startLocalPt.x, endLocalPt.x);
        const y2 = Math.max(startLocalPt.y, endLocalPt.y);

        // 局部坐标 → 场景坐标（四个角）
        const matrix = target.calcTransformMatrix();
        const [a, b, c, d, tx, ty] = matrix;

        const corners = [
            { x: x1, y: y1 },
            { x: x2, y: y1 },
            { x: x2, y: y2 },
            { x: x1, y: y2 },
        ].map((pt) => ({
            x: a * pt.x + c * pt.y + tx,
            y: b * pt.x + d * pt.y + ty,
        }));

        // 计算包围盒
        const xs = corners.map((c) => c.x);
        const ys = corners.map((c) => c.y);
        const left = Math.min(...xs);
        const top = Math.min(...ys);
        const right = Math.max(...xs);
        const bottom = Math.max(...ys);

        const { stroke, strokeWidth, fill } = this.regionStyle;

        if (!this.previewRect) {
            this.previewRect = new Rect({
                left,
                top,
                width: right - left,
                height: bottom - top,
                stroke,
                strokeWidth,
                fill,
                selectable: false,
                evented: false,
                excludeFromExport: true,
            });
            this.canvas.add(this.previewRect);
        } else {
            this.previewRect.set({
                left,
                top,
                width: right - left,
                height: bottom - top,
            });
            this.previewRect.setCoords();
        }

        this.canvas.requestRenderAll();
    }

    /** 清除预览矩形 */
    clearPreview(): void {
        if (this.previewRect) {
            this.canvas.remove(this.previewRect);
            this.previewRect = null;
            this.canvas.requestRenderAll();
        }
    }

    /** 清空所有标记 */
    clear(): void {
        for (const obj of this.groups.values()) {
            this.canvas.remove(obj);
        }
        this.groups.clear();
        this.clearPreview();
    }

    /** 获取标记对象 */
    get(id: string): Group | Rect | undefined {
        return this.groups.get(id);
    }

    /** 置顶所有标记 */
    bringToFront(): void {
        for (const obj of this.groups.values()) {
            this.canvas.bringObjectToFront(obj);
        }
    }

    /** 更新点标记样式 */
    setStyle(style: Partial<MarkerStyle>): void {
        this.style = { ...this.style, ...style };
    }

    /** 更新区域标记样式 */
    setRegionStyle(style: Partial<RegionStyle>): void {
        this.regionStyle = { ...this.regionStyle, ...style };
    }

    /** 设置所有标记的 evented 状态 */
    setEvented(evented: boolean): void {
        this.metadata.filter("category", Category.Marker).forEach((obj) => {
            obj.evented = evented;
        });
    }


    // ─── Private ─────────────────────────────────────────

    private createPointMarker(
        id: string,
        pos: { left: number; top: number },
        label: number,
        scale: number
    ): void {
        const { radius, fill, stroke, strokeWidth, textColor, fontSize } = this.style;

        const circle = new Circle({
            radius,
            fill,
            stroke,
            strokeWidth,
            originX: "center",
            originY: "center",
        });

        const text = new Text(String(label), {
            fontSize,
            fill: textColor,
            fontWeight: "bold",
            fontFamily: "Arial",
            originX: "center",
            originY: "center",
        });

        const group = new Group([circle, text], {
            ...pos,
            scaleX: scale,
            scaleY: scale,
            originX: "center",
            originY: "center",
            selectable: false,
            evented: true,
            excludeFromExport: true,
            hoverCursor: "pointer",
        });

        this.metadata.set(group, { category: Category.Marker, id });
        this.bindPointHover(group, circle);
        this.canvas.add(group);
        this.groups.set(id, group);
    }

    private createRegionMarker(id: string, bounds: { left: number; top: number; width: number; height: number }): void {
        const { stroke, strokeWidth, fill, hoverStroke } = this.regionStyle;

        const rect = new Rect({
            ...bounds,
            stroke,
            strokeWidth,
            fill,
            selectable: false,
            evented: true,
            excludeFromExport: true,
            hoverCursor: "pointer",
        });

        this.metadata.set(rect, { category: Category.Marker, id });
        this.bindRegionHover(rect, stroke, hoverStroke);
        this.canvas.add(rect);
        this.groups.set(id, rect);
    }

    private bindPointHover(group: Group, circle: Circle): void {
        const { hoverScale, hoverFill, fill } = this.style;

        group.on("mouseover", () => {
            const inverseZoom = 1 / this.getZoom();
            group.set({ scaleX: inverseZoom * hoverScale, scaleY: inverseZoom * hoverScale });
            circle.set("fill", hoverFill);
            this.canvas.requestRenderAll();
        });

        group.on("mouseout", () => {
            const inverseZoom = 1 / this.getZoom();
            group.set({ scaleX: inverseZoom, scaleY: inverseZoom });
            circle.set("fill", fill);
            this.canvas.requestRenderAll();
        });
    }

    private bindRegionHover(rect: Rect, normalStroke: string, hoverStroke: string): void {
        rect.on("mouseover", () => {
            rect.set("stroke", hoverStroke);
            this.canvas.requestRenderAll();
        });

        rect.on("mouseout", () => {
            rect.set("stroke", normalStroke);
            this.canvas.requestRenderAll();
        });
    }

    private setLabel(group: Group, label: number): void {
        const text = group.item(1) as Text;
        if (text.text !== String(label)) {
            text.set("text", String(label));
        }
    }

    private getPointPosition(marker: MarkerData): { left: number; top: number } | null {
        const { targetId, nx, ny } = marker;
        const target = this.metadata.getById(targetId);
        if (!target?.width || !target?.height) return null;

        const w = target.width;
        const h = target.height;

        const localX = nx * w - w / 2;
        const localY = ny * h - h / 2;

        const [a, b, c, d, tx, ty] = target.calcTransformMatrix();
        return {
            left: a * localX + c * localY + tx,
            top: b * localX + d * localY + ty,
        };
    }

    private getRegionBounds(marker: MarkerData): { left: number; top: number; width: number; height: number } | null {
        const { targetId, nx, ny, nw, nh } = marker;
        if (nw === undefined || nh === undefined) return null;

        const target = this.metadata.getById(targetId);
        if (!target?.width || !target?.height) return null;

        const w = target.width;
        const h = target.height;

        // 归一化 → 局部坐标（四个角）
        const x1 = nx * w - w / 2;
        const y1 = ny * h - h / 2;
        const x2 = (nx + nw) * w - w / 2;
        const y2 = (ny + nh) * h - h / 2;

        // 局部 → 场景坐标
        const matrix = target.calcTransformMatrix();
        const [a, b, c, d, tx, ty] = matrix;

        const corners = [
            { x: x1, y: y1 },
            { x: x2, y: y1 },
            { x: x2, y: y2 },
            { x: x1, y: y2 },
        ].map((pt) => ({
            x: a * pt.x + c * pt.y + tx,
            y: b * pt.x + d * pt.y + ty,
        }));

        const xs = corners.map((c) => c.x);
        const ys = corners.map((c) => c.y);

        return {
            left: Math.min(...xs),
            top: Math.min(...ys),
            width: Math.max(...xs) - Math.min(...xs),
            height: Math.max(...ys) - Math.min(...ys),
        };
    }
}
