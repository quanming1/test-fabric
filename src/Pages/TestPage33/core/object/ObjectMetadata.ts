import type { FabricObject, Canvas } from "fabric";
import type { ObjectData } from "./types";
import { genId } from "../utils/genId";

/**
 * 对象元数据管理器
 * 通过 FabricObject.data 存储元数据信息
 */
export class ObjectMetadata {
    constructor(private canvas: Canvas) { }

    /**
     * 设置对象的元数据（合并）
     */
    set(obj: FabricObject, data: Partial<ObjectData>): void {
        (obj as any).data = { ...(obj as any).data, ...data };
    }

    /**
     * 获取对象的完整元数据
     */
    get(obj: FabricObject): ObjectData | undefined {
        return (obj as any).data;
    }

    /**
     * 获取对象的某个元数据字段
     */
    getField<K extends keyof ObjectData>(obj: FabricObject, key: K): ObjectData[K] | undefined {
        return (obj as any).data?.[key];
    }

    /**
     * 判断对象的某个字段是否等于指定值
     */
    is<K extends keyof ObjectData>(obj: FabricObject, key: K, value: ObjectData[K]): boolean {
        return (obj as any).data?.[key] === value;
    }

    /**
     * 根据字段值筛选所有对象
     */
    filter<K extends keyof ObjectData>(key: K, value: ObjectData[K]): FabricObject[] {
        return this.canvas.getObjects().filter((obj) => (obj as any).data?.[key] === value);
    }

    /**
     * 根据 ID 获取对象
     */
    getById(id: string): FabricObject | undefined {
        return this.canvas.getObjects().find((obj) => (obj as any).data?.id === id);
    }

    /**
     * 克隆对象的元数据到目标对象（id 会被替换为新值）
     */
    clone(source: FabricObject, target: FabricObject, newId?: string): void {
        const sourceData = (source as any).data;
        if (sourceData) {
            (target as any).data = { ...sourceData, id: newId ?? genId("clone") };
        }
    }
}
