import type { FabricObject } from "fabric";

/**
 * 在 FabricObject 上挂载“业务无关”的元数据/配置（类似 DOM dataset）。
 * 注意：FabricObject 是可序列化/导出的；默认建议把运行期数据都放在这里，
 * 但如果你不希望导出带上这些字段，可以在导出前清理或使用自定义 toObject。
 */
export class Bag {
  static get<T = any>(obj: FabricObject, key: string): T | undefined {
    return (obj as any)[key] as T | undefined;
  }

  static ensure<T extends Record<string, any> = Record<string, any>>(
    obj: FabricObject,
    key: string,
  ): T {
    return (((obj as any)[key] ??= {}) as unknown) as T;
  }

  static set<T = any>(obj: FabricObject, key: string, value: T | undefined) {
    (obj as any)[key] = value;
  }
}


