import { Circle, Text, Group, type Canvas } from "fabric";
import type { PointData, PointStyle } from "../types";
import { DEFAULT_POINT_STYLE } from "../types";
import { Category, type ObjectMetadata } from "../../../../core";
import { getFullTransformMatrix } from "../../../../utils";

/**
 * 点标记渲染器
 * 职责：管理标记点的创建、更新、删除和交互
 */
export class PointRenderer {
    private canvas: Canvas;
    private metadata: ObjectMetadata;
    private style: PointStyle;
    private groups = new Map<string, Group>();

    constructor(canvas: Canvas, metadata: ObjectMetadata, style: Partial<PointStyle> = {}) {
        this.canvas = canvas;
        this.metadata = metadata;
        this.style = { ...DEFAULT_POINT_STYLE, ...style };
    }

    private getZoom(): number {
        return this.canvas.getZoom() || 1;
    }

    /** 同步标记点状态 */
    sync(points: PointData[]): void {
        const activeIds = new Set(points.map((p) => p.id));
        const inverseZoom = 1 / this.getZoom();

        // 移除失效的
        for (const [id, group] of this.groups) {
            if (!activeIds.has(id)) {
                this.canvas.remove(group);
                this.groups.delete(id);
            }
        }

        // 创建或更新
        points.forEach((point, i) => {
            const pos = this.getPosition(point);
            if (!pos) return;

            const group = this.groups.get(point.id);
            if (group) {
                group.set({ ...pos, scaleX: inverseZoom, scaleY: inverseZoom });
                group.setCoords();
                this.setLabel(group, i + 1);
            } else {
                this.createPoint(point.id, pos, i + 1, inverseZoom);
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
    setStyle(style: Partial<PointStyle>): void {
        this.style = { ...this.style, ...style };
    }

    /** 设置所有标记点的 evented 状态 */
    setEvented(evented: boolean): void {
        this.metadata.filter("category", Category.Marker).forEach((obj) => {
            obj.evented = evented;
        });
    }

    // ─── Private ─────────────────────────────────────────

    private createPoint(id: string, pos: { left: number; top: number }, label: number, scale: number): void {
        const { radius, fill, stroke, strokeWidth, textColor, fontSize } = this.style;

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
            selectable: false, evented: true,
            excludeFromExport: true, hoverCursor: "pointer",
        });

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

    private getPosition(point: PointData): { left: number; top: number } | null {
        const { targetId, nx, ny } = point;
        const target = this.metadata.getById(targetId);
        if (!target?.width || !target?.height) return null;

        const w = target.width;
        const h = target.height;
        const localX = nx * w - w / 2;
        const localY = ny * h - h / 2;

        // 使用工具函数获取完整变换矩阵（支持多选）
        const [a, b, c, d, tx, ty] = getFullTransformMatrix(this.canvas, target);
        return {
            left: a * localX + c * localY + tx,
            top: b * localX + d * localY + ty,
        };
    }
}
