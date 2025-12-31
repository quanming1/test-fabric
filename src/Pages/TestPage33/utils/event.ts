import type { Canvas, FabricObject, TPointerEvent } from "fabric";

/**
 * 从鼠标位置下的所有对象中找到最顶层符合条件的对象
 * @param canvas fabric canvas 实例
 * @param e 鼠标事件
 * @param predicate 过滤条件，返回 true 表示该对象符合条件
 * @returns 最顶层符合条件的对象，没有则返回 null
 */
export function findTopTargetAt(
    canvas: Canvas,
    e: TPointerEvent,
    predicate: (obj: FabricObject) => boolean
): FabricObject | null {
    const pointer = canvas.getScenePoint(e);
    const objects = canvas.getObjects();

    // 从后往前遍历（后面的在上层）
    for (let i = objects.length - 1; i >= 0; i--) {
        const obj = objects[i];
        if (predicate(obj) && obj.containsPoint(pointer)) {
            return obj;
        }
    }
    return null;
}
