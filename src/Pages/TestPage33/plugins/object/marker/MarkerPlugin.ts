import type { FabricObject } from "fabric";
import { BasePlugin } from "../../base/Plugin";
import { PointManager } from "./data/PointManager";
import { RegionManager } from "./data/RegionManager";
import type { MarkerPluginOptions, PointStyle, RegionStyle, RegionData, PointData } from "./types";
import { Category, type MarkPoint, type HistoryRecord } from "../../../core";
import { EditorMode, ModePlugin } from "../../mode/ModePlugin";
import { MarkerPluginState } from "./helper/MarkerPluginState";

/** 默认可标记的分类：矩形和图片 */
const DEFAULT_MARKABLE_CATEGORIES: Category[] = [Category.DrawRect, Category.Image];

/**
 * 标记插件 - 在画布对象上创建点标记和区域标记
 *
 * 交互方式：
 * - Select 模式：Ctrl+点击 在目标对象上添加点标记
 * - RangeSelect 模式：拖动绘制区域框，点击添加点标记
 *
 * 核心特性：
 * - 标记使用归一化坐标存储，跟随目标对象变换（移动/缩放/旋转）
 * - 支持序列化导入导出（importOrder=10，确保画布对象先加载）
 * - 集成 HistoryManager 支持撤销/重做
 */
export class MarkerPlugin extends BasePlugin {
    readonly name = "marker";
    override serializable = true;
    override importOrder = 10; // 在画布对象加载后再导入，确保目标对象已存在

    /** 点标记管理器 - 负责点数据存储、渲染、历史记录 */
    private pointManager!: PointManager;
    /** 区域标记管理器 - 负责区域数据存储、绘制交互、历史记录 */
    private regionManager!: RegionManager;
    /** 插件配置 */
    private options: MarkerPluginOptions;
    /** 允许添加标记的对象分类白名单 */
    private markableCategories: Category[];
    /** 状态管理器 - 追踪悬浮目标、Ctrl 键状态，触发模式切换 */
    private state: MarkerPluginState = null!;
    /** 进入 RangeSelect 前的模式，用于退出时恢复 */
    private lastMode: EditorMode | null = null;

    constructor(options?: MarkerPluginOptions) {
        super();
        this.options = options ?? {};
        this.markableCategories = options?.markableCategories ?? DEFAULT_MARKABLE_CATEGORIES;
    }

    protected onInstall(): void {
        // 初始化点标记管理器
        this.pointManager = new PointManager({
            canvas: this.canvas,
            metadata: this.editor.metadata,
            eventBus: this.eventBus,
            style: this.options.style,
            historyManager: this.editor.history,
            pluginName: this.name,
        });

        // 初始化区域标记管理器
        this.regionManager = new RegionManager({
            canvas: this.canvas,
            metadata: this.editor.metadata,
            eventBus: this.eventBus,
            style: this.options.regionStyle,
            historyManager: this.editor.history,
            pluginName: this.name,
        });

        // 初始化状态管理器，监听 Ctrl+悬浮 触发 RangeSelect 模式
        this.state = new MarkerPluginState(this.markableCategories, this.editor);
        this.bindEvents();
    }

    // ─── 公开 API ─────────────────────────────────────────

    /** 获取所有点标记（兼容旧格式，rectId 即 targetId） */
    get points(): MarkPoint[] {
        return this.pointManager.data;
    }

    /** 获取所有区域标记 */
    get regionList(): RegionData[] {
        return this.regionManager.data;
    }

    /** 在目标对象的场景坐标处添加点标记 */
    addMarker(target: FabricObject, targetId: string, scenePt: { x: number; y: number }): MarkPoint | null {
        return this.pointManager.add(target, targetId, scenePt);
    }

    /** 在目标对象上添加区域标记（起点到终点） */
    addRegion(
        target: FabricObject,
        targetId: string,
        startPt: { x: number; y: number },
        endPt: { x: number; y: number }
    ): RegionData | null {
        return this.regionManager.add(target, targetId, startPt, endPt);
    }

    /** 移除指定 ID 的点标记 */
    removeMarker = (id: string, recordHistory = true): void => {
        this.pointManager.remove(id, recordHistory);
    };

    /** 移除目标对象上的所有点标记 */
    removeMarkersByTarget = (targetId: string): void => this.pointManager.removeByTarget(targetId);

    /** 移除指定 ID 的区域标记 */
    removeRegion = (id: string, recordHistory = true): void => {
        this.regionManager.remove(id, recordHistory);
    };

    /** 移除目标对象上的所有区域标记 */
    removeRegionsByTarget = (targetId: string): void => this.regionManager.removeByTarget(targetId);

