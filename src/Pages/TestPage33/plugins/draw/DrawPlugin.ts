import { Rect, type FabricObject, type RectProps } from "fabric";
import { BasePlugin } from "../base/Plugin";
import { EditorMode } from "../mode/ModePlugin";
import { Category, genId, type HistoryRecord } from "../../core";
import { DrawHistoryHandler } from "./DrawHistoryHandler";

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

/** DrawRect 需要额外序列化的属性 */
const EXTRA_PROPS = ["data"] as const;

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
    private historyHandler!: DrawHistoryHandler;

    /** 获取所有 DrawRect 对象 */
    private get drawRectList(): FabricObject[] {
        return this.canvas.getObjects().filter((obj) => {
            return this.editor.metadata.is(obj, "category", Category.DrawRect);
        });
    }

    protected onInstall(): void {
        this.historyHandler = new DrawHistoryHandler({
            editor: this.editor,
            historyManager: this.editor.history,
            pluginName: this.name,
            getDrawRectList: () => this.drawRectList,
        });

        this.canvas.on("mouse:down", this.onMouseDown);
        this.canvas.on("mouse:move", this.onMouseMove);
        this.canvas.on("mouse:up", this.onMouseUp);
        this.canvas.on("object:added", this.onObjectAdded);
        this.canvas.on("object:modified", this.onObjectModified);
        this.eventBus.on("mode:change", this.onModeChange);
        this.eventBus.on("object:dragStart", this.onDragStart);
    }

    protected onDestroy(): void {
        this.canvas.off("mouse:down", this.onMouseDown);
        this.canvas.off("mouse:move", this.onMouseMove);
        this.canvas.off("mouse:up", this.onMouseUp);
        this.canvas.off("object:added", this.onObjectAdded);
        this.canvas.off("object:modified", this.onObjectModified);
        this.eventBus.off("mode:change", this.onModeChange);
        this.eventBus.off("object:dragStart", this.onDragStart);
    }

    // ─── 历史记录事件 ─────────────────────────────────────────

    private onDragStart = (objects: FabricObject[]): void => {
        this.historyHandler.onDragStart(objects);
    };

    private onObjectModified = (opt: any): void => {
        const target = opt.target as FabricObject;
        if (!target) return;

        const objects = target.type === "activeselection"
            ? (target as any).getObjects() as FabricObject[]
            : [target];

        this.historyHandler.onObjectModified(objects);
    };

    applyUndo(record: HistoryRecord): void {
        this.historyHandler.applyUndo(record);
    }

    applyRedo(record: HistoryRecord): void {
        this.historyHandler.applyRedo(record);
    }

    recordDelete(objects: FabricObject[]): void {
        const rects = objects.filter((obj) =>
            this.editor.metadata.is(obj, "category", Category.DrawRect)
        );
        if (rects.length === 0) return;

        const objectIds: string[] = [];
        const beforeSnapshots = [];

        for (const obj of rects) {
            const id = this.editor.metadata.get(obj)?.id;
            if (id) {
                objectIds.push(id);
                beforeSnapshots.push(this.historyHandler.createSnapshot(obj, true));
            }
        }

        if (objectIds.length > 0) {
            this.historyHandler.recordRemove(objectIds, beforeSnapshots);
        }
    }

    // ─── 序列化 ─────────────────────────────────────────

    exportData(): object[] {
        return this.drawRectList.map((obj) => obj.toObject([...EXTRA_PROPS]));
    }

    async importData(data: object[]): Promise<void> {
        if (!Array.isArray(data)) return;

        for (const item of data) {
            const rect = await Rect.fromObject(item as any);
            this.canvas.add(rect as unknown as FabricObject);
        }

        const mode = this.getCurrentMode();
        if (mode) this.onModeChange({ mode });
        this.canvas.requestRenderAll();
    }

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
        const id = genId("rect");
        this.editor.metadata.set(this.currentRect, { category: Category.DrawRect, id });

        // 记录添加操作
        const snapshot = this.historyHandler.createSnapshot(this.currentRect);
        this.historyHandler.recordAdd([id], [snapshot]);

        this.canvas.requestRenderAll();
        this.eventBus.emit("draw:complete", this.currentRect);
        this.currentRect = null;
    };
}
