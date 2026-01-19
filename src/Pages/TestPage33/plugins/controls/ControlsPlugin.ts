import { controlsUtils, type FabricObject, type Transform, type TPointerEvent } from "fabric";
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
        // 监听对象添加事件，为新对象应用控制手柄配置
        this.canvas.on("object:added", this.onObjectAdded);

        // 为已存在的对象应用配置
        this.applyToAllObjects();
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
     * 为单个对象应用控制手柄配置
     */
    private applyControlsToObject(obj: FabricObject): void {
        // 只为允许的分类应用配置
        const isAllowed = this.allowedCategories.some(
            (cat) => this.editor.metadata.is(obj, "category", cat)
        );
        if (!isAllowed) return;

        // 应用样式
        obj.set({
            cornerColor: this.style.cornerColor,
            cornerStrokeColor: this.style.cornerStrokeColor,
            cornerSize: this.style.cornerSize,
            cornerStyle: this.style.cornerStyle,
            transparentCorners: this.style.transparentCorners,
            borderColor: this.style.borderColor,
            borderScaleFactor: this.style.borderScaleFactor,
            borderDashArray: this.style.borderDashArray,
            // 禁止缩放时翻转图片（拖过对边时不镜像）
            lockScalingFlip: true,
        });

        // 只显示四个角的手柄，隐藏其他
        obj.setControlsVisibility({
            tl: true,
            tr: true,
            bl: true,
            br: true,
            mt: false,
            mb: false,
            ml: false,
            mr: false,
            mtr: false,
        });

        // 强制等比缩放：修改四个角的 actionHandler
        if (this.lockAspectRatio) {
            obj.controls.tl.actionHandler = scalingEquallyForced;
            obj.controls.tr.actionHandler = scalingEquallyForced;
            obj.controls.bl.actionHandler = scalingEquallyForced;
            obj.controls.br.actionHandler = scalingEquallyForced;
        }
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
    }
}
