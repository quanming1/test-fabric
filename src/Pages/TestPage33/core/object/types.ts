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
    /** 辅助线 */
    Guideline = "guideline",
    /** 浮动标签 */
    Label = "label",
}

/**
 * 对象元数据基础类型
 */
export interface ObjectData {
    /** 对象分类 */
    category?: Category;
    /** 对象唯一标识 */
    id?: string;
}

/**
 * 图片对象元数据（扩展 ObjectData）
 */
export interface ImageObjectData extends ObjectData {
    category?: Category.Image;
    /** 原始文件名 */
    fileName?: string;
    /** 原始图片宽度（像素） */
    naturalWidth?: number;
    /** 原始图片高度（像素） */
    naturalHeight?: number;
}