    /** 清空所有点标记 */
    clearMarkers = (): void => this.pointManager.clear();

    /** 清空所有区域标记 */
    clearRegions = (): void => this.regionManager.clear();

    /** 清空所有标记（点+区域） */
    clearAll = (): void => { this.clearMarkers(); this.clearRegions(); };

    /** 更新点标记样式 */
    setStyle(style: Partial<PointStyle>): void {
        this.pointManager.setStyle(style);
    }

    /** 更新区域标记样式 */
    setRegionStyle(style: Partial<RegionStyle>): void {
        this.regionManager.setStyle(style);
    }

    // ─── 序列化 API（供 CanvasEditor 调用） ─────────────────────────────────────────

    /** 获取点标记原始数据（归一化坐标） */
    getPointsData(): PointData[] {
        return this.pointManager.rawData;
    }

    /** 获取区域标记原始数据 */
    getRegionsData(): RegionData[] {
        return this.regionManager.data;
    }

    /** 加载点标记数据（导入时调用） */
    loadPoints(data: PointData[]): void {
        this.pointManager.load(data);
    }

    /** 加载区域标记数据（导入时调用） */
    loadRegions(data: RegionData[]): void {
        this.regionManager.load(data);
    }

    /** 导出所有标记数据 */
    exportData(): { points: PointData[]; regions: RegionData[] } {
        return {
            points: this.getPointsData(),
            regions: this.getRegionsData(),
        };
    }

    /** 导入所有标记数据 */
    importData(data: { points?: PointData[]; regions?: RegionData[] }): void {
        if (data.points) {
            this.loadPoints(data.points);
        }
        if (data.regions) {
            this.loadRegions(data.regions);
        }
    }

    // ─── 历史记录 API ─────────────────────────────────────────

    /**
     * 获取目标对象关联的所有标记数据
     * 用于删除目标对象时保存快照，支持撤销恢复
     */
    getMarkersForTarget(targetId: string): { points: PointData[]; regions: RegionData[] } {
        return {
            points: this.pointManager.rawData.filter(p => p.targetId === targetId),
            regions: this.regionManager.data.filter(r => r.targetId === targetId),
        };
    }

    /**
     * 删除目标对象关联的所有标记
     * @param ids 目标对象 ID 列表
     * @param recordHistory 是否记录历史
     */
    remove(ids: string[], recordHistory: boolean): void {
        for (const targetId of ids) {
            const points = this.pointManager.rawData.filter(p => p.targetId === targetId);
            const regions = this.regionManager.data.filter(r => r.targetId === targetId);
            points.forEach(p => this.pointManager.remove(p.id, recordHistory));
            regions.forEach(r => this.regionManager.remove(r.id, recordHistory));
        }
    }

    /**
     * 应用撤销 - 根据快照类型委托给对应 Manager
     */
    applyUndo(record: HistoryRecord): void {
        const snapshotData = record.before?.[0]?.data ?? record.after?.[0]?.data;
        if (!snapshotData) return;

        // 通过快照中的 type 字段区分点/区域
        const type = (snapshotData as any).type;
        if (type === "point") {
            this.pointManager.applyUndo(record);
        } else if (type === "region") {
            this.regionManager.applyUndo(record);
        }
    }

    /**
     * 应用重做 - 根据快照类型委托给对应 Manager
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

    /** 绑定画布事件和编辑器事件 */
    private bindEvents(): void {
        // 鼠标交互：点击添加标记、拖动绘制区域
        this.canvas.on("mouse:down", this.onMouseDown);
        this.canvas.on("mouse:move", this.onMouseMove);
        this.canvas.on("mouse:up", this.onMouseUp);

        // 对象变换：同步标记位置
        this.canvas.on("object:moving", this.syncAll);
        this.canvas.on("object:scaling", this.syncAll);
        this.canvas.on("object:rotating", this.syncAll);
        this.canvas.on("object:modified", this.syncAll);

        // 对象删除：清理关联标记
        this.canvas.on("object:removed", this.onObjectRemoved);

        // 缩放/图层变化：同步标记位置和层级
        this.eventBus.on("zoom:change", this.syncAll);
        this.eventBus.on("layer:change", this.bringAllToFront);

        // 模式切换：调整标记的事件响应状态
        this.eventBus.on("mode:change", this.onModeChange);

        // 撤销/重做后同步标记位置（目标对象可能已变换）
        this.eventBus.on("history:undo:after", this.syncAll);
        this.eventBus.on("history:redo:after", this.syncAll);

        // 监听 rangeAble 状态：Ctrl+悬浮可标记对象时自动切换到 RangeSelect 模式
        this.state.on("rangeAble:change", (rangeAble) => {
            console.log("[rangeAble:change] " + rangeAble);
            if (rangeAble) {
                // 保存当前模式，进入区域选择模式
                this.lastMode = this.editor.getPlugin<ModePlugin>("mode").mode;
                this.editor.getPlugin<ModePlugin>("mode").setMode(EditorMode.RangeSelect);
            } else {
                // 恢复之前的模式
                this.editor.getPlugin<ModePlugin>("mode").setMode(this.lastMode ?? EditorMode.Select);
            }
        });
    }

