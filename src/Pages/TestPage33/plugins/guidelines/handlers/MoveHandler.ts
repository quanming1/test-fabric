import type { FabricObject } from "fabric";
import type { Guideline, SnapResult } from "../types";
import { BaseHandler } from "./BaseHandler";
import { BoundsCalculator, SnapDetector } from "../utils";

/**
 * 移动吸附处理器
 *
 * 职责：处理对象拖动时的吸附逻辑
 * - 检测目标对象的6条边线（左/右/上/下/水平中心/垂直中心）与参照物的对齐关系
 * - 计算最近的吸附点并应用位置修正
 */
export class MoveHandler extends BaseHandler {
    /**
     * 计算移动时的吸附结果
     *
     * @param target 正在拖动的目标对象
     * @returns 吸附结果，包含是否吸附、位移量、辅助线列表
     */
    calculateSnap(target: FabricObject): SnapResult {
        const targetBounds = BoundsCalculator.getBounds(target);
        const threshold = this.getThreshold();
        const references = this.collectReferenceBounds(target);

        const guidelines: Guideline[] = [];
        let deltaX = 0;    // X方向需要移动的距离
        let deltaY = 0;    // Y方向需要移动的距离
        let snappedX = false;
        let snappedY = false;
        let minDistX = threshold; // X方向最小距离，初始为阈值
        let minDistY = threshold; // Y方向最小距离，初始为阈值

        for (const { bounds, id } of references) {
            // 水平方向吸附检测（左/右/中心 对 左/右/中心）
            const xSnaps = SnapDetector.checkHorizontal(targetBounds, bounds, threshold);
            for (const snap of xSnaps) {
                if (Math.abs(snap.delta) < minDistX) {
                    minDistX = Math.abs(snap.delta);
                    deltaX = snap.delta;
                    snappedX = true;
                    this.replaceGuideline(guidelines, "vertical", snap.position, id); // 竖线
                }
            }

            // 垂直方向吸附检测（上/下/中心 对 上/下/中心）
            const ySnaps = SnapDetector.checkVertical(targetBounds, bounds, threshold);
            for (const snap of ySnaps) {
                if (Math.abs(snap.delta) < minDistY) {
                    minDistY = Math.abs(snap.delta);
                    deltaY = snap.delta;
                    snappedY = true;
                    this.replaceGuideline(guidelines, "horizontal", snap.position, id); // 横线
                }
            }
        }

        return { snapped: snappedX || snappedY, deltaX, deltaY, guidelines };
    }

    /**
     * 应用移动吸附，修正目标对象的位置
     *
     * @param target 目标对象
     * @param result 吸附计算结果
     */
    applySnap(target: FabricObject, result: SnapResult): void {
        const jitterThreshold = this.getJitterThreshold();

        // 应用X方向吸附
        if (result.deltaX !== 0) {
            const newX = (target.left ?? 0) + result.deltaX;
            // 防抖：如果新位置与上次吸附位置很接近，保持上次位置
            if (this.lastSnapX !== null && Math.abs(newX - this.lastSnapX) < jitterThreshold) {
                target.set("left", this.lastSnapX);
            } else {
                target.set("left", newX);
                this.lastSnapX = newX;
            }
        }

        // 应用Y方向吸附
        if (result.deltaY !== 0) {
            const newY = (target.top ?? 0) + result.deltaY;
            if (this.lastSnapY !== null && Math.abs(newY - this.lastSnapY) < jitterThreshold) {
                target.set("top", this.lastSnapY);
            } else {
                target.set("top", newY);
                this.lastSnapY = newY;
            }
        }

        target.setCoords(); // 更新对象的控制点坐标
    }
}
