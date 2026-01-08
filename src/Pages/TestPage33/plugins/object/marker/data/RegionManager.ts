import { Point, util, type Canvas, type FabricObject } from "fabric";
import type { RegionData, RegionStyle } from "../types";
import { RegionRenderer } from "../render/RegionRenderer";
import { genId, type ObjectMetadata, type EventBus, type HistoryManager, type HistoryRecord } from "../../../../core";
import { RegionHistoryHandler } from "./RegionHistoryHandler";

export interface RegionManagerOptions {
    canvas: Canvas;
    metadata: ObjectMetadata;
    eventBus: EventBus;
    style?: Partial<RegionStyle>;
    historyManager: HistoryManager;
    pluginName: string;
}

/** 判断是否为拖动的最小距离阈值 */
const DRAG_THRESHOLD = 5;

/**
 * 区域标记管理器
 * 职责：数据存储、逻辑处理、绘制交互、事件派发
 */
export class RegionManager {
    private regions: RegionData[] = [];
    private renderer: RegionRenderer;
    private eventBus: EventBus;
    private historyHandler: RegionHistoryHandler;

    // 绘制状态
    private isDrawing = false;
    private drawStartX = 0;
    private drawStartY = 0;
    private drawTarget: FabricObject | null = null;
    private drawTargetId: string | null = null;

    constructor(options: RegionManagerOptions) {
        this.eventBus = options.eventBus;
        this.renderer = new RegionRenderer(options.canvas, options.metadata, options.style);
        this.historyHandler = new RegionHistoryHandler({
            historyManager: options.historyManager,
            pluginName: options.pluginName,
            addRegion: this.addDirect,
            removeRegion: (id) => this.remove(id, false),
        });
    }

    /** 获取区域数据 */
    get data(): RegionData[] {
        return [...this.regions];
    }

    /** 是否正在绘制 */
    get drawing(): boolean {
        return this.isDrawing;
    }

    /** 开始绘制区域 */
    startDraw(target: FabricObject, targetId: string, scenePt: { x: number; y: number }): void {
        this.isDrawing = true;
        this.drawStartX = scenePt.x;
        this.drawStartY = scenePt.y;
        this.drawTarget = target;
        this.drawTargetId = targetId;

        this.renderer.createPreview(scenePt);
    }

    /** 更新绘制预览 */
    updateDraw(scenePt: { x: number; y: number }): void {
        if (!this.isDrawing) return;
        this.renderer.updatePreview({ x: this.drawStartX, y: this.drawStartY }, scenePt);
    }

    /** 结束绘制，返回是否为拖动 */
    endDraw(scenePt: { x: number; y: number }): boolean {
        if (!this.isDrawing) return false;

        const dx = Math.abs(scenePt.x - this.drawStartX);
        const dy = Math.abs(scenePt.y - this.drawStartY);

        this.renderer.removePreview();

        const isDrag = dx > DRAG_THRESHOLD || dy > DRAG_THRESHOLD;

        if (isDrag && this.drawTarget && this.drawTargetId) {
            this.add(this.drawTarget, this.drawTargetId, { x: this.drawStartX, y: this.drawStartY }, scenePt);
        }

        this.isDrawing = false;
        this.drawTarget = null;
        this.drawTargetId = null;

        return isDrag;
    }

    /** 获取当前绘制的目标信息 */
    getDrawTarget(): { target: FabricObject; targetId: string } | null {
        if (!this.drawTarget || !this.drawTargetId) return null;
        return { target: this.drawTarget, targetId: this.drawTargetId };
    }

    /** 添加区域 */
    add(
        target: FabricObject,
        targetId: string,
        startPt: { x: number; y: number },
        endPt: { x: number; y: number }
    ): RegionData | null {
        const w = target.width ?? 0; + w / 2
        const h = target.height ?? 0;
        if (!w || !h) return null;

        const inv = util.invertTransform(target.calcTransformMatrix());
        const localStart = new Point(startPt.x, startPt.y).transform(inv);
        const localEnd = new Point(endPt.x, endPt.y).transform(inv);

        const x1 = (localStart.x + w / 2) / w;
        const y1 = (localStart.y + h / 2) / h;
        const x2 = (localEnd.x + w / 2) / w;
        const y2 = (localEnd.y + h / 2) / h;

        const nx = Math.min(x1, x2);
        const ny = Math.min(y1, y2);
        const nw = Math.abs(x2 - x1);
        const nh = Math.abs(y2 - y1);

        if (nw < 0.01 || nh < 0.01) return null;

        const region: RegionData = { id: genId("region"), targetId, nx, ny, nw, nh };

        this.regions.push(region);
        this.historyHandler.recordAddRegion(region);
        this.emitChange();
        this.sync();

        return region;
    }

    /**
     * 移除区域
     * @param id 区域 ID
     * @param recordHistory 是否记录历史
     */
    remove = (id: string, recordHistory: boolean): void => {
        const region = this.regions.find(r => r.id === id);
        if (!region) return;

        if (recordHistory) {
            this.historyHandler.recordRemoveRegion(region);
        }

        this.regions = this.regions.filter((r) => r.id !== id);
        this.emitChange();
        this.sync();
    };

    /** 移除指定目标对象上的所有区域 */
    removeByTarget = (targetId: string): void => {
        this.regions = this.regions.filter((r) => r.targetId !== targetId);
        this.emitChange();
        this.sync();
    };

    /** 清空所有区域 */
    clear = (): void => {
        this.regions = [];
        this.renderer.clear();
        this.emitChange();
    };

    /** 加载区域数据 */
    load = (data: RegionData[]): void => {
        this.regions = [...data];
        this.emitChange();
        this.sync();
    };

    /** 直接添加（内部使用，撤销/重做时调用） */
    private addDirect = (region: RegionData): void => {
        this.regions.push(region);
        this.emitChange();
        this.sync();
    };

    /** 同步渲染 */
    sync = (): void => {
        this.renderer.sync(this.regions);
    };

    /** 置顶 */
    bringToFront = (): void => {
        this.renderer.bringToFront();
    };

    /** 设置样式 */
    setStyle(style: Partial<RegionStyle>): void {
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
        this.renderer.removePreview();
        this.renderer.clear();
    }

    private emitChange = (): void => {
        this.eventBus.emit("regions:change", this.regions);
    };

    // ─── 历史记录委托 ─────────────────────────────────────────

    applyUndo(record: HistoryRecord): void {
        this.historyHandler.applyUndo(record);
    }

    applyRedo(record: HistoryRecord): void {
        this.historyHandler.applyRedo(record);
    }
}
