import type { FabricObject, Canvas } from "fabric";
import { Category, type ObjectData } from "./types";

/**
 * 对象分类管理器
 * 通过 FabricObject.data 存储分类信息
 */
export class ObjectCategory {
    constructor(private canvas: Canvas) { }

    /**
     * 给对象设置分类
     */
    set(obj: FabricObject, category: Category, extra?: Record<string, any>): void {
        const data: ObjectData = { ...(obj as any).data, category, ...extra };
        (obj as any).data = data;
    }

    /**
     * 获取对象的分类
     */
    get(obj: FabricObject): Category | undefined {
        return (obj as any).data?.category;
    }

    /**
     * 判断对象是否属于某分类
     */
    is(obj: FabricObject, category: Category): boolean {
        return (obj as any).data?.category === category;
    }

    /**
     * 获取对象的完整元数据
     */
    getData(obj: FabricObject): ObjectData | undefined {
        return (obj as any).data;
    }

    /**
     * 根据分类获取所有对象
     */
    getAll(category: Category): FabricObject[] {
        return this.canvas.getObjects().filter((obj) => this.is(obj, category));
    }
}