    /** 检查对象是否在可标记分类白名单中 */
    private canMark(target: FabricObject): boolean {
        return this.markableCategories.some((cat) => this.editor.metadata.is(target, "category", cat));
    }

    /** 获取对象的元数据 ID */
    private getTargetId(target: FabricObject): string | null {
        return this.editor.metadata.get(target)?.id ?? null;
    }

    /** 获取当前编辑器模式 */
    private getCurrentMode(): EditorMode | null {
        return this.editor.getPlugin<ModePlugin>("mode")?.mode ?? null;
    }

    /**
     * 模式切换处理：调整标记点的事件响应
     * - Select 模式：点标记可交互（hover/click）
     * - 其他模式：点标记不响应事件，让事件穿透到下层
     * - 区域框始终不响应事件
     */
    private onModeChange = ({ mode }: { mode: EditorMode }): void => {
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

    /** 目标对象被删除时，清理其关联的所有标记 */
    private onObjectRemoved = (opt: { target: FabricObject }): void => {
        const target = opt.target;
        if (!target || !this.canMark(target)) return;

        const targetId = this.getTargetId(target);
        if (targetId) {
            this.removeMarkersByTarget(targetId);
            this.removeRegionsByTarget(targetId);
        }
    };

    /**
     * 鼠标按下处理
     * - RangeSelect 模式：开始绘制区域
     * - Select 模式 + Ctrl：添加点标记
     */
    private onMouseDown = (opt: any): void => {
        const e = opt.e as MouseEvent;
        const mode = this.getCurrentMode();

        // RangeSelect 模式：开始绘制区域框
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

        // Select 模式：Ctrl+点击添加点标记
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

    /** 鼠标移动：更新区域绘制预览 */
    private onMouseMove = (opt: any): void => {
        if (!this.regionManager.drawing) return;
        const scenePt = this.canvas.getScenePoint(opt.e as any);
        this.regionManager.updateDraw(scenePt);
    };

    /**
     * 鼠标释放：结束区域绘制
     * - 拖动距离足够：创建区域标记
     * - 点击（无拖动）：创建点标记
     */
    private onMouseUp = (opt: any): void => {
        if (!this.regionManager.drawing) return;

        const scenePt = this.canvas.getScenePoint(opt.e as any);
        const drawInfo = this.regionManager.getDrawTarget();
        const isDrag = this.regionManager.endDraw(scenePt);

        // 点击而非拖动时，添加点标记
        if (!isDrag && drawInfo) {
            this.addMarker(drawInfo.target, drawInfo.targetId, scenePt);
        }
    };

    /** 同步所有标记位置（目标对象变换后调用） */
    private syncAll = (): void => {
        this.pointManager.sync();
        this.regionManager.sync();
    };

    /** 将所有标记置顶（图层变化后调用） */
    private bringAllToFront = (): void => {
        this.regionManager.bringToFront();
        this.pointManager.bringToFront();
    };

    protected onDestroy(): void {
        // 移除画布事件
        this.canvas.off("mouse:down", this.onMouseDown);
        this.canvas.off("mouse:move", this.onMouseMove);
        this.canvas.off("mouse:up", this.onMouseUp);
        this.canvas.off("object:moving", this.syncAll);
        this.canvas.off("object:scaling", this.syncAll);
        this.canvas.off("object:rotating", this.syncAll);
        this.canvas.off("object:modified", this.syncAll);
        this.canvas.off("object:removed", this.onObjectRemoved);

        // 移除事件总线订阅
        this.eventBus.off("zoom:change", this.syncAll);
        this.eventBus.off("layer:change", this.bringAllToFront);
        this.eventBus.off("mode:change", this.onModeChange);
        this.eventBus.off("history:undo:after", this.syncAll);
        this.eventBus.off("history:redo:after", this.syncAll);

        // 销毁子管理器
        this.pointManager.destroy();
        this.regionManager.destroy();
    }
}
