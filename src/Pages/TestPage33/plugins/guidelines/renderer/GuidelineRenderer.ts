import { Line, Group, type Canvas } from "fabric";
import { BaseRenderer } from "../../../core/render";
import type { Guideline, GuidelinesStyle, IntersectionPoint } from "../types";
import { Category, type ObjectMetadata } from "../../../core";

// 为 Guideline 添加唯一标识
interface GuidelineWithId extends Guideline {
    id: string;
}

/**
 * 辅助线渲染器
 * 负责辅助线的创建、更新和清除
 */
export class GuidelineRenderer extends BaseRenderer<GuidelineWithId, GuidelinesStyle, Group> {
    private crossSize = 9; // 叉号大小（屏幕像素，不随 zoom 变化）

    constructor(canvas: Canvas, metadata: ObjectMetadata, style: GuidelinesStyle) {
        super(canvas, metadata, style);
    }

    protected getDataId(data: GuidelineWithId): string {
        return data.id;
    }

    protected createObject(id: string, data: GuidelineWithId, _index: number, _inverseZoom: number): void {
        const group = this.createGuidelineGroup(data);
        this.metadata.set(group, { category: Category.Guideline });
        this.addObject(id, group);
    }

    protected updateObject(id: string, group: Group, data: GuidelineWithId, _index: number, _inverseZoom: number): void {
        // 辅助线通常是临时的，直接重建更简单
        this.removeObject(id, group);
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

        for (const group of this.objects.values()) {
            for (const obj of group.getObjects()) {
                if (obj instanceof Line) {
                    obj.set("strokeWidth", strokeWidth);
                }
            }
        }

        this.requestRender();
    }

    /** 更新样式 */
    setStyle(style: Partial<GuidelinesStyle>): void {
        this.style = { ...this.style, ...style };
    }

    /** 清除所有辅助线 */
    clear(): void {
        for (const group of this.objects.values()) {
            this.canvas.remove(group);
        }
        this.objects.clear();
    }

    /** 销毁 */
    destroy(): void {
        this.unmount();
    }

    // ─── Private ─────────────────────────────────────────

    /** 创建辅助线组（包含线和交点叉号） */
    private createGuidelineGroup(guide: GuidelineWithId): Group {
        const line = this.createLine(guide);
        const crosses = this.createCrosses(guide.intersections ?? []);

        const group = new Group([line, ...crosses], {
            selectable: false,
            evented: false,
            excludeFromExport: true,
        });

        return group;
    }

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

    /** 在交点处创建叉号 */
    private createCrosses(intersections: IntersectionPoint[]): Line[] {
        const lines: Line[] = [];
        const zoom = this.getZoom();
        // 叉号大小固定为 9 屏幕像素，除以 zoom 转换到场景坐标
        const halfSize = this.crossSize / zoom / 2;
        const strokeWidth = this.style.lineWidth / zoom;

        for (const point of intersections) {
            // 叉号的两条对角线
            const line1 = new Line(
                [point.x - halfSize, point.y - halfSize, point.x + halfSize, point.y + halfSize],
                {
                    stroke: this.style.color,
                    strokeWidth,
                    selectable: false,
                    evented: false,
                    excludeFromExport: true,
                }
            );
            const line2 = new Line(
                [point.x - halfSize, point.y + halfSize, point.x + halfSize, point.y - halfSize],
                {
                    stroke: this.style.color,
                    strokeWidth,
                    selectable: false,
                    evented: false,
                    excludeFromExport: true,
                }
            );
            lines.push(line1, line2);
        }

        return lines;
    }
}
