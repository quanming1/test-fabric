import { ActiveSelection, type FabricObject, type Transform } from "fabric";
import type { Guideline, SnapResult } from "../types";
import { BaseHandler } from "./BaseHandler";
import { BoundsCalculator } from "../utils";

/**
 * 缩放吸附处理器
 *
 * 职责：处理对象缩放时的吸附逻辑
 * - 根据缩放控制点位置，检测对应边缘与参照物的对齐关系
 * - 计算最近的吸附点并应用尺寸修正
 */
export class ScaleHandler extends BaseHandler {
    /**
     * 计算缩放时的吸附结果
     *
     * @param target 正在缩放的目标对象
     * @param transform 当前变换信息
     * @returns 吸附结果
     */
    calculateSnap(target: FabricObject, transform: Transform): SnapResult {
        const targetBounds = BoundsCalculator.getBounds(target);
        const threshold = this.getThreshold();
        const references = this.collectReferenceBounds(target);
        const corner = transform.corner;

        const guidelines: Guideline[] = [];
        let deltaX = 0;
        let deltaY = 0;
        let snappedX = false;
        let snappedY = false;
        let minDistX = threshold;
        let minDistY = threshold;

        // 根据控制点确定需要检测的边
        const checkLeft = corner.includes("l");
        const checkRight = corner.includes("r");
        const checkTop = corner.includes("t");
        const checkBottom = corner.includes("b");

        for (const { bounds, id } of references) {
            // 水平方向吸附检测
            if (checkLeft || checkRight) {
                const xSnaps = this.checkHorizontalForScale(
                    targetBounds,
                    bounds,
                    threshold,
                    checkLeft,
                    checkRight
                );
                for (const snap of xSnaps) {
                    if (Math.abs(snap.delta) < minDistX) {
                        minDistX = Math.abs(snap.delta);
                        deltaX = snap.delta;
                        snappedX = true;
                        this.replaceGuideline(guidelines, "vertical", snap.position, id);
                    }
                }
            }

            // 垂直方向吸附检测
            if (checkTop || checkBottom) {
                const ySnaps = this.checkVerticalForScale(
                    targetBounds,
                    bounds,
                    threshold,
                    checkTop,
                    checkBottom
                );
                for (const snap of ySnaps) {
                    if (Math.abs(snap.delta) < minDistY) {
                        minDistY = Math.abs(snap.delta);
                        deltaY = snap.delta;
                        snappedY = true;
                        this.replaceGuideline(guidelines, "horizontal", snap.position, id);
                    }
                }
            }
        }

        return { snapped: snappedX || snappedY, deltaX, deltaY, guidelines };
    }

    /**
     * 应用缩放吸附
     */
    applySnap(target: FabricObject, result: SnapResult, transform: Transform): void {
        const corner = transform.corner;
        const jitterThreshold = this.getJitterThreshold();

        // 多选情况：通过调整整体 scale 来实现吸附
        if (target instanceof ActiveSelection) {
            this.applySnapForActiveSelection(target, result, corner, jitterThreshold);
        } else {
            // 单选情况：直接调整位置和 scale
            if (result.deltaX !== 0) {
                this.applyHorizontalSnap(target, result.deltaX, corner, jitterThreshold);
            }

            if (result.deltaY !== 0) {
                this.applyVerticalSnap(target, result.deltaY, corner, jitterThreshold);
            }
        }

        target.setCoords();
    }

