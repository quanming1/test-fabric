import type { FabricObject } from "fabric";
import { BasePlugin } from "../../base/Plugin";
import { PointManager } from "./data/PointManager";
import { RegionManager } from "./data/RegionManager";
import type { MarkerPluginOptions, PointStyle, RegionStyle, RegionData, PointData } from "./types";
import { Category, type MarkPoint, type HistoryRecord } from "../../../core";
import { EditorMode, ModePlugin } from "../../mode/ModePlugin";
import { MarkerPluginState } from "./helper/MarkerPluginState";

/** 默认可标记的分类 */
const DEFAULT_MARKABLE_CATEGORIES: Category[] = [Category.DrawRect, Category.Image];

/**
 * 标记插件
 * 功能：
 * - Ctrl+点击在任意可标记对象上创建标记点
 * - RangeSelect 模式下拖动绘制区域，点击添加标记点
 * - 标记点和区域跟随目标对象变换
 */
export class MarkerPlugin extends BasePlugin {
    readonly name = "marker";
    override serializable = true;
    override importOrder = 10; // 在画布对象加载后再导入

    private pointManager!: PointManager;
    private regionManager!: RegionManager;
    private options: MarkerPluginOptions;
    private markableCategories: Category[];
    private state: MarkerPluginState = null!;
    private lastMode: EditorMode | null = null;

    constructor(options?: MarkerPluginOptions) {
        super();
        this.options = options ?? {};
        this.markableCategories = options?.markableCategories ?? DEFAULT_MARKABLE_CATEGORIES;
    }

    protected onInstall(): void {
        this.pointManager = new PointManager({
            canvas: this.canvas,
            metadata: this.editor.metadata,
            eventBus: this.eventBus,
            style: this.options.style,
            historyManager: this.editor.history,
            pluginName: this.name,
        });

        this.regionManager = new RegionManager({
            canvas: this.canvas,
            metadata: this.editor.metadata,
            eventBus: this.eventBus,
            style: this.options.regionStyle,
            historyManager: this.editor.history,
            pluginName: this.name,
        });

        this.state = new MarkerPluginState(this.markableCategories, this.editor);
        this.bindEvents();
    }

    // ─── 公开 API ─────────────────────────────────────────

    get points(): MarkPoint[] {
        return this.pointManager.data;
    }

    get regionList(): RegionData[] {
        return this.regionManager.data;
    }

    addMarker(target: FabricObject, targetId: string, scenePt: { x: number; y: number }): MarkPoint | null {
        return this.pointManager.add(target, targetId, scenePt);
    }

    addRegion(
        target: FabricObject,
        targetId: string,
        startPt: { x: number; y: number },
        endPt: { x: number; y: number }
    ): RegionData | null {
        return this.regionManager.add(target, targetId, startPt, endPt);
    }

    removeMarker = (id: string): void => {
        this.pointManager.remove(id);
    };

    removeMarkersByTarget = (targetId: string): void => this.pointManager.removeByTarget(targetId);

    removeRegion = (id: string): void => {
        this.regionManager.remove(id);
    };

    removeRegionsByTarget = (targetId: string): void => this.regionManager.removeByTarget(targetId);
    clearMarkers = (): void => this.pointManager.clear();
    clearRegions = (): void => this.regionManager.clear();
    clearAll = (): void => { this.clearMarkers(); this.clearRegions(); };

    setStyle(style: Partial<PointStyle>): void {
        this.pointManager.setStyle(style);
    }

    setRegionStyle(style: Partial<RegionStyle>): void {
        this.regionManager.setStyle(style);
    }

    // ─── 导入导出 API ─────────────────────────────────────────

    /** 获取原始点数据（用于导出） */
    getPointsData(): PointData[] {
        return this.pointManager.rawData;
    }

    /** 获取原始区域数据（用于导出） */
    getRegionsData(): RegionData[] {
        return this.regionManager.data;
    }

    /** 加载点数据（用于导入） */
    loadPoints(data: PointData[]): void {
        this.pointManager.load(data);
    }

    /** 加载区域数据（用于导入） */
    loadRegions(data: RegionData[]): void {
        this.regionManager.load(data);
    }

    /** 导出所有 marker 数据 */
    exportData(): { points: PointData[]; regions: RegionData[] } {
        return {
            points: this.getPointsData(),
            regions: this.getRegionsData(),
        };
    }

    /** 导入所有 marker 数据 */
    importData(data: { points?: PointData[]; regions?: RegionData[] }): void {
        if (data.points) {
            this.loadPoints(data.points);
        }
        if (data.regions) {
            this.loadRegions(data.regions);
        }
    }

    // ─── 历史记录 ─────────────────────────────────────────

    /**
     * 获取目标对象关联的所有标记数据（用于删除目标时保存）
     */
    getMarkersForTarget(targetId: string): { points: PointData[]; regions: RegionData[] } {
        return {
            points: this.pointManager.rawData.filter(p => p.targetId === targetId),
            regions: this.regionManager.data.filter(r => r.targetId === targetId),
        };
    }

    /**
     * 记录删除操作（供外部调用，如删除目标对象时）
     * MarkerPlugin 不直接管理 FabricObject，标记的删除会在 onObjectRemoved 中自动处理
     */
    recordDelete(_objects: FabricObject[]): void {
        // 标记的历史记录由 PointManager 和 RegionManager 各自管理
    }

    /**
     * 应用撤销 - 委托给对应的 Manager
     */
    applyUndo(record: HistoryRecord): void {
        // 根据快照中的 type 判断是 point 还是 region
        const snapshotData = record.before?.[0]?.data ?? record.after?.[0]?.data;
        if (!snapshotData) return;

        const type = (snapshotData as any).type;
        if (type === "point") {
            this.pointManager.applyUndo(record);
        } else if (type === "region") {
            this.regionManager.applyUndo(record);
        }
    }

