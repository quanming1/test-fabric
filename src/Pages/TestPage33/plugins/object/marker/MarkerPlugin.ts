import { Point, util, type FabricObject } from "fabric";
import { BasePlugin } from "../../base/Plugin";
import { genId, type MarkPoint } from "../../../core/types";
import { MarkerRenderer } from "./MarkerRenderer";
import type { MarkerData, MarkerStyle } from "./types";

/**
 * 标记点插件（Canvas 渲染版本）
 * 功能：Ctrl+点击在矩形上创建标记点，标记点跟随对象变换
 *
 * 渲染方式：使用 Canvas 2D API 直接绘制，不再使用 DOM
 */
export class MarkerPlugin extends BasePlugin {
    readonly name = "marker";

    private markers: MarkerData[] = [];
    private rectById = new Map<string, FabricObject>();
    private renderer!: MarkerRenderer;
    private styleOptions: Partial<MarkerStyle>;

    constructor(style?: Partial<MarkerStyle>) {
        super();
        this.styleOptions = style ?? {};
    }

    protected onInstall(): void {
        this.renderer = new MarkerRenderer(this.canvas, this.styleOptions);
        this.bindEvents();
    }

    /** 获取标记点数据（对外接口，返回 MarkPoint 格式） */
    get points(): MarkPoint[] {
        return this.markers.map(({ id, rectId, nx, ny }) => ({ id, rectId, nx, ny }));
    }

    private bindEvents(): void {
        this.canvas.on("mouse:down", this.onMouseDown);

        // 对象变换时需要同步标记点位置
        this.canvas.on("object:moving", this.syncMarkers);
        this.canvas.on("object:scaling", this.syncMarkers);
        this.canvas.on("object:rotating", this.syncMarkers);
        this.canvas.on("object:modified", this.syncMarkers);

        // 缩放变化时同步
        this.eventBus.on("zoom:change", this.syncMarkers);

        // 层级变化时，确保标记点在最上层
        this.eventBus.on("layer:change", this.bringMarkersToFront);
    }

    private onMouseDown = (opt: any): void => {
        const e = opt.e as MouseEvent;
        if (!(e.ctrlKey || e.metaKey)) return;

        const target = opt.target;
        if (!target || target.type !== "rect") return;

        const scenePt = this.canvas.getScenePoint(e as any);
        this.addMarker(target, scenePt);

        e.preventDefault();
        e.stopPropagation();
    };

    /**
     * 添加标记点
     */
    addMarker(target: FabricObject, scenePt: { x: number; y: number }): MarkPoint | null {
        const rectId = this.ensureRectId(target);
        const w = target.width ?? 0;
        const h = target.height ?? 0;
        if (!w || !h) return null;

        // 场景坐标 → 局部坐标
        const inv = util.invertTransform(target.calcTransformMatrix());
        const localPt = new Point(scenePt.x, scenePt.y).transform(inv);

        // 局部坐标（中心原点）→ 归一化坐标
        const nx = (localPt.x + w / 2) / w;
        const ny = (localPt.y + h / 2) / h;

        const marker: MarkerData = {
            id: genId("pt"),
            rectId,
            nx,
            ny,
            target,
        };

        this.markers.push(marker);
        this.emitChange();
        this.syncMarkers();

        return { id: marker.id, rectId, nx, ny };
    }

    private ensureRectId(obj: FabricObject): string {
        if (!(obj as any).__rectId) {
            (obj as any).__rectId = genId("rect");
        }
        const id = (obj as any).__rectId as string;
        this.rectById.set(id, obj);
        return id;
    }

    /** 注册对象（供外部调用） */
    registerObject(obj: FabricObject): string {
        return this.ensureRectId(obj);
    }

    /**
     * 同步标记点到 canvas
     */
    private syncMarkers = (): void => {
        // 确保 marker 的 target 引用是最新的
        this.markers.forEach((m) => {
            if (!m.target) {
                m.target = this.rectById.get(m.rectId);
            }
        });

        this.renderer.sync(this.markers);
    };

    /**
     * 将所有标记点置顶
     */
    private bringMarkersToFront = (): void => {
        this.renderer.bringToFront();
    };

    private emitChange(): void {
        this.eventBus.emit("markers:change", this.points);
    }

    /** 删除标记点 */
    removeMarker(id: string): void {
        this.markers = this.markers.filter((m) => m.id !== id);
        this.emitChange();
        this.syncMarkers();
    }

    /** 清空所有标记点 */
    clearMarkers(): void {
        this.markers = [];
        this.renderer.clear();
        this.emitChange();
    }

    /** 更新渲染样式 */
    setStyle(style: Partial<MarkerStyle>): void {
        this.renderer.setStyle(style);
        // 样式变更需要重建所有标记点
        this.renderer.clear();
        this.syncMarkers();
    }

    protected onDestroy(): void {
        this.canvas.off("mouse:down", this.onMouseDown);
        this.canvas.off("object:moving", this.syncMarkers);
        this.canvas.off("object:scaling", this.syncMarkers);
        this.canvas.off("object:rotating", this.syncMarkers);
        this.canvas.off("object:modified", this.syncMarkers);
        this.eventBus.off("zoom:change", this.syncMarkers);
        this.eventBus.off("layer:change", this.bringMarkersToFront);
        this.renderer.clear();
        this.rectById.clear();
    }
}
