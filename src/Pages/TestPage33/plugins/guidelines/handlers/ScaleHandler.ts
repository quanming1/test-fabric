import type { FabricObject, Transform } from "fabric";
import type { Guideline, SnapResult } from "../types";
import { BaseHandler, type Corners } from "./BaseHandler";

/**
 * 缩放吸附处理器
 *
 * 职责：处理对象缩放时的吸附逻辑
 * - 根据缩放控制点位置，检测对应边缘与参照物的对齐关系
 * - 通过四角坐标系统应用吸附，确保对角固定
 */
export class ScaleHandler extends BaseHandler {
    /**
     * 计算缩放时的吸附结果
     */
    calculateSnap(target: FabricObject, transform: Transform): SnapResult {
        const currentCorners = this.getCorners(target);
        const targetBounds = this.cornersToBounds(currentCorners);
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
                        const intersections = this.getVerticalIntersections(
                            snap.position, targetBounds, deltaX, checkLeft, checkRight
                        );
                        this.replaceGuideline(guidelines, "vertical", snap.position, id, intersections);
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
                        const intersections = this.getHorizontalIntersections(
                            snap.position, targetBounds, deltaY, checkTop, checkBottom
                        );
                        this.replaceGuideline(guidelines, "horizontal", snap.position, id, intersections);
                    }
                }
            }
        }

        return { snapped: snappedX || snappedY, deltaX, deltaY, guidelines };
    }

    /**
     * 应用缩放吸附
     * 通过四角坐标系统，确保对角固定
     */
    applySnap(target: FabricObject, result: SnapResult, transform: Transform): void {
        const corner = transform.corner;
        const jitterThreshold = this.getJitterThreshold();
        const currentCorners = this.getCorners(target);
        const newCorners = this.calculateNewCorners(
            currentCorners,
            corner,
            result.deltaX,
            result.deltaY,
            jitterThreshold
        );

        this.applyCorners(target, newCorners);
        target.setCoords();
    }

    /**
     * 根据拖动的控制点和偏移量计算新的四角坐标
     */
    private calculateNewCorners(
        current: Corners,
        corner: string,
        deltaX: number,
        deltaY: number,
        jitterThreshold: number
    ): Corners {
        const newCorners: Corners = {
            tl: { ...current.tl },
            tr: { ...current.tr },
            bl: { ...current.bl },
            br: { ...current.br },
        };

        let finalDeltaX = deltaX;
        let finalDeltaY = deltaY;

        if (deltaX !== 0) {
            const movingX = corner.includes("l") ? current.tl.x + deltaX : current.tr.x + deltaX;
            if (this.lastSnapX !== null && Math.abs(movingX - this.lastSnapX) < jitterThreshold) {
                finalDeltaX = this.lastSnapX - (corner.includes("l") ? current.tl.x : current.tr.x);
            } else {
                this.lastSnapX = movingX;
            }
        }

        if (deltaY !== 0) {
            const movingY = corner.includes("t") ? current.tl.y + deltaY : current.bl.y + deltaY;
            if (this.lastSnapY !== null && Math.abs(movingY - this.lastSnapY) < jitterThreshold) {
                finalDeltaY = this.lastSnapY - (corner.includes("t") ? current.tl.y : current.bl.y);
            } else {
                this.lastSnapY = movingY;
            }
        }

        if (corner.includes("l")) {
            newCorners.tl.x += finalDeltaX;
            newCorners.bl.x += finalDeltaX;
        }
        if (corner.includes("r")) {
            newCorners.tr.x += finalDeltaX;
            newCorners.br.x += finalDeltaX;
        }
        if (corner.includes("t")) {
            newCorners.tl.y += finalDeltaY;
            newCorners.tr.y += finalDeltaY;
        }
        if (corner.includes("b")) {
            newCorners.bl.y += finalDeltaY;
            newCorners.br.y += finalDeltaY;
        }

        return newCorners;
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
}
