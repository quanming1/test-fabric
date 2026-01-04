import { Point, util, type FabricObject, type Canvas } from "fabric";
import type { PointData, PointStyle } from "../types";
import { PointRenderer } from "../render/PointRenderer";
import { genId, type ObjectMetadata, type EventBus, type MarkPoint } from "../../../../core";

export interface PointManagerOptions {
    canvas: Canvas;
    metadata: ObjectMetadata;
    eventBus: EventBus;
    style?: Partial<PointStyle>;
}

/**
 * 点标记管理器
 * 职责：数据存储、逻辑处理、事件派发
 */
export class PointManager {
    private points: PointData[] = [];
    private renderer: PointRenderer;
    private eventBus: EventBus;

    constructor(options: PointManagerOptions) {
        this.eventBus = options.eventBus;
        this.renderer = new PointRenderer(options.canvas, options.metadata, options.style);
    }

    /** 获取标记点数据（兼容旧格式） */
    get data(): MarkPoint[] {
        return this.points.map(({ id, targetId, nx, ny }) => ({
            id, rectId: targetId, nx, ny,
        }));
    }

    /** 获取原始数据 */
    get rawData(): PointData[] {
        return [...this.points];
    }

    /** 添加标记点 */
    add(target: FabricObject, targetId: string, scenePt: { x: number; y: number }): MarkPoint | null {
        const w = target.width ?? 0;
        const h = target.height ?? 0;
        if (!w || !h) return null;

        const inv = util.invertTransform(target.calcTransformMatrix());
        const localPt = new Point(scenePt.x, scenePt.y).transform(inv);

        const nx = (localPt.x + w / 2) / w;
        const ny = (localPt.y + h / 2) / h;

        const point: PointData = { id: genId("pt"), targetId, nx, ny };

        console.log('point', point)

        this.points.push(point);
        this.emitChange();
        this.sync();

        return { id: point.id, rectId: targetId, nx, ny };
    }

    /** 移除标记点 */
    remove = (id: string): void => {
        this.points = this.points.filter((p) => p.id !== id);
        this.emitChange();
        this.sync();
    };

    /** 移除指定目标对象上的所有标记点 */
    removeByTarget = (targetId: string): void => {
        this.points = this.points.filter((p) => p.targetId !== targetId);
        this.emitChange();
        this.sync();
    };

    /** 清空所有标记点 */
    clear = (): void => {
        this.points = [];
        this.renderer.clear();
        this.emitChange();
    };

    /** 加载标记点数据 */
    load = (data: PointData[]): void => {
        this.points = [...data];
        this.emitChange();
        this.sync();
    };

    /** 同步渲染 */
    sync = (): void => {
        this.renderer.sync(this.points);
    };

    /** 置顶 */
    bringToFront = (): void => {
        this.renderer.bringToFront();
    };

    /** 设置样式 */
    setStyle(style: Partial<PointStyle>): void {
        this.renderer.setStyle(style);
        this.renderer.clear();
        this.sync();
    }

    /** 设置 evented 状态 */
    setEvented(evented: boolean): void {
        this.renderer.setEvented(evented);
    }

    /** 销毁 */
    destroy(): void {
        this.renderer.clear();
    }

    private emitChange = (): void => {
        this.eventBus.emit("markers:change", this.data);
    };
}
