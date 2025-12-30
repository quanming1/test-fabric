import { Point, util, type FabricObject } from "fabric";
import { BasePlugin } from "../../base/Plugin";
import { MarkerRenderer } from "./MarkerRenderer";
import type { MarkerData, MarkerStyle } from "./types";
import { genId, Category, type MarkPoint } from "../../../core";
import { EditorMode } from "../../mode/ModePlugin";

/**
 * 标记点插件（Canvas 渲染版本）
 * 功能：Ctrl+点击在矩形上创建标记点，标记点跟随对象变换
 */
export class MarkerPlugin extends BasePlugin {
    readonly name = "marker";

    private markers: MarkerData[] = [];
    private renderer!: MarkerRenderer;
    private styleOptions: Partial<MarkerStyle>;

    constructor(style?: Partial<MarkerStyle>) {
        super();
        this.styleOptions = style ?? {};
    }

    protected onInstall(): void {
        this.renderer = new MarkerRenderer(this.canvas, this.editor.category, this.styleOptions);
        this.bindEvents();
    }

    /** 获取标记点数据 */
    get points(): MarkPoint[] {
        return this.markers.map(({ id, rectId, nx, ny }) => ({ id, rectId, nx, ny }));
    }

    private bindEvents(): void {
        this.canvas.on("mouse:down", this.onMouseDown);
        this.canvas.on("object:moving", this.syncMarkers);
        this.canvas.on("object:scaling", this.syncMarkers);
        this.canvas.on("object:rotating", this.syncMarkers);
        this.canvas.on("object:modified", this.syncMarkers);

        this.eventBus.on("zoom:change", this.syncMarkers);
        this.eventBus.on("layer:change", this.bringMarkersToFront);
        this.eventBus.on("mode:change", this.onModeChange);
    }

    /**
     * 模式变化时更新 Marker 的 evented 状态
     */
    private onModeChange = ({ mode }: { mode: EditorMode }): void => {
        const evented = mode === EditorMode.Select;
        this.setMarkersEvented(evented);
    };

    /**
     * 设置所有 Marker 的 evented 状态
     */
    private setMarkersEvented(evented: boolean): void {
        this.editor.category.getAll(Category.Marker).forEach((obj) => {
            obj.evented = evented;
        });
    }

    private onMouseDown = (opt: any): void => {
        const e = opt.e as MouseEvent;
        if (!(e.ctrlKey || e.metaKey)) return;

        const target = opt.target;
        if (!target || target.type !== "rect") return;

        const rectId = this.editor.category.getData(target)?.id;
        if (!rectId) return;

        const scenePt = this.canvas.getScenePoint(e as any);
        this.addMarker(target, rectId, scenePt);

        e.preventDefault();
        e.stopPropagation();
    };

    /**
     * 添加标记点
     */
    addMarker(target: FabricObject, rectId: string, scenePt: { x: number; y: number }): MarkPoint | null {
        const w = target.width ?? 0;
        const h = target.height ?? 0;
        if (!w || !h) return null;

        const inv = util.invertTransform(target.calcTransformMatrix());
        const localPt = new Point(scenePt.x, scenePt.y).transform(inv);

        const nx = (localPt.x + w / 2) / w;
        const ny = (localPt.y + h / 2) / h;

        const marker: MarkerData = {
            id: genId("pt"),
            rectId,
            nx,
            ny,
        };

        this.markers.push(marker);
        this.emitChange();
        this.syncMarkers();

        return { id: marker.id, rectId, nx, ny };
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
        this.eventBus.off("zoom:change", this.syncMarkers);
        this.eventBus.off("layer:change", this.bringMarkersToFront);
        this.eventBus.off("mode:change", this.onModeChange);
        this.renderer.clear();
    }
}
