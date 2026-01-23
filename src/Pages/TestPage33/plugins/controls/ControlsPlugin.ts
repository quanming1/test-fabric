import { controlsUtils, type FabricObject, type Transform, type TPointerEvent, ActiveSelection } from "fabric";
import { BasePlugin } from "../base/Plugin";
import { Category } from "../../core";

/**
 * 强制等比缩放的 actionHandler
 * 无论是否按 Shift 都保持等比缩放
 */
function scalingEquallyForced(
    eventData: TPointerEvent,
    transform: Transform,
    x: number,
    y: number
): boolean {
    // 强制覆盖 shiftKey 为 false，确保始终等比缩放
    const fakeEvent = { ...eventData, shiftKey: false } as TPointerEvent;
    return controlsUtils.scalingEqually(fakeEvent, transform, x, y);
}

/** 需要应用控制手柄配置的对象分类 */
const DEFAULT_ALLOWED_CATEGORIES: Category[] = [
    Category.Image,
];

/**
 * 控制手柄样式配置
 */
export interface ControlsStyle {
    /** 手柄颜色 */
    cornerColor?: string;
    /** 手柄激活颜色 */
    cornerStrokeColor?: string;
    /** 手柄大小 */
    cornerSize?: number;
    /** 手柄形状: 'rect' | 'circle' */
    cornerStyle?: "rect" | "circle";
    /** 是否透明 */
    transparentCorners?: boolean;
    /** 边框颜色 */
    borderColor?: string;
    /** 边框粗细 */
    borderScaleFactor?: number;
    /** 边框虚线样式 */
    borderDashArray?: number[];
}

/**
 * 控制手柄插件配置
 */
export interface ControlsPluginOptions {
    /** 样式配置 */
    style?: ControlsStyle;
    /** 是否锁定宽高比（禁止自由变换） */
    lockAspectRatio?: boolean;
    /** 允许应用配置的对象分类，默认只有 Image */
    allowedCategories?: Category[];
}

const DEFAULT_STYLE: ControlsStyle = {
    cornerColor: "#ffffff",           // 手柄填充色：白色
    cornerStrokeColor: "#7171EE",     // 手柄边框色
    cornerSize: 10,                   // 10x10
    cornerStyle: "rect",              // 矩形
    transparentCorners: false,        // 不透明（显示填充色）
    borderColor: "#7171EE",           // 选中边框颜色
    borderScaleFactor: 1,
};

/**
 * 控制手柄插件
 * 
 * 职责：
 * - 统一管理所有对象的控制手柄 UI
 * - 只保留四个角的缩放手柄
 * - 强制锁定宽高比，禁止自由变换
 */
export class ControlsPlugin extends BasePlugin {
    readonly name = "controls";

    private style: ControlsStyle;
    private lockAspectRatio: boolean;
    private allowedCategories: Category[];

    constructor(options?: ControlsPluginOptions) {
        super();
        this.style = { ...DEFAULT_STYLE, ...options?.style };
        this.lockAspectRatio = options?.lockAspectRatio ?? true;
        this.allowedCategories = options?.allowedCategories ?? DEFAULT_ALLOWED_CATEGORIES;
    }

    protected onInstall(): void {
        // 修改 ActiveSelection 原型的 controls 光标样式
        this.patchActiveSelectionControls();

        // 监听对象添加事件，为新对象应用控制手柄配置
        this.canvas.on("object:added", this.onObjectAdded);
        // 监听选择事件，为 ActiveSelection 应用控制手柄配置
        this.canvas.on("selection:created", this.onSelectionChange);
        this.canvas.on("selection:updated", this.onSelectionChange);

        // 为已存在的对象应用配置
        this.applyToAllObjects();
    }

    /**
     * 修补 ActiveSelection 原型的控制手柄光标样式
     * 
     * 原因：Fabric.js 的 ActiveSelection（多选）使用原型链共享 controls 对象，
     * 默认的角落光标是水平/垂直方向的 resize，需要改为斜向 resize 以匹配实际缩放方向。
     * 直接修改原型可确保所有多选实例都使用正确的光标样式。
     */
    private patchActiveSelectionControls(): void {
        const proto = ActiveSelection.prototype;
        if (proto.controls) {
            // tl(左上) 和 br(右下) 使用 ↘↖ 方向光标
            proto.controls.tl.cursorStyle = "nwse-resize";
            proto.controls.br.cursorStyle = "nwse-resize";
            // tr(右上) 和 bl(左下) 使用 ↙↗ 方向光标
            proto.controls.tr.cursorStyle = "nesw-resize";
            proto.controls.bl.cursorStyle = "nesw-resize";
        }
    }

