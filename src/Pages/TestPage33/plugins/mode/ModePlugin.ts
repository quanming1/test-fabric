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
 * 功能：管理编辑器的交互模式
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

        // 监听新对象添加，根据当前模式设置可选状态
        this.canvas.on("object:added", this.onObjectAdded);

        // 初始化时应用默认模式设置
        this.applyModeSettings(this._mode);
    }

    /**
     * 新对象添加时，根据当前模式设置可选状态
     */
    private onObjectAdded = (opt: any): void => {
        const obj = opt.target;
        if (!obj) return;

        const selectable = this._mode === EditorMode.Select;
        obj.selectable = selectable;
        obj.evented = selectable;
    };

    /**
     * 设置编辑器模式
     */
    setMode(mode: EditorMode): void {
        if (this._mode === mode) return;

        const prevMode = this._mode;
        this._mode = mode;

        // 根据模式更新画布配置
        this.applyModeSettings(mode);

        this.eventBus.emit("mode:change", { mode, prevMode });
    }

    /**
     * 根据模式应用画布设置
     */
    private applyModeSettings(mode: EditorMode): void {
        switch (mode) {
            case EditorMode.Select:
                // 选择模式：启用选择和框选
                this.canvas.selection = true;
                this.canvas.defaultCursor = "default";
                this.canvas.hoverCursor = "move";
                this.setObjectsSelectable(true);
                break;

            case EditorMode.Pan:
                // 拖拽模式：禁用选择，显示抓手光标
                this.canvas.selection = false;
                this.canvas.defaultCursor = "grab";
                this.canvas.hoverCursor = "grab";
                this.canvas.discardActiveObject();
                this.setObjectsSelectable(false);
                break;

            case EditorMode.DrawRect:
                // 绘制模式：禁用选择
                this.canvas.selection = false;
                this.canvas.defaultCursor = "crosshair";
                this.canvas.hoverCursor = "crosshair";
                this.canvas.discardActiveObject();
                this.setObjectsSelectable(false);
                break;
        }

        this.canvas.requestRenderAll();
    }

    /**
     * 设置所有对象是否可选
     */
    private setObjectsSelectable(selectable: boolean): void {
        this.canvas.getObjects().forEach((obj) => {
            obj.selectable = selectable;
            obj.evented = selectable;
            obj.setCoords(); // 重新计算边界坐标，确保点选生效
        })
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

        // 计算偏移量并更新视口
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
        this.canvas.off("object:added", this.onObjectAdded);
    }
}
