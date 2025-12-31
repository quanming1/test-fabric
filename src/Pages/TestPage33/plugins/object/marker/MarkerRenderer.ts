import { Circle, Text, Group, type Canvas } from "fabric";
import type { MarkerData, MarkerStyle } from "./types";
import { DEFAULT_MARKER_STYLE } from "./types";
import { Category, type ObjectMetadata } from "../../../core";

/**
 * 标记点渲染器
 * 职责：管理标记点的创建、更新、删除和交互
 */
export class MarkerRenderer {
    private canvas: Canvas;
    private metadata: ObjectMetadata;
    private style: MarkerStyle;
    private groups = new Map<string, Group>();

    constructor(canvas: Canvas, metadata: ObjectMetadata, style: Partial<MarkerStyle> = {}) {
        this.canvas = canvas;
        this.metadata = metadata;
        this.style = { ...DEFAULT_MARKER_STYLE, ...style };
    }

    /** 获取当前缩放比例 */
    private getZoom(): number {
        return this.canvas.getZoom() || 1;
    }

    /** 同步标记点状态 */
    sync(markers: MarkerData[]): void {
        const activeIds = new Set(markers.map((m) => m.id));
        const inverseZoom = 1 / this.getZoom();

        // 移除失效的
        for (const [id, group] of this.groups) {
            if (!activeIds.has(id)) {
                this.canvas.remove(group);
                this.groups.delete(id);
            }
        }

        // 创建或更新
        markers.forEach((marker, i) => {
            const pos = this.getPosition(marker);
            if (!pos) return;

            const group = this.groups.get(marker.id);
            if (group) {
                // 更新位置和缩放
                group.set({
                    ...pos,
                    scaleX: inverseZoom,
                    scaleY: inverseZoom,
                });
                // 更新边界框坐标，否则 hover/click 检测会失效
                group.setCoords();
                this.setLabel(group, i + 1);
            } else {
                this.createMarker(marker.id, pos, i + 1, inverseZoom);
            }
        });

        this.canvas.requestRenderAll();
    }

    /** 清空所有标记点 */
    clear(): void {
        for (const group of this.groups.values()) {
            this.canvas.remove(group);
        }
        this.groups.clear();
    }

    /** 获取标记点对象 */
    get(id: string): Group | undefined {
        return this.groups.get(id);
    }

    /** 置顶所有标记点 */
    bringToFront(): void {
        for (const group of this.groups.values()) {
            this.canvas.bringObjectToFront(group);
        }
    }

    /** 更新样式 */
    setStyle(style: Partial<MarkerStyle>): void {
        this.style = { ...this.style, ...style };
    }

    /** 设置所有标记点的 evented 状态 */
    setEvented(evented: boolean): void {
        this.metadata.filter("category", Category.Marker).forEach((obj) => {
            obj.evented = evented;
        });
    }

    // ─── Private ─────────────────────────────────────────

    private createMarker(id: string, pos: { left: number; top: number }, label: number, scale: number): void {
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

        // 使用元数据系统标记
        this.metadata.set(group, { category: Category.Marker, id });

        this.bindHover(group, circle);
        this.canvas.add(group);
        this.groups.set(id, group);
    }

    private bindHover(group: Group, circle: Circle): void {
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

    private setLabel(group: Group, label: number): void {
        const text = group.item(1) as Text;
        if (text.text !== String(label)) {
            text.set("text", String(label));
        }
    }

    private getPosition(marker: MarkerData): { left: number; top: number } | null {
        const { targetId, nx, ny } = marker;

        // 通过 ID 查找目标对象
        const target = this.metadata.getById(targetId);
        if (!target?.width || !target?.height) return null;

        const w = target.width;
        const h = target.height;

        // 归一化 → 局部坐标（中心原点）
        const localX = nx * w - w / 2;
        const localY = ny * h - h / 2;

        // 局部 → 场景坐标
        const [a, b, c, d, tx, ty] = target.calcTransformMatrix();
        return {
            left: a * localX + c * localY + tx,
            top: b * localX + d * localY + ty,
        };
    }
}
