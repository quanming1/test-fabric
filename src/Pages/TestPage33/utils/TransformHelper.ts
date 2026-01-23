import type { FabricObject, Canvas, ActiveSelection } from "fabric";
import { util } from "fabric";

/** 变换矩阵类型 [a, b, c, d, e, f] */
export type TransformMatrix = [number, number, number, number, number, number];

/** 分解后的变换属性 */
export interface DecomposedTransform {
    scaleX: number;
    scaleY: number;
    skewX: number;
    skewY: number;
    angle: number;
    translateX: number;
    translateY: number;
}

/**
 * Fabric.js 变换矩阵工具类
 * 
 * 处理 ActiveSelection（多选）场景下的坐标转换问题：
 * - 当对象在 ActiveSelection 中时，其 left/top 是相对于组的局部坐标
 * - calcTransformMatrix() 返回的也是局部坐标矩阵
 * - 此工具类提供绝对坐标与局部坐标之间的转换
 */
export class TransformHelper {
    /**
     * 获取对象的完整变换矩阵（绝对坐标）
     * 
     * 当对象在 ActiveSelection 中时，会组合组的变换矩阵，
     * 确保返回正确的画布绝对坐标矩阵。
     */
    static getAbsoluteMatrix(canvas: Canvas, target: FabricObject): TransformMatrix {
        const activeObject = canvas.getActiveObject();

        if (activeObject?.type === "activeselection") {
            const selection = activeObject as ActiveSelection;
            const objects = selection.getObjects();

            if (objects.includes(target)) {
                const objectMatrix = target.calcOwnMatrix();
                const groupMatrix = selection.calcTransformMatrix();
                return util.multiplyTransformMatrices(groupMatrix, objectMatrix) as TransformMatrix;
            }
        }

        return target.calcTransformMatrix() as TransformMatrix;
    }

    /**
     * 将绝对坐标矩阵转换为局部坐标矩阵
     * 
     * 当对象在 ActiveSelection 中时，直接设置 left/top 会被解释为局部坐标。
     * 此方法将绝对坐标矩阵转换为相对于 ActiveSelection 的局部坐标矩阵。
     * 如果对象不在 ActiveSelection 中，直接返回原矩阵。
     */
    static absoluteToLocal(target: FabricObject, absoluteMatrix: TransformMatrix): TransformMatrix {
        const group = target.group;

        if (group && group.type === "activeselection") {
            const groupMatrix = group.calcTransformMatrix();
            const invertedGroupMatrix = util.invertTransform(groupMatrix);
            return util.multiplyTransformMatrices(invertedGroupMatrix, absoluteMatrix) as TransformMatrix;
        }

        return absoluteMatrix;
    }

    /**
     * 从变换矩阵中分解出变换属性
     */
    static decompose(matrix: TransformMatrix): DecomposedTransform {
        return util.qrDecompose(matrix);
    }

    /**
     * 将变换矩阵应用到对象
     * 
     * @param target 目标对象
     * @param matrix 变换矩阵（绝对坐标）
     * @param options.setOrigin 是否设置 originX/originY 为 center，默认 true
     * @param options.convertToLocal 是否自动转换为局部坐标（当对象在 ActiveSelection 中时），默认 true
     */
    static applyMatrix(
        target: FabricObject,
        matrix: TransformMatrix,
        options?: { setOrigin?: boolean; convertToLocal?: boolean }
    ): void {
        const { setOrigin = true, convertToLocal = true } = options ?? {};

        const finalMatrix = convertToLocal ? this.absoluteToLocal(target, matrix) : matrix;
        const props = this.decompose(finalMatrix);

        target.set({
            ...(setOrigin && { originX: "center", originY: "center" }),
            flipX: false,
            flipY: false,
            scaleX: props.scaleX,
            scaleY: props.scaleY,
            skewX: props.skewX,
            skewY: props.skewY,
            angle: props.angle,
            left: props.translateX,
            top: props.translateY,
        });
    }

    /**
     * 将对象局部坐标转换为画布绝对坐标（场景坐标）
     */
    static localToCanvas(
        canvas: Canvas,
        target: FabricObject,
        localX: number,
        localY: number
    ): { x: number; y: number } {
        const [a, b, c, d, tx, ty] = this.getAbsoluteMatrix(canvas, target);
        return {
            x: a * localX + c * localY + tx,
            y: b * localX + d * localY + ty,
        };
    }

    /**
     * 将对象局部坐标转换为屏幕坐标
     * 
     * 兼容对象处于 ActiveSelection 多选中的情况，
     * 会正确计算组合变换后的最终屏幕位置。
     * 
     * @param canvas 画布实例
     * @param target 目标对象
     * @param localX 局部 X 坐标
     * @param localY 局部 Y 坐标
     * @returns 屏幕坐标 { x, y }
     */
    static localToScreen(
        canvas: Canvas,
        target: FabricObject,
        localX: number,
        localY: number
    ): { x: number; y: number } {
        // 先转换为场景坐标
        const scenePoint = this.localToCanvas(canvas, target, localX, localY);

        // 再转换为屏幕坐标
        const vpt = canvas.viewportTransform;
        if (!vpt) return scenePoint;

        return {
            x: scenePoint.x * vpt[0] + vpt[4],
            y: scenePoint.y * vpt[3] + vpt[5],
        };
    }

    /**
     * 从变换矩阵中提取缩放和角度
     */
    static extractScaleAndAngle(matrix: TransformMatrix): { scaleX: number; scaleY: number; angle: number } {
        const [a, b, c, d] = matrix;
        return {
            scaleX: Math.sqrt(a * a + b * b),
            scaleY: Math.sqrt(c * c + d * d),
            angle: Math.atan2(b, a) * (180 / Math.PI),
        };
    }
}
