import { BasePlugin } from "../base/Plugin";

/**
 * 编辑器模式枚举
 */
export enum EditorMode {
    /** 选择模式：可选择、框选、移动对象 */
    Select = "select",
    /** 拖拽模式：拖拽画布平移 */
    Pan = "pan",
    /** 绘制矩形模式 */
    DrawRect = "draw-rect",
}

/**
 * 模式管理插件
 * 职责：管理模式状态、派发事件、处理通用画布设置
 * 事件：mode:change
 */
export class ModePlugin extends BasePlugin {
    readonly name = "mode";

    private _mode: EditorMode = EditorMode.Select;
    private isPanning = false;
    private lastPosX = 0;
    private lastPosY = 0;

    get mode(): EditorMode {
        return this._mode;
    }

    protected onInstall(): void {
        // 绑定拖拽相关事件
        this.canvas.on("mouse:down", this.onMouseDown);
        this.canvas.on("mouse:move", this.onMouseMove);
        this.canvas.on("mouse:up", this.onMouseUp);

        // 初始化时应用默认模式设置
        this.applyModeSettingsIntoCanvas(this._mode);
    }

    /**
     * 设置编辑器模式
     */
    setMode(mode: EditorMode): void {
        if (this._mode === mode) return;

        const prevMode = this._mode;
        this._mode = mode;

        // 应用通用画布设置
        this.applyModeSettingsIntoCanvas(mode);

        // 派发事件，让各 Plugin 自行处理
        this.eventBus.emit("mode:change", { mode, prevMode });
    }

    /**
     * 通用画布设置（光标、框选、取消选择等）
     */
    private applyModeSettingsIntoCanvas(mode: EditorMode): void {
        switch (mode) {
            case EditorMode.Select:
                this.canvas.selection = true;
                this.canvas.defaultCursor = "default";
                this.canvas.hoverCursor = "move";
                break;

            case EditorMode.Pan:
                this.canvas.selection = false;
                this.canvas.defaultCursor = "grab";
                this.canvas.hoverCursor = "grab";
                this.canvas.discardActiveObject();
                break;

            case EditorMode.DrawRect:
                this.canvas.selection = false;
                this.canvas.defaultCursor = "crosshair";
                this.canvas.hoverCursor = "crosshair";
                this.canvas.discardActiveObject();
                break;
        }

        this.canvas.requestRenderAll();
    }

    // ============ 拖拽画布逻辑 ============
    private onMouseDown = (opt: any): void => {
        if (this._mode !== EditorMode.Pan) return;

        const e = opt.e as MouseEvent;
        this.isPanning = true;
        this.lastPosX = e.clientX;
        this.lastPosY = e.clientY;
        this.canvas.defaultCursor = "grabbing";
    };

    private onMouseMove = (opt: any): void => {
        if (!this.isPanning || this._mode !== EditorMode.Pan) return;

        const e = opt.e as MouseEvent;
        const vpt = this.canvas.viewportTransform;
        if (!vpt) return;

        vpt[4] += e.clientX - this.lastPosX;
        vpt[5] += e.clientY - this.lastPosY;

        this.lastPosX = e.clientX;
        this.lastPosY = e.clientY;

        this.canvas.requestRenderAll();
    };

    private onMouseUp = (): void => {
        if (this._mode !== EditorMode.Pan) return;

        this.isPanning = false;
        this.canvas.defaultCursor = "grab";
    };

    protected onDestroy(): void {
        this.canvas.off("mouse:down", this.onMouseDown);
        this.canvas.off("mouse:move", this.onMouseMove);
        this.canvas.off("mouse:up", this.onMouseUp);
    }
}
