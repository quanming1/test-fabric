import { Circle, Text, Group, type Canvas } from "fabric";
import { BaseRenderer } from "../../../../core/render";
import type { PointData, PointStyle } from "../types";
import { DEFAULT_POINT_STYLE } from "../types";
import { Category, type ObjectMetadata } from "../../../../core";
import { TransformHelper } from "../../../../utils";

/**
 * 点标记渲染器
 * 职责：管理标记点的创建、更新、删除和交互
 */
export class PointRenderer extends BaseRenderer<PointData, PointStyle, Group> {
    constructor(canvas: Canvas, metadata: ObjectMetadata, style: Partial<PointStyle> = {}) {
        super(canvas, metadata, DEFAULT_POINT_STYLE, style);
    }

    protected getDataId(data: PointData): string {
        return data.id;
    }

    protected createObject(id: string, data: PointData, index: number, inverseZoom: number): void {
        const pos = this.getPosition(data);
        if (!pos) return;

        const { radius, fill, stroke, strokeWidth, textColor, fontSize } = this.style;

        const circle = new Circle({
            radius, fill, stroke, strokeWidth,
            originX: "center", originY: "center",
        });

        const text = new Text(String(index + 1), {
            fontSize, fill: textColor, fontWeight: "bold", fontFamily: "Arial",
            originX: "center", originY: "center",
        });

        const group = new Group([circle, text], {
            ...pos, scaleX: inverseZoom, scaleY: inverseZoom,
            originX: "center", originY: "center",
            selectable: false, evented: true,
            excludeFromExport: true, hoverCursor: "pointer",
        });

        this.metadata.set(group, { category: Category.Marker, id });
        this.bindHover(group, circle);
        this.addObject(id, group);
    }

    protected updateObject(id: string, group: Group, data: PointData, index: number, inverseZoom: number): void {
        const pos = this.getPosition(data);
        if (!pos) return;

        group.set({ ...pos, scaleX: inverseZoom, scaleY: inverseZoom });
        group.setCoords();
        this.setLabel(group, index + 1);
    }

    /** 清空所有标记点 */
    clear(): void {
        for (const group of this.objects.values()) {
            this.canvas.remove(group);
        }
        this.objects.clear();
    }

    /** 更新样式 */
    setStyle(style: Partial<PointStyle>): void {
        this.style = { ...this.style, ...style };
    }

    /** 置顶所有标记点 */
    bringToFront(): void {
        for (const group of this.objects.values()) {
            this.canvas.bringObjectToFront(group);
        }
    }

    /** 设置所有标记点的 evented 状态 */
    setEvented(evented: boolean): void {
        this.metadata.filter("category", Category.Marker).forEach((obj) => {
            obj.evented = evented;
        });
    }

    // ─── Private ─────────────────────────────────────────

    private bindHover(group: Group, circle: Circle): void {
        const { hoverScale, hoverFill, fill } = this.style;

        group.on("mouseover", () => {
            const inverseZoom = this.getInverseZoom();
            group.set({ scaleX: inverseZoom * hoverScale, scaleY: inverseZoom * hoverScale });
            circle.set("fill", hoverFill);
            this.requestRender();
        });

        group.on("mouseout", () => {
            const inverseZoom = this.getInverseZoom();
            group.set({ scaleX: inverseZoom, scaleY: inverseZoom });
            circle.set("fill", fill);
            this.requestRender();
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

        const [a, b, c, d, tx, ty] = TransformHelper.getAbsoluteMatrix(this.canvas, target);
        return {
            left: a * localX + c * localY + tx,
            top: b * localX + d * localY + ty,
        };
    }
}
