import type { ObjectBounds, SnapPoint } from "../types";

/**
 * 吸附检测器
 * 负责检测对象之间的对齐关系
 */
export class SnapDetector {
    /**
     * 检测水平方向的吸附点
     */
    static checkHorizontal(
        target: ObjectBounds,
        other: ObjectBounds,
        threshold: number
    ): SnapPoint[] {
        const snaps: SnapPoint[] = [];

        // 左边对左边
        const leftToLeft = other.left - target.left;
        if (Math.abs(leftToLeft) < threshold) {
            snaps.push({ delta: leftToLeft, position: other.left });
        }

        // 左边对右边
        const leftToRight = other.right - target.left;
        if (Math.abs(leftToRight) < threshold) {
            snaps.push({ delta: leftToRight, position: other.right });
        }

        // 右边对左边
        const rightToLeft = other.left - target.right;
        if (Math.abs(rightToLeft) < threshold) {
            snaps.push({ delta: rightToLeft, position: other.left });
        }

        // 右边对右边
        const rightToRight = other.right - target.right;
        if (Math.abs(rightToRight) < threshold) {
            snaps.push({ delta: rightToRight, position: other.right });
        }

        // 中心对中心
        const centerToCenter = other.centerX - target.centerX;
        if (Math.abs(centerToCenter) < threshold) {
            snaps.push({ delta: centerToCenter, position: other.centerX });
        }

        // 左边对中心
        const leftToCenter = other.centerX - target.left;
        if (Math.abs(leftToCenter) < threshold) {
            snaps.push({ delta: leftToCenter, position: other.centerX });
        }

        // 右边对中心
        const rightToCenter = other.centerX - target.right;
        if (Math.abs(rightToCenter) < threshold) {
            snaps.push({ delta: rightToCenter, position: other.centerX });
        }

        return snaps;
    }

    /**
     * 检测垂直方向的吸附点
     */
    static checkVertical(
        target: ObjectBounds,
        other: ObjectBounds,
        threshold: number
    ): SnapPoint[] {
        const snaps: SnapPoint[] = [];

        // 上边对上边
        const topToTop = other.top - target.top;
        if (Math.abs(topToTop) < threshold) {
            snaps.push({ delta: topToTop, position: other.top });
        }

        // 上边对下边
        const topToBottom = other.bottom - target.top;
        if (Math.abs(topToBottom) < threshold) {
            snaps.push({ delta: topToBottom, position: other.bottom });
        }

        // 下边对上边
        const bottomToTop = other.top - target.bottom;
        if (Math.abs(bottomToTop) < threshold) {
            snaps.push({ delta: bottomToTop, position: other.top });
        }

        // 下边对下边
        const bottomToBottom = other.bottom - target.bottom;
        if (Math.abs(bottomToBottom) < threshold) {
            snaps.push({ delta: bottomToBottom, position: other.bottom });
        }

        // 中心对中心
        const centerToCenter = other.centerY - target.centerY;
        if (Math.abs(centerToCenter) < threshold) {
            snaps.push({ delta: centerToCenter, position: other.centerY });
        }

        // 上边对中心
        const topToCenter = other.centerY - target.top;
        if (Math.abs(topToCenter) < threshold) {
            snaps.push({ delta: topToCenter, position: other.centerY });
        }

        // 下边对中心
        const bottomToCenter = other.centerY - target.bottom;
        if (Math.abs(bottomToCenter) < threshold) {
            snaps.push({ delta: bottomToCenter, position: other.centerY });
        }

        return snaps;
    }
}
