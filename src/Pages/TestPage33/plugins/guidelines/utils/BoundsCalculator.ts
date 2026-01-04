import type { FabricObject } from "fabric";
import type { ObjectBounds } from "../types";

/**
 * 边界计算器
 * 负责计算对象的场景坐标边界
 */
export class BoundsCalculator {
    /**
     * 获取对象边界（场景坐标）
     */
    static getBounds(obj: FabricObject): ObjectBounds {
        const center = obj.getCenterPoint();
        const width = obj.getScaledWidth();
        const height = obj.getScaledHeight();

        const left = center.x - width / 2;
        const top = center.y - height / 2;

        return {
            left,
            right: left + width,
            top,
            bottom: top + height,
            centerX: center.x,
            centerY: center.y,
        };
    }
}
