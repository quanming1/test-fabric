/**
 * 对象分类枚举
 */
export enum Category {
    /** 绘制的矩形 */
    DrawRect = "draw-rect",
    /** 标记点 */
    Marker = "marker",
    /** 图片 */
    Image = "image",
}

/**
 * 对象元数据类型
 */
export interface ObjectData {
    category: Category;
    /** 扩展字段 */
    [key: string]: any;
}
