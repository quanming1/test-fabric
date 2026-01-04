import type { FabricObject } from "fabric";
import { BasePlugin } from "../base/Plugin";
import { Category } from "../../core";
import { EditorMode } from "../mode/ModePlugin";
import type {
    Guideline,
    GuidelinesPluginOptions,
    GuidelinesStyle,
    SnapResult,
} from "./types";
import { BoundsCalculator, SnapDetector } from "./utils";
import { GuidelineRenderer } from "./renderer";

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
    private isMoving = false;
    private lastSnapX: number | null = null;
    private lastSnapY: number | null = null;

    constructor(options?: GuidelinesPluginOptions) {
        super();
        this.style = { ...DEFAULT_STYLE, ...options?.style };
        this.enabled = options?.enabled ?? true;
        this.allowedCategories = options?.allowedCategories ?? [];
        this.canvasSnap = options?.canvasSnap ?? true;
    }

    protected onInstall(): void {
        this.renderer = new GuidelineRenderer(this.canvas, this.editor.metadata, this.style);

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
        if (opt.transform?.action === "drag") {
            this.isMoving = true;
            this.lastSnapX = null;
            this.lastSnapY = null;
        }
    };

    private onObjectMoving = (opt: any): void => {
        if (!this.enabled || !this.isMoving) return;

        const target = opt.target as FabricObject;
        if (!target) return;

        const snapResult = this.calculateSnap(target);

        if (snapResult.snapped) {
            this.applySnapWithAntiJitter(target, snapResult);
        }

        this.renderer.render(snapResult.guidelines);
    };

    private onObjectModified = (): void => {
        this.isMoving = false;
        this.lastSnapX = null;
        this.lastSnapY = null;
        this.renderer.clear();
    };

    private onZoomChange = (): void => {
        this.renderer.updateWidth();
    };

    private onModeChange = ({ mode }: { mode: EditorMode }): void => {
        // 只在 Select 模式下启用辅助线
        this.enabled = mode === EditorMode.Select;
        if (!this.enabled) {
            this.renderer.clear();
        }
    };

    /**
     * 计算吸附结果
     */
    private calculateSnap(target: FabricObject): SnapResult {
        const targetBounds = BoundsCalculator.getBounds(target);
        const otherObjects = this.getOtherObjects(target);
        const threshold = this.style.snapThreshold / this.canvas.getZoom();

        const guidelines: Guideline[] = [];
        let deltaX = 0;
        let deltaY = 0;
        let snappedX = false;
        let snappedY = false;
        let minDistX = threshold;
        let minDistY = threshold;

        // 画布对齐检测
        if (this.canvasSnap) {
            const canvasBounds = this.getCanvasBounds();

            const xSnaps = SnapDetector.checkHorizontal(targetBounds, canvasBounds, threshold);
            for (const snap of xSnaps) {
                if (Math.abs(snap.delta) < minDistX) {
                    minDistX = Math.abs(snap.delta);
                    deltaX = snap.delta;
                    snappedX = true;
                    this.replaceGuideline(guidelines, "vertical", snap.position, "__canvas__");
                }
            }

            const ySnaps = SnapDetector.checkVertical(targetBounds, canvasBounds, threshold);
            for (const snap of ySnaps) {
                if (Math.abs(snap.delta) < minDistY) {
                    minDistY = Math.abs(snap.delta);
                    deltaY = snap.delta;
                    snappedY = true;
                    this.replaceGuideline(guidelines, "horizontal", snap.position, "__canvas__");
                }
            }
        }

        // 其他对象对齐检测
        for (const obj of otherObjects) {
            const objBounds = BoundsCalculator.getBounds(obj);
            const objId = this.editor.metadata.get(obj)?.id ?? "";

            // 水平方向吸附检测
            const xSnaps = SnapDetector.checkHorizontal(targetBounds, objBounds, threshold);
            for (const snap of xSnaps) {
                if (Math.abs(snap.delta) < minDistX) {
                    minDistX = Math.abs(snap.delta);
                    deltaX = snap.delta;
                    snappedX = true;
                    this.replaceGuideline(guidelines, "vertical", snap.position, objId);
                }
            }

            // 垂直方向吸附检测
            const ySnaps = SnapDetector.checkVertical(targetBounds, objBounds, threshold);
            for (const snap of ySnaps) {
                if (Math.abs(snap.delta) < minDistY) {
                    minDistY = Math.abs(snap.delta);
                    deltaY = snap.delta;
                    snappedY = true;
                    this.replaceGuideline(guidelines, "horizontal", snap.position, objId);
                }
            }
        }

        return { snapped: snappedX || snappedY, deltaX, deltaY, guidelines };
    }

    /**
     * 获取画布边界（场景坐标）
     */
    private getCanvasBounds(): import("./types").ObjectBounds {
        const width = this.canvas.width ?? 800;
        const height = this.canvas.height ?? 600;
        const vpt = this.canvas.viewportTransform;
        const zoom = vpt ? vpt[0] : 1;
        const offsetX = vpt ? vpt[4] : 0;
        const offsetY = vpt ? vpt[5] : 0;

        // 画布在场景坐标中的位置
        const left = -offsetX / zoom;
        const top = -offsetY / zoom;
        const right = (width - offsetX) / zoom;
        const bottom = (height - offsetY) / zoom;

        return {
            left,
            right,
            top,
            bottom,
            centerX: (left + right) / 2,
            centerY: (top + bottom) / 2,
        };
    }

    /**
     * 替换指定类型的辅助线
     */
    private replaceGuideline(
        guidelines: Guideline[],
        type: "vertical" | "horizontal",
        position: number,
        sourceId: string
    ): void {
        const filtered = guidelines.filter((g) => g.type !== type);
        guidelines.length = 0;
        guidelines.push(...filtered, { type, position, sourceId });
    }

    /**
     * 应用吸附并防止抖动
     */
    private applySnapWithAntiJitter(target: FabricObject, result: SnapResult): void {
        const jitterThreshold = 2 / this.canvas.getZoom();

        if (result.deltaX !== 0) {
            const newX = (target.left ?? 0) + result.deltaX;
            if (this.lastSnapX !== null && Math.abs(newX - this.lastSnapX) < jitterThreshold) {
                target.set("left", this.lastSnapX);
            } else {
                target.set("left", newX);
                this.lastSnapX = newX;
            }
        }

        if (result.deltaY !== 0) {
            const newY = (target.top ?? 0) + result.deltaY;
            if (this.lastSnapY !== null && Math.abs(newY - this.lastSnapY) < jitterThreshold) {
                target.set("top", this.lastSnapY);
            } else {
                target.set("top", newY);
                this.lastSnapY = newY;
            }
        }

        target.setCoords();
    }

    /**
     * 获取除目标外的其他对象
     */
    private getOtherObjects(target: FabricObject): FabricObject[] {
        return this.canvas.getObjects().filter((obj) => {
            if (obj === target) return false;
            // 排除辅助线
            if (this.editor.metadata.is(obj, "category", Category.Guideline)) return false;
            if (!obj.visible) return false;
            // 只保留允许的类型
            const category = this.editor.metadata.getField(obj, "category");
            if (!category || !this.allowedCategories.includes(category)) return false;
            return true;
        });
    }

    protected onDestroy(): void {
        this.canvas.off("object:moving", this.onObjectMoving);
        this.canvas.off("object:modified", this.onObjectModified);
        this.canvas.off("before:transform", this.onBeforeTransform);
        this.eventBus.off("zoom:change", this.onZoomChange);
        this.eventBus.off("mode:change", this.onModeChange);
        this.renderer.destroy();
    }
}