    /**
     * 对象添加到画布时应用控制手柄配置
     */
    private onObjectAdded = (opt: { target: FabricObject }): void => {
        const obj = opt.target;
        if (!obj) return;

        this.applyControlsToObject(obj);
    };

    /**
     * 选择变化时为 ActiveSelection 应用控制手柄配置
     */
    private onSelectionChange = (): void => {
        const activeObject = this.canvas.getActiveObject();
        if (activeObject instanceof ActiveSelection) {
            this.applyControlsStyle(activeObject);
        }
    };

    /**
     * 为对象应用控制手柄样式和行为（公共方法）
     */
    private applyControlsStyle(obj: FabricObject): void {
        obj.set({
            cornerColor: this.style.cornerColor,
            cornerStrokeColor: this.style.cornerStrokeColor,
            cornerSize: this.style.cornerSize,
            cornerStyle: this.style.cornerStyle,
            transparentCorners: this.style.transparentCorners,
            borderColor: this.style.borderColor,
            borderScaleFactor: this.style.borderScaleFactor,
            borderDashArray: this.style.borderDashArray,
            lockScalingFlip: true,
        });

        obj.setControlsVisibility({
            tl: true, tr: true, bl: true, br: true,
            mt: false, mb: false, ml: false, mr: false, mtr: false,
        });

        // 设置四个角的光标样式为斜向 resize（与缩放方向一致）
        // tl(左上) 和 br(右下) 使用 ↘↖ 方向，tr(右上) 和 bl(左下) 使用 ↙↗ 方向
        obj.controls.tl.cursorStyle = "nwse-resize";
        obj.controls.br.cursorStyle = "nwse-resize";
        obj.controls.tr.cursorStyle = "nesw-resize";
        obj.controls.bl.cursorStyle = "nesw-resize";

        if (this.lockAspectRatio) {
            obj.controls.tl.actionHandler = scalingEquallyForced;
            obj.controls.tr.actionHandler = scalingEquallyForced;
            obj.controls.bl.actionHandler = scalingEquallyForced;
            obj.controls.br.actionHandler = scalingEquallyForced;
        }
    }

    /**
     * 为单个对象应用控制手柄配置（检查分类）
     */
    private applyControlsToObject(obj: FabricObject): void {
        const isAllowed = this.allowedCategories.some(
            (cat) => this.editor.metadata.is(obj, "category", cat)
        );
        if (isAllowed) this.applyControlsStyle(obj);
    }

    /**
     * 为画布上所有对象应用控制手柄配置
     */
    private applyToAllObjects(): void {
        const objects = this.canvas.getObjects();
        for (const obj of objects) {
            this.applyControlsToObject(obj);
        }
        this.canvas.requestRenderAll();
    }

    // ─── 公开 API ─────────────────────────────────────────

    /**
     * 更新控制手柄样式
     */
    setStyle(style: Partial<ControlsStyle>): void {
        this.style = { ...this.style, ...style };
        this.applyToAllObjects();
    }

    /**
     * 设置是否锁定宽高比
     */
    setLockAspectRatio(lock: boolean): void {
        this.lockAspectRatio = lock;

        // 更新所有对象
        const objects = this.canvas.getObjects();
        for (const obj of objects) {
            const isAllowed = this.allowedCategories.some(
                (cat) => this.editor.metadata.is(obj, "category", cat)
            );
            if (!isAllowed) continue;

            // 更新四个角的 actionHandler
            const handler = lock ? scalingEquallyForced : controlsUtils.scalingEqually;
            obj.controls.tl.actionHandler = handler;
            obj.controls.tr.actionHandler = handler;
            obj.controls.bl.actionHandler = handler;
            obj.controls.br.actionHandler = handler;
        }
        this.canvas.requestRenderAll();
    }

    /**
     * 获取当前样式配置
     */
    getStyle(): ControlsStyle {
        return { ...this.style };
    }

    /**
     * 获取是否锁定宽高比
     */
    isLockAspectRatio(): boolean {
        return this.lockAspectRatio;
    }

    protected onDestroy(): void {
        this.canvas.off("object:added", this.onObjectAdded);
        this.canvas.off("selection:created", this.onSelectionChange);
        this.canvas.off("selection:updated", this.onSelectionChange);
    }
}