    /**
     * 多选情况下应用吸附
     * 通过调整 ActiveSelection 的 scale 来实现，保持子对象相对位置不变
     */
    private applySnapForActiveSelection(
        target: ActiveSelection,
        result: SnapResult,
        corner: string,
        jitterThreshold: number
    ): void {
        const bounds = BoundsCalculator.getBounds(target);
        const scaleX = target.scaleX ?? 1;
        const scaleY = target.scaleY ?? 1;
        const baseWidth = (bounds.right - bounds.left) / scaleX;
        const baseHeight = (bounds.bottom - bounds.top) / scaleY;

        // 水平方向吸附
        if (result.deltaX !== 0) {
            if (corner.includes("l")) {
                // 拖动左边：计算新的左边位置，调整 scaleX
                let newLeft = bounds.left + result.deltaX;
                if (this.lastSnapX !== null && Math.abs(newLeft - this.lastSnapX) < jitterThreshold) {
                    newLeft = this.lastSnapX;
                } else {
                    this.lastSnapX = newLeft;
                }
                const newWidth = bounds.right - newLeft;
                const newScaleX = newWidth / baseWidth;
                // 计算新的 left（ActiveSelection 的 left 是中心点偏移）
                const centerX = newLeft + newWidth / 2;
                const currentCenterX = (bounds.left + bounds.right) / 2;
                const leftOffset = (target.left ?? 0) + (centerX - currentCenterX);
                target.set({ left: leftOffset, scaleX: newScaleX });
            } else if (corner.includes("r")) {
                // 拖动右边：计算新的右边位置，调整 scaleX
                let newRight = bounds.right + result.deltaX;
                if (this.lastSnapX !== null && Math.abs(newRight - this.lastSnapX) < jitterThreshold) {
                    newRight = this.lastSnapX;
                } else {
                    this.lastSnapX = newRight;
                }
                const newWidth = newRight - bounds.left;
                const newScaleX = newWidth / baseWidth;
                const centerX = bounds.left + newWidth / 2;
                const currentCenterX = (bounds.left + bounds.right) / 2;
                const leftOffset = (target.left ?? 0) + (centerX - currentCenterX);
                target.set({ left: leftOffset, scaleX: newScaleX });
            }
        }

        // 垂直方向吸附
        if (result.deltaY !== 0) {
            if (corner.includes("t")) {
                // 拖动上边：计算新的上边位置，调整 scaleY
                let newTop = bounds.top + result.deltaY;
                if (this.lastSnapY !== null && Math.abs(newTop - this.lastSnapY) < jitterThreshold) {
                    newTop = this.lastSnapY;
                } else {
                    this.lastSnapY = newTop;
                }
                const newHeight = bounds.bottom - newTop;
                const newScaleY = newHeight / baseHeight;
                const centerY = newTop + newHeight / 2;
                const currentCenterY = (bounds.top + bounds.bottom) / 2;
                const topOffset = (target.top ?? 0) + (centerY - currentCenterY);
                target.set({ top: topOffset, scaleY: newScaleY });
            } else if (corner.includes("b")) {
                // 拖动下边：计算新的下边位置，调整 scaleY
                let newBottom = bounds.bottom + result.deltaY;
                if (this.lastSnapY !== null && Math.abs(newBottom - this.lastSnapY) < jitterThreshold) {
                    newBottom = this.lastSnapY;
                } else {
                    this.lastSnapY = newBottom;
                }
                const newHeight = newBottom - bounds.top;
                const newScaleY = newHeight / baseHeight;
                const centerY = bounds.top + newHeight / 2;
                const currentCenterY = (bounds.top + bounds.bottom) / 2;
                const topOffset = (target.top ?? 0) + (centerY - currentCenterY);
                target.set({ top: topOffset, scaleY: newScaleY });
            }
        }
    }


    /**
     * 水平方向吸附检测（仅检测正在拖动的边）
     */
    private checkHorizontalForScale(
        target: { left: number; right: number; centerX: number },
        other: { left: number; right: number; centerX: number },
        threshold: number,
        checkLeft: boolean,
        checkRight: boolean
    ): Array<{ delta: number; position: number }> {
        const snaps: Array<{ delta: number; position: number }> = [];
        const otherPositions = [other.left, other.right, other.centerX];

        if (checkLeft) {
            for (const pos of otherPositions) {
                const delta = pos - target.left;
                if (Math.abs(delta) < threshold) {
                    snaps.push({ delta, position: pos });
                }
            }
        }

        if (checkRight) {
            for (const pos of otherPositions) {
                const delta = pos - target.right;
                if (Math.abs(delta) < threshold) {
                    snaps.push({ delta, position: pos });
                }
            }
        }

        return snaps;
    }

