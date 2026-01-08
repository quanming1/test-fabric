import type { Canvas, FabricObject } from "fabric";
import type { ObjectMetadata } from "../object/ObjectMetadata";

/**
 * 渲染器基类
 * 提供统一的 sync/diff 渲染逻辑
 *
 * @template TData - 数据项类型
 * @template TStyle - 样式配置类型
 * @template TObject - Fabric 对象类型
 */
export abstract class BaseRenderer<
    TData = unknown,
    TStyle = Record<string, unknown>,
    TObject extends FabricObject = FabricObject
> {
    protected canvas: Canvas;
    protected metadata: ObjectMetadata;
    protected style: TStyle;
    protected objects = new Map<string, TObject>();
    private _mounted = false;

    constructor(
        canvas: Canvas,
        metadata: ObjectMetadata,
        defaultStyle: TStyle,
        style: Partial<TStyle> = {}
    ) {
        this.canvas = canvas;
        this.metadata = metadata;
        this.style = { ...defaultStyle, ...style };
    }

    // ─── 生命周期 ─────────────────────────────────────────

    mount(): void {
        if (this._mounted) return;
        this._mounted = true;
        this.onMount();
    }

    unmount(): void {
        if (!this._mounted) return;
        for (const obj of this.objects.values()) {
            this.canvas.remove(obj);
        }
        this.objects.clear();
        this.onUnmount();
        this._mounted = false;
    }

    protected onMount(): void { }
    protected onUnmount(): void { }

    // ─── 核心渲染 ─────────────────────────────────────────

    /**
     * 同步数据到画布
     * 自动处理 diff：移除失效对象、创建新对象、更新现有对象
     */
    sync(data: TData[]): void {
        if (!this._mounted) this.mount();

        const activeIds = new Set(data.map((d) => this.getDataId(d)));
        const inverseZoom = this.getInverseZoom();

        // 移除失效对象
        for (const [id, obj] of this.objects) {
            if (!activeIds.has(id)) {
                this.removeObject(id, obj);
            }
        }

        // 创建或更新
        data.forEach((item, index) => {
            const id = this.getDataId(item);
            const existing = this.objects.get(id);

            if (existing) {
                this.updateObject(id, existing, item, index, inverseZoom);
            } else {
                this.createObject(id, item, index, inverseZoom);
            }
        });

        this.requestRender();
    }

    // ─── 抽象方法 ─────────────────────────────────────────

    protected abstract getDataId(data: TData): string;

    protected abstract createObject(
        id: string,
        data: TData,
        index: number,
        inverseZoom: number
    ): void;

    protected abstract updateObject(
        id: string,
        obj: TObject,
        data: TData,
        index: number,
        inverseZoom: number
    ): void;

    // ─── 工具方法 ─────────────────────────────────────────

    protected getZoom(): number {
        return this.canvas.getZoom() || 1;
    }

    protected getInverseZoom(): number {
        return 1 / this.getZoom();
    }

    protected requestRender(): void {
        this.canvas.requestRenderAll();
    }

    protected addObject(id: string, obj: TObject): void {
        this.canvas.add(obj);
        this.objects.set(id, obj);
    }

    protected removeObject(id: string, obj: TObject): void {
        this.canvas.remove(obj);
        this.objects.delete(id);
    }

    get isMounted(): boolean {
        return this._mounted;
    }

    get objectCount(): number {
        return this.objects.size;
    }
}
