import type { FabricObject } from "fabric";
import type { Guideline, SnapResult } from "../types";
import { BaseHandler, type Corners } from "./BaseHandler";
import { SnapDetector } from "../utils";

/**
 * 移动吸附处理器
 *
 * 职责：处理对象拖动时的吸附逻辑
 * - 检测目标对象的边缘和中心与参照物的对齐关系
 * - 通过四角坐标系统应用位置修正
 */
export class MoveHandler extends BaseHandler {
    /**
     * 计算移动时的吸附结果
     */
    calculateSnap(target: FabricObject): SnapResult {
        const currentCorners = this.getCorners(target);
        const targetBounds = this.cornersToBounds(currentCorners);
        const threshold = this.getThreshold();
        const references = this.collectReferenceBounds(target);

        const guidelines: Guideline[] = [];
        let deltaX = 0;
        let deltaY = 0;
        let snappedX = false;
        let snappedY = false;
        let minDistX = threshold;
        let minDistY = threshold;

        for (const { bounds, id } of references) {
            // 水平方向吸附检测
            const xSnaps = SnapDetector.checkHorizontal(targetBounds, bounds, threshold);
            for (const snap of xSnaps) {
                if (Math.abs(snap.delta) < minDistX) {
                    minDistX = Math.abs(snap.delta);
                    deltaX = snap.delta;
                    snappedX = true;
                    this.replaceGuideline(guidelines, "vertical", snap.position, id);
                }
            }

            // 垂直方向吸附检测
            const ySnaps = SnapDetector.checkVertical(targetBounds, bounds, threshold);
            for (const snap of ySnaps) {
                if (Math.abs(snap.delta) < minDistY) {
                    minDistY = Math.abs(snap.delta);
                    deltaY = snap.delta;
                    snappedY = true;
                    this.replaceGuideline(guidelines, "horizontal", snap.position, id);
                }
            }
        }

        return { snapped: snappedX || snappedY, deltaX, deltaY, guidelines };
    }

    /**
     * 应用移动吸附
     * 通过四角坐标系统整体平移对象
     */
    applySnap(target: FabricObject, result: SnapResult): void {
        const jitterThreshold = this.getJitterThreshold();
        const currentCorners = this.getCorners(target);

        // 计算新的四角坐标（整体平移）
        const newCorners = this.calculateNewCorners(
            currentCorners,
            result.deltaX,
            result.deltaY,
            jitterThreshold
        );

        // 应用新的四角坐标（仅移动，不改变尺寸）
        this.applyCornersMove(target, newCorners);

        target.setCoords();
    }

    /**
     * 计算移动后的新四角坐标
     */
    private calculateNewCorners(
        current: Corners,
        deltaX: number,
        deltaY: number,
        jitterThreshold: number
    ): Corners {
        let finalDeltaX = deltaX;
        let finalDeltaY = deltaY;

        // X 方向防抖
        if (deltaX !== 0) {
            const newX = current.tl.x + deltaX;
            if (this.lastSnapX !== null && Math.abs(newX - this.lastSnapX) < jitterThreshold) {
                finalDeltaX = this.lastSnapX - current.tl.x;
            } else {
                this.lastSnapX = newX;
            }
        }

        // Y 方向防抖
        if (deltaY !== 0) {
            const newY = current.tl.y + deltaY;
            if (this.lastSnapY !== null && Math.abs(newY - this.lastSnapY) < jitterThreshold) {
                finalDeltaY = this.lastSnapY - current.tl.y;
            } else {
                this.lastSnapY = newY;
            }
        }

        // 整体平移所有角
        return {
            tl: { x: current.tl.x + finalDeltaX, y: current.tl.y + finalDeltaY },
            tr: { x: current.tr.x + finalDeltaX, y: current.tr.y + finalDeltaY },
            bl: { x: current.bl.x + finalDeltaX, y: current.bl.y + finalDeltaY },
            br: { x: current.br.x + finalDeltaX, y: current.br.y + finalDeltaY },
        };
    }

    /**
     * 将四角坐标转换为边界信息（供 SnapDetector 使用）
     */
    private cornersToBounds(corners: Corners) {
        return {
            left: corners.tl.x,
            right: corners.tr.x,
            top: corners.tl.y,
            bottom: corners.bl.y,
            centerX: (corners.tl.x + corners.tr.x) / 2,
            centerY: (corners.tl.y + corners.bl.y) / 2,
        };
    }
}
