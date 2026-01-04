import { Rect, type FabricObject, type TOptions, type RectProps } from "fabric";
import { BasePlugin } from "../base/Plugin";
import { EditorMode } from "../mode/ModePlugin";
import { Category, genId } from "../../core";

/** DrawRect 需要额外序列化的属性 */
const EXTRA_PROPS = ["data"] as const;

/** DrawRect 默认样式 */
const RECT_STYLE: Partial<RectProps> = {
    originX: "left",
    originY: "top",
    fill: "rgba(79, 70, 229, 0.15)",
    stroke: "#4f46e5",
    strokeWidth: 2,
    strokeUniform: true,
    rx: 4,
    ry: 4,
};

/**
 * 绘制插件
 * 功能：在画布上绘制图形（矩形）、管理 DrawRect 对象的可选状态
 * 事件：draw:complete
 */
export class DrawPlugin extends BasePlugin {
    readonly name = "draw";
    override serializable = true;
    override importOrder = 5;

    private isDrawing = false;
    private startX = 0;
    private startY = 0;
    private currentRect: Rect | null = null;

    /** 获取所有 DrawRect 对象 */
    private get drawRectList(): FabricObject[] {
        return this.canvas.getObjects().filter((obj) => {
            return this.editor.metadata.is(obj, "category", Category.DrawRect);
        });
    }

    protected onInstall(): void {
        this.canvas.on("mouse:down", this.onMouseDown);
        this.canvas.on("mouse:move", this.onMouseMove);
        this.canvas.on("mouse:up", this.onMouseUp);
        this.canvas.on("object:added", this.onObjectAdded);
        this.eventBus.on("mode:change", this.onModeChange);
    }

    protected onDestroy(): void {
        this.canvas.off("mouse:down", this.onMouseDown);
        this.canvas.off("mouse:move", this.onMouseMove);
        this.canvas.off("mouse:up", this.onMouseUp);
        this.canvas.off("object:added", this.onObjectAdded);
        this.eventBus.off("mode:change", this.onModeChange);
    }

    // ─── 序列化 ─────────────────────────────────────────

    /** 导出所有 DrawRect 数据 */
    exportData(): object[] {
        return this.drawRectList.map((obj) => obj.toObject([...EXTRA_PROPS]));
    }

    /** 导入 DrawRect 数据 */
    async importData(data: object[]): Promise<void> {
        if (!Array.isArray(data)) return;

        for (const item of data) {
            const rect = await Rect.fromObject(item as TOptions<RectProps>);
            this.canvas.add(rect as unknown as FabricObject);
        }

        const mode = this.getCurrentMode();
        if (mode) this.onModeChange({ mode });
        this.canvas.requestRenderAll();
    }

    /** 清空所有 DrawRect 对象 */
    clearAll(): void {
        this.drawRectList.forEach((obj) => this.canvas.remove(obj));
        this.canvas.requestRenderAll();
    }

    // ─── 私有方法 ─────────────────────────────────────────

    private onModeChange = ({ mode }: { mode: EditorMode }): void => {
        const modeConfig: Record<EditorMode, { selectable: boolean; evented: boolean }> = {
            [EditorMode.Select]: { selectable: true, evented: true },
            [EditorMode.Pan]: { selectable: false, evented: false },
            [EditorMode.DrawRect]: { selectable: false, evented: false },
            [EditorMode.RangeSelect]: { selectable: false, evented: true },
        };

        const config = modeConfig[mode];
        if (!config) throw new Error("[onModeChange] 未知的mode");

        this.drawRectList.forEach((obj) => {
            obj.selectable = config.selectable;
            obj.evented = config.evented;
            obj.setCoords();
        });
    };

    private onObjectAdded = (opt: any): void => {
        const obj = opt.target as FabricObject;
        if (!obj) return;

        const isDrawRect = this.editor.metadata.is(obj, "category", Category.DrawRect);
        if (!isDrawRect) return;

        const mode = this.getCurrentMode();
        const isSelectMode = mode === EditorMode.Select;
        obj.selectable = isSelectMode;
        obj.evented = isSelectMode;
    };

    private getCurrentMode(): EditorMode | null {
        const modePlugin = this.editor.getPlugin<any>("mode");
        return modePlugin?.mode ?? null;
    }

    private onMouseDown = (opt: any): void => {
        const mode = this.getCurrentMode();
        if (mode !== EditorMode.DrawRect) return;

        const pointer = this.canvas.getScenePoint(opt.e);
        this.isDrawing = true;
        this.startX = pointer.x;
        this.startY = pointer.y;

        this.currentRect = new Rect({
            ...RECT_STYLE,
            left: this.startX,
            top: this.startY,
            width: 0,
            height: 0,
            selectable: false,
            evented: false,
        });

        this.canvas.add(this.currentRect);
    };

    private onMouseMove = (opt: any): void => {
        if (!this.isDrawing || !this.currentRect) return;

        const pointer = this.canvas.getScenePoint(opt.e);
        const left = Math.min(this.startX, pointer.x);
        const top = Math.min(this.startY, pointer.y);
        const width = Math.abs(pointer.x - this.startX);
        const height = Math.abs(pointer.y - this.startY);

        this.currentRect.set({ left, top, width, height });
        this.canvas.requestRenderAll();
    };

    private onMouseUp = (): void => {
        if (!this.isDrawing || !this.currentRect) return;

        this.isDrawing = false;

        const width = this.currentRect.width || 0;
        const height = this.currentRect.height || 0;

        if (width < 5 || height < 5) {
            this.canvas.remove(this.currentRect);
            this.currentRect = null;
            return;
        }

        this.currentRect.set({ ...RECT_STYLE, selectable: true, evented: true });
        this.editor.metadata.set(this.currentRect, { category: Category.DrawRect, id: genId("rect") });

        this.canvas.requestRenderAll();
        this.eventBus.emit("draw:complete", this.currentRect);
        this.currentRect = null;
    };
}
