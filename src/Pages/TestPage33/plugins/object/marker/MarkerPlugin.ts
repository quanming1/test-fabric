import { Point, util, type FabricObject } from "fabric";
import { BasePlugin } from "../../base/Plugin";
import { MarkerRenderer } from "./MarkerRenderer";
import type { MarkerData, MarkerStyle, MarkerPluginOptions } from "./types";
import { genId, Category, type MarkPoint } from "../../../core";
import { EditorMode } from "../../mode/ModePlugin";
import { MarkerPluginState } from "./helper/MarkerPluginState";

/** 默认可标记的分类 */
const DEFAULT_MARKABLE_CATEGORIES: Category[] = [Category.DrawRect, Category.Image];

/**
 * 标记点插件（Canvas 渲染版本）
 * 功能：Ctrl+点击在任意可标记对象上创建标记点，标记点跟随对象变换
 */
export class MarkerPlugin extends BasePlugin {
    readonly name = "marker";

    private markers: MarkerData[] = [];
    private renderer!: MarkerRenderer;
    private options: MarkerPluginOptions;
    private markableCategories: Category[];
    private state: MarkerPluginState = null

    constructor(options?: MarkerPluginOptions) {
        super();
        this.options = options ?? {};
        this.markableCategories = options?.markableCategories ?? DEFAULT_MARKABLE_CATEGORIES;
    }

    protected onInstall(): void {
        this.renderer = new MarkerRenderer(
            this.canvas,
            this.editor.metadata,
            this.options.style
        );
        this.bindEvents();

        this.state = new MarkerPluginState(this.markableCategories, this.editor)
    }

    /** 获取标记点数据 */
    get points(): MarkPoint[] {
        return this.markers.map(({ id, targetId, nx, ny }) => ({
            id,
            rectId: targetId, // 保持向后兼容
            nx,
            ny,
        }));
    }

    private bindEvents(): void {
        this.canvas.on("mouse:down", this.onMouseDown);
        this.canvas.on("object:moving", this.syncMarkers);
        this.canvas.on("object:scaling", this.syncMarkers);
        this.canvas.on("object:rotating", this.syncMarkers);
        this.canvas.on("object:modified", this.syncMarkers);
        this.canvas.on("object:removed", this.onObjectRemoved);

        this.eventBus.on("zoom:change", this.syncMarkers);
        this.eventBus.on("layer:change", this.bringMarkersToFront);
        this.eventBus.on("mode:change", this.onModeChange);
    }

    /**
     * 判断对象是否可被标记
     */
    private canMark(target: FabricObject): boolean {
        return this.markableCategories.some((cat) =>
            this.editor.metadata.is(target, "category", cat)
        );
    }

    /**
     * 获取目标对象的 ID
     */
    private getTargetId(target: FabricObject): string | null {
        return this.editor.metadata.get(target)?.id ?? null;
    }

    /**
     * 模式变化时更新 Marker 的 evented 状态
     */
    private onModeChange = ({ mode }: { mode: EditorMode }): void => {
        const evented = mode === EditorMode.Select;
        this.renderer.setEvented(evented);
    };

    /**
     * 对象被删除时，移除其上的所有标记点
     */
    private onObjectRemoved = (opt: { target: FabricObject }): void => {
        const target = opt.target;
        if (!target || !this.canMark(target)) return;

        const targetId = this.getTargetId(target);
        if (targetId) {
            this.removeMarkersByTarget(targetId);
        }
    };

    private onMouseDown = (opt: any): void => {
        const e = opt.e as MouseEvent;
        if (!(e.ctrlKey || e.metaKey)) return;

        const target = opt.target;
        if (!target) return;

        // 检查是否可标记
        if (!this.canMark(target)) return;

        const targetId = this.getTargetId(target);
        if (!targetId) return;

        const scenePt = this.canvas.getScenePoint(e as any);
        this.addMarker(target, targetId, scenePt);

        e.preventDefault();
        e.stopPropagation();
    };

    /**
     * 添加标记点
     */
    addMarker(
        target: FabricObject,
        targetId: string,
        scenePt: { x: number; y: number }
    ): MarkPoint | null {
        const w = target.width ?? 0;
        const h = target.height ?? 0;
        if (!w || !h) return null;

        const inv = util.invertTransform(target.calcTransformMatrix());
        const localPt = new Point(scenePt.x, scenePt.y).transform(inv);

        const nx = (localPt.x + w / 2) / w;
        const ny = (localPt.y + h / 2) / h;

        const marker: MarkerData = {
            id: genId("pt"),
            targetId,
            nx,
            ny,
        };

        this.markers.push(marker);
        this.emitChange();
        this.syncMarkers();

        return { id: marker.id, rectId: targetId, nx, ny };
    }

    private syncMarkers = (): void => {
        this.renderer.sync(this.markers);
    };

    private bringMarkersToFront = (): void => {
        this.renderer.bringToFront();
    };

    private emitChange(): void {
        this.eventBus.emit("markers:change", this.points);
    }

    removeMarker(id: string): void {
        this.markers = this.markers.filter((m) => m.id !== id);
        this.emitChange();
        this.syncMarkers();
    }

    /** 移除指定目标对象上的所有标记点 */
    removeMarkersByTarget(targetId: string): void {
        this.markers = this.markers.filter((m) => m.targetId !== targetId);
        this.emitChange();
        this.syncMarkers();
    }

    clearMarkers(): void {
        this.markers = [];
        this.renderer.clear();
        this.emitChange();
    }

    setStyle(style: Partial<MarkerStyle>): void {
        this.renderer.setStyle(style);
        this.renderer.clear();
        this.syncMarkers();
    }

    protected onDestroy(): void {
        this.canvas.off("mouse:down", this.onMouseDown);
        this.canvas.off("object:moving", this.syncMarkers);
        this.canvas.off("object:scaling", this.syncMarkers);
        this.canvas.off("object:rotating", this.syncMarkers);
        this.canvas.off("object:modified", this.syncMarkers);
        this.canvas.off("object:removed", this.onObjectRemoved);
        this.eventBus.off("zoom:change", this.syncMarkers);
        this.eventBus.off("layer:change", this.bringMarkersToFront);
        this.eventBus.off("mode:change", this.onModeChange);
        this.renderer.clear();
    }
}
