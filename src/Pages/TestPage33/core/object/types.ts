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
    /** 标记区域 */
    Region = "region",
}

/**
 * 对象元数据类型
 */
export interface ObjectData {
    /** 对象分类 */
    category?: Category;
    /** 对象唯一标识 */
    id?: string;
}