    /**
     * 应用重做 - 委托给对应的 Manager
     */
    applyRedo(record: HistoryRecord): void {
        const snapshotData = record.before?.[0]?.data ?? record.after?.[0]?.data;
        if (!snapshotData) return;

        const type = (snapshotData as any).type;
        if (type === "point") {
            this.pointManager.applyRedo(record);
        } else if (type === "region") {
            this.regionManager.applyRedo(record);
        }
    }

    // ─── 私有方法 ─────────────────────────────────────────

    private bindEvents(): void {
        this.canvas.on("mouse:down", this.onMouseDown);
        this.canvas.on("mouse:move", this.onMouseMove);
        this.canvas.on("mouse:up", this.onMouseUp);
        this.canvas.on("object:moving", this.syncAll);
        this.canvas.on("object:scaling", this.syncAll);
        this.canvas.on("object:rotating", this.syncAll);
        this.canvas.on("object:modified", this.syncAll);
        this.canvas.on("object:removed", this.onObjectRemoved);

        this.eventBus.on("zoom:change", this.syncAll);
        this.eventBus.on("layer:change", this.bringAllToFront);
        this.eventBus.on("mode:change", this.onModeChange);

        // 撤销/重做后同步标记位置
        this.eventBus.on("history:undo:after", this.syncAll);
        this.eventBus.on("history:redo:after", this.syncAll);

        this.state.on("rangeAble:change", (rangeAble) => {
            console.log("[rangeAble:change] " + rangeAble);
            if (rangeAble) {
                this.lastMode = this.editor.getPlugin<ModePlugin>("mode").mode;
                this.editor.getPlugin<ModePlugin>("mode").setMode(EditorMode.RangeSelect);
            } else {
                this.editor.getPlugin<ModePlugin>("mode").setMode(this.lastMode ?? EditorMode.Select);
            }
        });
    }

    private canMark(target: FabricObject): boolean {
        return this.markableCategories.some((cat) => this.editor.metadata.is(target, "category", cat));
    }

    private getTargetId(target: FabricObject): string | null {
        return this.editor.metadata.get(target)?.id ?? null;
    }

    private getCurrentMode(): EditorMode | null {
        return this.editor.getPlugin<ModePlugin>("mode")?.mode ?? null;
    }

    private onModeChange = ({ mode }: { mode: EditorMode }): void => {
        // 注意：区域框始终不响应事件，让事件穿透到下层目标元素
        switch (mode) {
            case EditorMode.Select:
                this.pointManager.setEvented(true);
                break;
            case EditorMode.RangeSelect:
            case EditorMode.DrawRect:
            case EditorMode.Pan:
            default:
                this.pointManager.setEvented(false);
                break;
        }
    };

    private onObjectRemoved = (opt: { target: FabricObject }): void => {
        const target = opt.target;
        if (!target || !this.canMark(target)) return;

        const targetId = this.getTargetId(target);
        if (targetId) {
            this.removeMarkersByTarget(targetId);
            this.removeRegionsByTarget(targetId);
        }
    };

    private onMouseDown = (opt: any): void => {
        const e = opt.e as MouseEvent;
        const mode = this.getCurrentMode();

        if (mode === EditorMode.RangeSelect) {
            const target = opt.target;
            if (!target || !this.canMark(target)) return;

            const targetId = this.getTargetId(target);
            if (!targetId) return;

            const scenePt = this.canvas.getScenePoint(e as any);
            this.regionManager.startDraw(target, targetId, scenePt);

            e.preventDefault();
            e.stopPropagation();
            return;
        }

        if (!(e.ctrlKey || e.metaKey)) return;

        const target = opt.target;
        if (!target || !this.canMark(target)) return;

        const targetId = this.getTargetId(target);
        if (!targetId) return;

        const scenePt = this.canvas.getScenePoint(e as any);
        this.addMarker(target, targetId, scenePt);

        e.preventDefault();
        e.stopPropagation();
    };

    private onMouseMove = (opt: any): void => {
        if (!this.regionManager.drawing) return;
        const scenePt = this.canvas.getScenePoint(opt.e as any);
        this.regionManager.updateDraw(scenePt);
    };

    private onMouseUp = (opt: any): void => {
        if (!this.regionManager.drawing) return;

        const scenePt = this.canvas.getScenePoint(opt.e as any);
        const drawInfo = this.regionManager.getDrawTarget();
        const isDrag = this.regionManager.endDraw(scenePt);

        if (!isDrag && drawInfo) {
            this.addMarker(drawInfo.target, drawInfo.targetId, scenePt);
        }
    };

    private syncAll = (): void => {
        this.pointManager.sync();
        this.regionManager.sync();
    };

    private bringAllToFront = (): void => {
        this.regionManager.bringToFront();
        this.pointManager.bringToFront();
    };

    protected onDestroy(): void {
        this.canvas.off("mouse:down", this.onMouseDown);
        this.canvas.off("mouse:move", this.onMouseMove);
        this.canvas.off("mouse:up", this.onMouseUp);
        this.canvas.off("object:moving", this.syncAll);
        this.canvas.off("object:scaling", this.syncAll);
        this.canvas.off("object:rotating", this.syncAll);
        this.canvas.off("object:modified", this.syncAll);
        this.canvas.off("object:removed", this.onObjectRemoved);

        this.eventBus.off("zoom:change", this.syncAll);
        this.eventBus.off("layer:change", this.bringAllToFront);
        this.eventBus.off("mode:change", this.onModeChange);
        this.eventBus.off("history:undo:after", this.syncAll);
        this.eventBus.off("history:redo:after", this.syncAll);

        this.pointManager.destroy();
        this.regionManager.destroy();
    }
}
