import { Point, type FabricObject, type TMat2D } from "fabric";

export interface ScreenPoint {
    x: number;
    y: number;
}

/**
 * 坐标转换工具类
 * 处理 Fabric.js 中局部坐标、场景坐标、屏幕坐标之间的转换
 */
export class CoordinateHelper {
    constructor(private vpt: TMat2D | undefined) { }

    /** 更新视口变换矩阵 */
    setViewportTransform(vpt: TMat2D | undefined): void {
        this.vpt = vpt;
    }

    /**
     * 局部坐标 → 屏幕坐标
     */
    localToScreen(localPoint: ScreenPoint, object: FabricObject): ScreenPoint {
        const matrix = object.calcTransformMatrix();
        const scenePoint = new Point(localPoint.x, localPoint.y).transform(matrix);

        if (!this.vpt) return { x: scenePoint.x, y: scenePoint.y };

        const screenPoint = scenePoint.transform(this.vpt);
        return { x: screenPoint.x, y: screenPoint.y };
    }

    /**
     * 场景坐标 → 屏幕坐标
     */
    sceneToScreen(scenePoint: ScreenPoint): ScreenPoint {
        if (!this.vpt) return scenePoint;

        const screenPoint = new Point(scenePoint.x, scenePoint.y).transform(this.vpt);
        return { x: screenPoint.x, y: screenPoint.y };
    }

    /**
     * 屏幕坐标 → 场景坐标
     */
    screenToScene(screenPoint: ScreenPoint): ScreenPoint {
        if (!this.vpt) return screenPoint;

        const inverted = new Point(screenPoint.x, screenPoint.y).transform(
            this.invertMatrix(this.vpt)
        );
        return { x: inverted.x, y: inverted.y };
    }

    /** 计算逆矩阵 */
    private invertMatrix(m: TMat2D): TMat2D {
        const [a, b, c, d, e, f] = m;
        const det = a * d - b * c;

        return [
            d / det,
            -b / det,
            -c / det,
            a / det,
            (c * f - d * e) / det,
            (b * e - a * f) / det,
        ];
    }
}
