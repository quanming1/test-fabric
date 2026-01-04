import { Line, type Canvas } from "fabric";
import type { Guideline, GuidelinesStyle } from "../types";
import { Category, type ObjectMetadata } from "../../../core";

/**
 * 辅助线渲染器
 * 负责辅助线的创建、更新和清除
 */
export class GuidelineRenderer {
    private canvas: Canvas;
    private metadata: ObjectMetadata;
    private style: GuidelinesStyle;
    private lines: Line[] = [];

    constructor(canvas: Canvas, metadata: ObjectMetadata, style: GuidelinesStyle) {
        this.canvas = canvas;
        this.metadata = metadata;
        this.style = style;
    }

    /** 更新样式 */
    setStyle(style: Partial<GuidelinesStyle>): void {
        this.style = { ...this.style, ...style };
    }

    /** 渲染辅助线 */
    render(guidelines: Guideline[]): void {
        this.clear();

        const zoom = this.canvas.getZoom();
        const vpt = this.canvas.viewportTransform;
        const canvasWidth = this.canvas.width ?? 800;
        const canvasHeight = this.canvas.height ?? 600;
        const strokeWidth = this.style.lineWidth / zoom;

        for (const guide of guidelines) {
            const line = this.createLine(guide, zoom, vpt, canvasWidth, canvasHeight, strokeWidth);
            this.metadata.set(line, { category: Category.Guideline });
            this.canvas.add(line);
            this.lines.push(line);
        }

        this.canvas.requestRenderAll();
    }

    /** 更新线宽（缩放变化时调用） */
    updateWidth(): void {
        if (this.lines.length === 0) return;

        const zoom = this.canvas.getZoom();
        const strokeWidth = this.style.lineWidth / zoom;

        for (const line of this.lines) {
            line.set("strokeWidth", strokeWidth);
        }

        this.canvas.requestRenderAll();
    }

    /** 清除所有辅助线 */
    clear(): void {
        for (const line of this.lines) {
            this.canvas.remove(line);
        }
        this.lines = [];
    }

    /** 销毁 */
    destroy(): void {
        this.clear();
    }

    private createLine(
        guide: Guideline,
        zoom: number,
        vpt: number[] | undefined,
        canvasWidth: number,
        canvasHeight: number,
        strokeWidth: number
    ): Line {
        if (guide.type === "vertical") {
            const sceneTop = -(vpt?.[5] ?? 0) / zoom;
            const sceneBottom = (canvasHeight - (vpt?.[5] ?? 0)) / zoom;

            return new Line([guide.position, sceneTop, guide.position, sceneBottom], {
                stroke: this.style.color,
                strokeWidth,
                selectable: false,
                evented: false,
                excludeFromExport: true,
            });
        } else {
            const sceneLeft = -(vpt?.[4] ?? 0) / zoom;
            const sceneRight = (canvasWidth - (vpt?.[4] ?? 0)) / zoom;

            return new Line([sceneLeft, guide.position, sceneRight, guide.position], {
                stroke: this.style.color,
                strokeWidth,
                selectable: false,
                evented: false,
                excludeFromExport: true,
            });
        }
    }
}
