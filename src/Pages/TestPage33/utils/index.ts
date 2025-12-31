import type { FabricObject, Canvas, ActiveSelection } from "fabric";
import { util } from "fabric";

export function openFilePicker(options?: {
    accept?: string;
    multiple?: boolean;
}): Promise<File | null> {
    const { accept = "*/*", multiple = false } = options || {};

    return new Promise((resolve) => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = accept;
        input.multiple = multiple;

        input.onchange = (e) => {
            const file = (e.target as HTMLInputElement).files?.[0] ?? null;
            resolve(file);
        };

        input.addEventListener("cancel", () => resolve(null));
        input.click();
    });
}

// ─── Fabric 变换工具函数 ─────────────────────────────────────────

/** 变换矩阵类型 */
export type TransformMatrix = [number, number, number, number, number, number];

/**
 * 获取对象的完整变换矩阵（考虑 ActiveSelection）
 * 当对象在多选组中时，会组合组的变换矩阵
 */
export function getFullTransformMatrix(canvas: Canvas, target: FabricObject): TransformMatrix {
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
 * 将局部坐标转换为画布坐标
 * @param canvas 画布实例
 * @param target 目标对象
 * @param localX 局部 X 坐标（相对于对象中心）
 * @param localY 局部 Y 坐标（相对于对象中心）
 */
export function localToCanvas(
    canvas: Canvas,
    target: FabricObject,
    localX: number,
    localY: number
): { x: number; y: number } {
    const [a, b, c, d, tx, ty] = getFullTransformMatrix(canvas, target);
    return {
        x: a * localX + c * localY + tx,
        y: b * localX + d * localY + ty,
    };
}

/**
 * 从变换矩阵中提取缩放和角度
 */
export function extractScaleAndAngle(matrix: TransformMatrix): { scaleX: number; scaleY: number; angle: number } {
    const [a, b, c, d] = matrix;
    return {
        scaleX: Math.sqrt(a * a + b * b),
        scaleY: Math.sqrt(c * c + d * d),
        angle: Math.atan2(b, a) * (180 / Math.PI),
    };
}