import { Rect, type FabricObject } from "fabric";
import { BasePlugin } from "../base/Plugin";
import { EditorMode } from "../mode/ModePlugin";
import { Category, genId } from "../../core";

/**
 * 绘制插件
 * 功能：在画布上绘制图形（矩形）、管理 DrawRect 对象的可选状态
 * 事件：draw:complete
 */
export class DrawPlugin extends BasePlugin {
    readonly name = "draw";

    private isDrawing = false;
    private startX = 0;
    private startY = 0;
    private currentRect: Rect | null = null;

    /**
     * 获取所有 DrawRect 对象
     */
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

        // 监听模式变化，更新 DrawRect 对象的可选状态
        this.eventBus.on("mode:change", this.onModeChange);
    }
    /**
     * 模式变化时更新 DrawRect 对象的可选状态
     */
    private onModeChange = ({ mode }: { mode: EditorMode }): void => {
        const selectable = mode === EditorMode.Select;
        this.setDrawRectsSelectable(selectable);
    };

    /**
     * 新对象添加时设置可选状态（只处理 DrawRect）
     */
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

    /**
     * 设置所有 DrawRect 对象的可选状态
     */
    private setDrawRectsSelectable(selectable: boolean): void {
        this.drawRectList.forEach((obj) => {
            obj.selectable = selectable;
            obj.evented = selectable;
            obj.setCoords();
        });
    }
    /**
     * 获取当前模式
     */
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

        // 创建临时矩形（设置 origin 为左上角）
        this.currentRect = new Rect({
            left: this.startX,
            top: this.startY,
            width: 0,
            height: 0,
            originX: "left",
            originY: "top",
            fill: "rgba(79, 70, 229, 0.15)",
            stroke: "#4f46e5",
            strokeWidth: 2,
            strokeUniform: true, // 缩放时边框宽度不变
            rx: 4,
            ry: 4,
            selectable: false,
            evented: false,
        });

        this.canvas.add(this.currentRect);
    };

    private onMouseMove = (opt: any): void => {
        if (!this.isDrawing || !this.currentRect) return;

        const pointer = this.canvas.getScenePoint(opt.e);

        // 计算矩形尺寸（支持反向绘制）
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

        // 如果绘制的矩形太小，删除它
        if (width < 5 || height < 5) {
            this.canvas.remove(this.currentRect);
            this.currentRect = null;
            return;
        }

        // 完成绘制，设置最终样式
        this.currentRect.set({
            fill: "rgba(79, 70, 229, 0.15)",
            stroke: "#4f46e5",
            strokeWidth: 2,
            strokeUniform: true, // 缩放时边框宽度不变
            selectable: true,
            evented: true,
            originX: "left",
            originY: "top",
            rx: 4,
            ry: 4,
        });

        // 给对象打元数据标记，包含唯一ID
        this.editor.metadata.set(this.currentRect, {
            category: Category.DrawRect,
            id: genId("rect"),
        });

        this.canvas.requestRenderAll();
        this.eventBus.emit("draw:complete", this.currentRect);
        this.currentRect = null;
    };

    protected onDestroy(): void {
        this.canvas.off("mouse:down", this.onMouseDown);
        this.canvas.off("mouse:move", this.onMouseMove);
        this.canvas.off("mouse:up", this.onMouseUp);
        this.canvas.off("object:added", this.onObjectAdded);
        this.eventBus.off("mode:change", this.onModeChange);
    }
}
