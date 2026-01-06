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

/** 四角坐标 */
export interface Corners {
    tl: { x: number; y: number }; // 左上
    tr: { x: number; y: number }; // 右上
    bl: { x: number; y: number }; // 左下
    br: { x: number; y: number }; // 右下
}

/**
 * 吸附处理器基类
 *
 * 职责：
 * - 提供四角坐标系统的通用方法
 * - 管理防抖状态（lastSnapX/Y）
 * - 收集参照物边界信息
 */
export abstract class BaseHandler {
    protected ctx: HandlerContext;
    protected lastSnapX: number | null = null;
    protected lastSnapY: number | null = null;

    constructor(ctx: HandlerContext) {
        this.ctx = ctx;
    }

    /** 重置防抖状态 */
    reset(): void {
        this.lastSnapX = null;
        this.lastSnapY = null;
    }

    /** 计算吸附结果，由子类实现 */
    abstract calculateSnap(target: FabricObject, ...args: any[]): SnapResult;

    /** 应用吸附结果到目标对象，由子类实现 */
    abstract applySnap(target: FabricObject, result: SnapResult, ...args: any[]): void;

    // ==================== 四角坐标系统 ====================

    /**
     * 获取对象的四角坐标（场景坐标）
     */
    protected getCorners(target: FabricObject): Corners {
        const bounds = BoundsCalculator.getBounds(target);
        return {
            tl: { x: bounds.left, y: bounds.top },
            tr: { x: bounds.right, y: bounds.top },
            bl: { x: bounds.left, y: bounds.bottom },
            br: { x: bounds.right, y: bounds.bottom },
        };
    }

    /**
     * 用四角坐标反推并设置对象属性
     * 根据新的四角坐标计算 left/top/scaleX/scaleY
     */
    protected applyCorners(target: FabricObject, corners: Corners): void {
        const newWidth = corners.tr.x - corners.tl.x;
        const newHeight = corners.bl.y - corners.tl.y;

        // 获取当前的基础尺寸
        const currentScaleX = target.scaleX ?? 1;
        const currentScaleY = target.scaleY ?? 1;
        const currentBounds = BoundsCalculator.getBounds(target);
        const currentWidth = currentBounds.right - currentBounds.left;
        const currentHeight = currentBounds.bottom - currentBounds.top;
        const baseWidth = currentWidth / currentScaleX;
        const baseHeight = currentHeight / currentScaleY;

        // 计算新的缩放比例
        const newScaleX = newWidth / baseWidth;
        const newScaleY = newHeight / baseHeight;

        // 计算新的中心点
        const newCenterX = (corners.tl.x + corners.br.x) / 2;
        const newCenterY = (corners.tl.y + corners.br.y) / 2;

        // 根据 originX/originY 计算新的 left/top
        const { left, top } = this.calculatePositionFromCorners(target, corners, newCenterX, newCenterY);

        target.set({
            left,
            top,
            scaleX: newScaleX,
            scaleY: newScaleY,
        });
    }

    /**
     * 仅移动四角坐标（不改变尺寸）
     */
    protected applyCornersMove(target: FabricObject, corners: Corners): void {
        const newCenterX = (corners.tl.x + corners.br.x) / 2;
        const newCenterY = (corners.tl.y + corners.br.y) / 2;

        const { left, top } = this.calculatePositionFromCorners(target, corners, newCenterX, newCenterY);

        target.set({ left, top });
    }


    /**
     * 根据四角坐标和原点设置计算 left/top
     */
    private calculatePositionFromCorners(
        target: FabricObject,
        corners: Corners,
        centerX: number,
        centerY: number
    ): { left: number; top: number } {
        const originX = target.originX ?? "left";
        const originY = target.originY ?? "top";

        let left: number;
        let top: number;

        if (originX === "left") {
            left = corners.tl.x;
        } else if (originX === "center") {
            left = centerX;
        } else {
            left = corners.tr.x;
        }

        if (originY === "top") {
            top = corners.tl.y;
        } else if (originY === "center") {
            top = centerY;
        } else {
            top = corners.bl.y;
        }

        return { left, top };
    }

    // ==================== 阈值计算 ====================

    /**
     * 获取吸附阈值（场景坐标）
     */
    protected getThreshold(): number {
        return this.ctx.style.snapThreshold / this.ctx.canvas.getZoom();
    }

    /**
     * 获取防抖阈值（场景坐标）
     */
    protected getJitterThreshold(): number {
        return 2 / this.ctx.canvas.getZoom();
    }

    // ==================== 参照物收集 ====================

    /**
     * 获取画布可视区域在场景坐标系中的边界
     */
    protected getCanvasBounds(): ObjectBounds {
        const { canvas } = this.ctx;
        const width = canvas.width ?? 800;
        const height = canvas.height ?? 600;
        const vpt = canvas.viewportTransform;
        const zoom = vpt ? vpt[0] : 1;
        const offsetX = vpt ? vpt[4] : 0;
        const offsetY = vpt ? vpt[5] : 0;

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
     */
    protected getOtherObjects(target: FabricObject): FabricObject[] {
        const selectedObjects = this.getSelectedObjects(target);

        return this.ctx.canvas.getObjects().filter((obj) => {
            if (obj === target) return false;
            if (selectedObjects.has(obj)) return false;
            if (this.ctx.metadata.is(obj, "category", Category.Guideline)) return false;
            if (!obj.visible) return false;
            const category = this.ctx.metadata.getField(obj, "category");
            if (!category || !this.ctx.allowedCategories.includes(category)) return false;
            return true;
        });
    }

    /**
     * 获取当前选中的所有对象
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
     * 替换指定方向的辅助线（同一方向只保留一条）
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
