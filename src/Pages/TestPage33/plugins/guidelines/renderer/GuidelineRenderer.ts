import { Line, type Canvas } from "fabric";
import { BaseRenderer } from "../../../core/render";
import type { Guideline, GuidelinesStyle } from "../types";
import { Category, type ObjectMetadata } from "../../../core";

// 为 Guideline 添加唯一标识
interface GuidelineWithId extends Guideline {
    id: string;
}

/**
 * 辅助线渲染器
 * 负责辅助线的创建、更新和清除
 */
export class GuidelineRenderer extends BaseRenderer<GuidelineWithId, GuidelinesStyle, Line> {
    constructor(canvas: Canvas, metadata: ObjectMetadata, style: GuidelinesStyle) {
        super(canvas, metadata, style);
    }

    protected getDataId(data: GuidelineWithId): string {
        return data.id;
    }

    protected createObject(id: string, data: GuidelineWithId, _index: number, _inverseZoom: number): void {
        const line = this.createLine(data);
        this.metadata.set(line, { category: Category.Guideline });
        this.addObject(id, line);
    }

    protected updateObject(id: string, line: Line, data: GuidelineWithId, _index: number, _inverseZoom: number): void {
        // 辅助线通常是临时的，直接重建更简单
        this.removeObject(id, line);
        this.createObject(id, data, 0, 0);
    }

    /** 渲染辅助线（兼容原有接口） */
    render(guidelines: Guideline[]): void {
        // 为每条辅助线生成唯一 ID
        const withIds: GuidelineWithId[] = guidelines.map((g, i) => ({
            ...g,
            id: `${g.type}-${g.position}-${g.sourceId}-${i}`,
        }));
        this.sync(withIds);
    }

    /** 更新线宽（缩放变化时调用） */
    updateWidth(): void {
        if (this.objectCount === 0) return;

        const zoom = this.getZoom();
        const strokeWidth = this.style.lineWidth / zoom;

        for (const line of this.objects.values()) {
            line.set("strokeWidth", strokeWidth);
        }

        this.requestRender();
    }

    /** 更新样式 */
    setStyle(style: Partial<GuidelinesStyle>): void {
        this.style = { ...this.style, ...style };
    }

    /** 清除所有辅助线 */
    clear(): void {
        for (const line of this.objects.values()) {
            this.canvas.remove(line);
        }
        this.objects.clear();
    }

    /** 销毁 */
    destroy(): void {
        this.unmount();
    }

    // ─── Private ─────────────────────────────────────────

    private createLine(guide: GuidelineWithId): Line {
        const zoom = this.getZoom();
        const vpt = this.canvas.viewportTransform;
        const canvasWidth = this.canvas.width ?? 800;
        const canvasHeight = this.canvas.height ?? 600;
        const strokeWidth = this.style.lineWidth / zoom;

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
