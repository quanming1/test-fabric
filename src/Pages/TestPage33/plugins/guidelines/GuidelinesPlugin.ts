import type { FabricObject } from "fabric";
import { BasePlugin } from "../base/Plugin";
import { Category } from "../../core";
import { EditorMode } from "../mode/ModePlugin";
import type { GuidelinesPluginOptions, GuidelinesStyle } from "./types";
import { GuidelineRenderer } from "./renderer";
import { MoveHandler, type HandlerContext } from "./handlers";

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

    private isMoving = false;

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

        this.bindEvents();
    }

    private bindEvents(): void {
        this.canvas.on("object:moving", this.onObjectMoving);
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

    private onBeforeTransform = (opt: any): void => {
        const action = opt.transform?.action;

        if (action === "drag") {
            this.isMoving = true;
            this.moveHandler.reset();
        }
    };

    private onObjectMoving = (opt: any): void => {
        if (!this.enabled || !this.isMoving) return;

        const target = opt.target as FabricObject;
        if (!target) return;

        const result = this.moveHandler.calculateSnap(target);

        if (result.snapped) {
            this.moveHandler.applySnap(target, result);
        }

        this.renderer.render(result.guidelines);
    };

    private onObjectModified = (): void => {
        this.isMoving = false;
        this.moveHandler.reset();
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
        this.canvas.off("object:modified", this.onObjectModified);
        this.canvas.off("before:transform", this.onBeforeTransform);
        this.eventBus.off("zoom:change", this.onZoomChange);
        this.eventBus.off("mode:change", this.onModeChange);
        this.renderer.destroy();
    }
}
