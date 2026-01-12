import type { FabricObject, Transform, TEvent, TPointerEvent, BasicTransformEvent } from "fabric";
import { BasePlugin } from "../base/Plugin";
import { Category } from "../../core";
import { EditorMode } from "../mode/ModePlugin";
import type { GuidelinesPluginOptions, GuidelinesStyle } from "./types";
import { GuidelineRenderer } from "./renderer";
import { MoveHandler, ScaleHandler, type HandlerContext } from "./handlers";

const DEFAULT_STYLE: GuidelinesStyle = {
    color: "#ff00ff",
    lineWidth: 1,
    snapThreshold: 5,
};

/**
 * 辅助线插件
 * 功能：
 * - 拖动对象时显示对齐辅助线
 * - 自动吸附到其他对象的边缘和中心
 * - 辅助线粗细与画布缩放无关
 * - 防止多条辅助线同时匹配导致的抖动
 */
export class GuidelinesPlugin extends BasePlugin {
    readonly name = "guidelines";

    private style: GuidelinesStyle;
    private enabled: boolean;
    private allowedCategories: Category[];
    private canvasSnap: boolean;

    private renderer!: GuidelineRenderer;
    private moveHandler!: MoveHandler;
    private scaleHandler!: ScaleHandler;

    private isMoving = false;
    private isScaling = false;
    private currentTransform: Transform | null = null;

    constructor(options?: GuidelinesPluginOptions) {
        super();
        this.style = { ...DEFAULT_STYLE, ...options?.style };
        this.enabled = options?.enabled ?? true;
        this.allowedCategories = options?.allowedCategories ?? [];
        this.canvasSnap = options?.canvasSnap ?? true;
    }

    protected onInstall(): void {
        this.renderer = new GuidelineRenderer(this.canvas, this.editor.metadata, this.style);

        const ctx: HandlerContext = {
            canvas: this.canvas,
            metadata: this.editor.metadata,
            style: this.style,
            allowedCategories: this.allowedCategories,
            canvasSnap: this.canvasSnap,
        };

        this.moveHandler = new MoveHandler(ctx);
        this.scaleHandler = new ScaleHandler(ctx);

        this.bindEvents();
    }

    private bindEvents(): void {
        this.canvas.on("object:moving", this.onObjectMoving);
        this.canvas.on("object:scaling", this.onObjectScaling);
        this.canvas.on("object:modified", this.onObjectModified);
        this.canvas.on("before:transform", this.onBeforeTransform);
        this.eventBus.on("zoom:change", this.onZoomChange);
        this.eventBus.on("mode:change", this.onModeChange);
    }

    /** 启用/禁用辅助线 */
    setEnabled(enabled: boolean): void {
        this.enabled = enabled;
        if (!enabled) {
            this.renderer.clear();
        }
    }

    /** 设置样式 */
    setStyle(style: Partial<GuidelinesStyle>): void {
        this.style = { ...this.style, ...style };
        this.renderer.setStyle(style);
    }

    private onBeforeTransform = (opt: TEvent<TPointerEvent> & { transform: Transform }): void => {
        const action = opt.transform?.action;
        this.currentTransform = opt.transform;

        if (action === "drag") {
            this.isMoving = true;
            this.moveHandler.reset();
        } else if (action === "scale" || action === "scaleX" || action === "scaleY") {
            this.isScaling = true;
            this.scaleHandler.reset();
        }
    };

    private onObjectMoving = (opt: BasicTransformEvent<TPointerEvent> & { target: FabricObject }): void => {
        if (!this.enabled || !this.isMoving) return;

        const target = opt.target;
        if (!target) return;

        const result = this.moveHandler.calculateSnap(target);

        if (result.snapped) {
            this.moveHandler.applySnap(target, result);
        }

        this.renderer.render(result.guidelines);
    };

    private onObjectScaling = (opt: BasicTransformEvent<TPointerEvent> & { target: FabricObject }): void => {
        if (!this.enabled || !this.isScaling || !this.currentTransform) return;

        const target = opt.target;
        if (!target) return;

        const result = this.scaleHandler.calculateSnap(target, this.currentTransform);

        if (result.snapped) {
            this.scaleHandler.applySnap(target, result, this.currentTransform);
        }

        this.renderer.render(result.guidelines);
    };

    private onObjectModified = (): void => {
        this.isMoving = false;
        this.isScaling = false;
        this.currentTransform = null;
        this.moveHandler.reset();
        this.scaleHandler.reset();
        this.renderer.clear();
    };

    private onZoomChange = (): void => {
        this.renderer.updateWidth();
    };

    private onModeChange = ({ mode }: { mode: EditorMode }): void => {
        this.enabled = mode === EditorMode.Select;
        if (!this.enabled) {
            this.renderer.clear();
        }
    };

    protected onDestroy(): void {
        this.canvas.off("object:moving", this.onObjectMoving);
        this.canvas.off("object:scaling", this.onObjectScaling);
        this.canvas.off("object:modified", this.onObjectModified);
        this.canvas.off("before:transform", this.onBeforeTransform);
        this.eventBus.off("zoom:change", this.onZoomChange);
        this.eventBus.off("mode:change", this.onModeChange);
        this.renderer.destroy();
    }
}
