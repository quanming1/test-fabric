import type { Canvas, FabricObject } from "fabric";
import type { Guideline, GuidelinesStyle, ObjectBounds, SnapResult } from "../types";
import type { ObjectMetadata } from "../../../core";
import { BoundsCalculator } from "../utils";
import { Category } from "../../../core";
import { ActiveSelection } from "fabric";

/** Handler 运行时上下文 */
export interface HandlerContext {
    canvas: Canvas;
    metadata: ObjectMetadata;
    style: GuidelinesStyle;
    allowedCategories: Category[]; // 允许参与对齐的元素类型
    canvasSnap: boolean;           // 是否启用画布对齐
}

/**
 * 吸附处理器基类
 *
 * 职责：
 * - 提供通用的吸附计算辅助方法
 * - 管理防抖状态（lastSnapX/Y）
 * - 收集参照物边界信息
 */
export abstract class BaseHandler {
    protected ctx: HandlerContext;
    protected lastSnapX: number | null = null; // 上次X方向吸附位置，用于防抖
    protected lastSnapY: number | null = null; // 上次Y方向吸附位置，用于防抖

    constructor(ctx: HandlerContext) {
        this.ctx = ctx;
    }

    /** 重置防抖状态，在开始新的拖动/缩放操作时调用 */
    reset(): void {
        this.lastSnapX = null;
        this.lastSnapY = null;
    }

    /** 计算吸附结果，由子类实现 */
    abstract calculateSnap(target: FabricObject, ...args: any[]): SnapResult;

    /** 应用吸附结果到目标对象，由子类实现 */
    abstract applySnap(target: FabricObject, result: SnapResult, ...args: any[]): void;

    /**
     * 获取吸附阈值（场景坐标）
     * 阈值会根据画布缩放自动调整，确保在任意缩放级别下体验一致
     */
    protected getThreshold(): number {
        return this.ctx.style.snapThreshold / this.ctx.canvas.getZoom();
    }

    /**
     * 获取防抖阈值（场景坐标）
     * 当新吸附位置与上次位置差距小于此值时，保持上次位置，防止抖动
     */
    protected getJitterThreshold(): number {
        return 2 / this.ctx.canvas.getZoom();
    }

    /**
     * 获取画布可视区域在场景坐标系中的边界
     * 用于实现"对齐到画布边缘/中心"功能
     */
    protected getCanvasBounds(): ObjectBounds {
        const { canvas } = this.ctx;
        const width = canvas.width ?? 800;
        const height = canvas.height ?? 600;
        const vpt = canvas.viewportTransform;
        const zoom = vpt ? vpt[0] : 1;      // 缩放比例
        const offsetX = vpt ? vpt[4] : 0;   // 视口X偏移
        const offsetY = vpt ? vpt[5] : 0;   // 视口Y偏移

        // 将屏幕坐标转换为场景坐标
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
     * 获取可作为参照物的其他对象
     * 排除：目标自身、多选中的子对象、辅助线、不可见对象、不在允许类型中的对象
     */
    protected getOtherObjects(target: FabricObject): FabricObject[] {
        const selectedObjects = this.getSelectedObjects(target);

        return this.ctx.canvas.getObjects().filter((obj) => {
            if (obj === target) return false;                                    // 排除自身
            if (selectedObjects.has(obj)) return false;                          // 排除多选中的子对象
            if (this.ctx.metadata.is(obj, "category", Category.Guideline)) return false; // 排除辅助线
            if (!obj.visible) return false;                                      // 排除不可见对象
            const category = this.ctx.metadata.getField(obj, "category");
            if (!category || !this.ctx.allowedCategories.includes(category)) return false; // 排除不允许的类型
            return true;
        });
    }

    /**
     * 获取当前选中的所有对象
     * 如果是多选（ActiveSelection），返回其包含的所有子对象
     */
    private getSelectedObjects(target: FabricObject): Set<FabricObject> {
        const selected = new Set<FabricObject>();
        selected.add(target);

        if (target instanceof ActiveSelection) {
            for (const obj of target.getObjects()) {
                selected.add(obj);
            }
        }

        return selected;
    }

    /**
     * 收集所有参照物的边界信息
     * 包括画布边界（如果启用）和其他可见对象
     */
    protected collectReferenceBounds(target: FabricObject): Array<{ bounds: ObjectBounds; id: string }> {
        const result: Array<{ bounds: ObjectBounds; id: string }> = [];

        if (this.ctx.canvasSnap) {
            result.push({ bounds: this.getCanvasBounds(), id: "__canvas__" });
        }

        for (const obj of this.getOtherObjects(target)) {
            result.push({
                bounds: BoundsCalculator.getBounds(obj),
                id: this.ctx.metadata.get(obj)?.id ?? "",
            });
        }

        return result;
    }

    /**
     * 替换指定方向的辅助线
     * 同一方向只保留一条辅助线（距离最近的那条）
     *
     * @param guidelines 辅助线数组（会被修改）
     * @param type 辅助线方向
     * @param position 辅助线位置
     * @param sourceId 来源参照物ID
     */
    protected replaceGuideline(
        guidelines: Guideline[],
        type: "vertical" | "horizontal",
        position: number,
        sourceId: string
    ): void {
        const filtered = guidelines.filter((g) => g.type !== type);
        guidelines.length = 0;
        guidelines.push(...filtered, { type, position, sourceId });
    }
}
