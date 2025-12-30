import { Point, type FabricObject, type TMat2D } from "fabric";

export interface ScreenPoint {
  x: number;
  y: number;
}

/**
 * 坐标转换工具类
 * 处理 Fabric.js 中局部坐标、场景坐标、屏幕坐标之间的转换
 *
 * 三种坐标系说明：
 *
 * 1. 局部坐标 (Local)
 *    - 相对于对象中心，中心点为 (0, 0)
 *    - 跟随对象的旋转、缩放变换
 *    - 例：100x100 矩形的左上角局部坐标为 (-50, -50)
 *
 * 2. 场景坐标 (Scene)
 *    - Fabric.js 的世界坐标系，原点在 canvas 左上角
 *    - 对象的 left/top 属性就是场景坐标
 *    - 不受视口缩放/平移影响
 *
 * 3. 屏幕坐标 (Screen)
 *    - 相对于 canvas DOM 元素左上角的像素坐标
 *    - 用于定位 HTML 元素（如浮动工具栏）
 *    - 受视口缩放 (zoom) 和平移 (pan) 影响
 *
 * 转换链路：局部 → 场景 → 屏幕
 *
 * 示例：100x100 矩形在场景 (200, 150)，画布放大 2 倍
 * | 坐标系 | 矩形中心 | 矩形左上角 |
 * |--------|---------|-----------|
 * | 局部   | (0, 0)  | (-50, -50)|
 * | 场景   | (200, 150) | (150, 100) |
 * | 屏幕   | (400, 300) | (300, 200) |
 */
export class CoordinateHelper {
  constructor(private vpt: TMat2D | undefined) {}

  /** 更新视口变换矩阵 */
  setViewportTransform(vpt: TMat2D | undefined): void {
    this.vpt = vpt;
  }

  /**
   * 局部坐标 → 屏幕坐标
   * @param localPoint 局部坐标（对象中心为原点）
   * @param object Fabric 对象
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
   * @param scenePoint 场景坐标（canvas 坐标）
   */
  sceneToScreen(scenePoint: ScreenPoint): ScreenPoint {
    if (!this.vpt) return scenePoint;

    const screenPoint = new Point(scenePoint.x, scenePoint.y).transform(this.vpt);
    return { x: screenPoint.x, y: screenPoint.y };
  }

  /**
   * 屏幕坐标 → 场景坐标
   * @param screenPoint 屏幕坐标
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