    /**
     * 垂直方向吸附检测（仅检测正在拖动的边）
     */
    private checkVerticalForScale(
        target: { top: number; bottom: number; centerY: number },
        other: { top: number; bottom: number; centerY: number },
        threshold: number,
        checkTop: boolean,
        checkBottom: boolean
    ): Array<{ delta: number; position: number }> {
        const snaps: Array<{ delta: number; position: number }> = [];
        const otherPositions = [other.top, other.bottom, other.centerY];

        if (checkTop) {
            for (const pos of otherPositions) {
                const delta = pos - target.top;
                if (Math.abs(delta) < threshold) {
                    snaps.push({ delta, position: pos });
                }
            }
        }

        if (checkBottom) {
            for (const pos of otherPositions) {
                const delta = pos - target.bottom;
                if (Math.abs(delta) < threshold) {
                    snaps.push({ delta, position: pos });
                }
            }
        }

        return snaps;
    }

    /**
     * 应用水平方向吸附
     */
    private applyHorizontalSnap(
        target: FabricObject,
        deltaX: number,
        corner: string,
        jitterThreshold: number
    ): void {
        const width = target.getScaledWidth();
        const scaleX = target.scaleX ?? 1;
        const baseWidth = width / scaleX;

        if (corner.includes("l")) {
            // 拖动左边：左边移动，右边固定
            const currentLeft = target.left ?? 0;
            let newLeft = currentLeft + deltaX;

            if (this.lastSnapX !== null && Math.abs(newLeft - this.lastSnapX) < jitterThreshold) {
                newLeft = this.lastSnapX;
            } else {
                this.lastSnapX = newLeft;
            }

            const rightEdge = currentLeft + width;
            const newWidth = rightEdge - newLeft;
            const newScaleX = newWidth / baseWidth;

            target.set({ left: newLeft, scaleX: newScaleX });
        } else if (corner.includes("r")) {
            // 拖动右边：右边移动，左边固定
            const currentRight = (target.left ?? 0) + width;
            let newRight = currentRight + deltaX;

            if (this.lastSnapX !== null && Math.abs(newRight - this.lastSnapX) < jitterThreshold) {
                newRight = this.lastSnapX;
            } else {
                this.lastSnapX = newRight;
            }

            const newWidth = newRight - (target.left ?? 0);
            const newScaleX = newWidth / baseWidth;

            target.set({ scaleX: newScaleX });
        }
    }

    /**
     * 应用垂直方向吸附
     */
    private applyVerticalSnap(
        target: FabricObject,
        deltaY: number,
        corner: string,
        jitterThreshold: number
    ): void {
        const height = target.getScaledHeight();
        const scaleY = target.scaleY ?? 1;
        const baseHeight = height / scaleY;

        if (corner.includes("t")) {
            // 拖动上边：上边移动，下边固定
            const currentTop = target.top ?? 0;
            let newTop = currentTop + deltaY;

            if (this.lastSnapY !== null && Math.abs(newTop - this.lastSnapY) < jitterThreshold) {
                newTop = this.lastSnapY;
            } else {
                this.lastSnapY = newTop;
            }

            const bottomEdge = currentTop + height;
            const newHeight = bottomEdge - newTop;
            const newScaleY = newHeight / baseHeight;

            target.set({ top: newTop, scaleY: newScaleY });
        } else if (corner.includes("b")) {
            // 拖动下边：下边移动，上边固定
            const currentBottom = (target.top ?? 0) + height;
            let newBottom = currentBottom + deltaY;

            if (this.lastSnapY !== null && Math.abs(newBottom - this.lastSnapY) < jitterThreshold) {
                newBottom = this.lastSnapY;
            } else {
                this.lastSnapY = newBottom;
            }

            const newHeight = newBottom - (target.top ?? 0);
            const newScaleY = newHeight / baseHeight;

            target.set({ scaleY: newScaleY });
        }
    }
}
