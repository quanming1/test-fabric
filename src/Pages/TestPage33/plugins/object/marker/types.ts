/** 标记点样式配置 */
export interface MarkerStyle {
    /** 圆点半径 */
    radius: number;
    /** 填充颜色 */
    fill: string;
    /** 边框颜色 */
    stroke: string;
    /** 边框宽度 */
    strokeWidth: number;
    /** 文字颜色 */
    textColor: string;
    /** 文字大小 */
    fontSize: number;
    /** hover 时的缩放比例 */
    hoverScale: number;
    /** hover 时的填充颜色 */
    hoverFill: string;
}

/** 默认标记点样式 */
export const DEFAULT_MARKER_STYLE: MarkerStyle = {
    radius: 12,
    fill: "#1890ff",
    stroke: "#ffffff",
    strokeWidth: 2,
    textColor: "#ffffff",
    fontSize: 10,
    hoverScale: 1.2,
    hoverFill: "#40a9ff",
};

/** 标记点内部数据 */
export interface MarkerData {
    id: string;
    /** 关联的目标对象 ID */
    targetId: string;
    /** 归一化坐标 (0~1) */
    nx: number;
    ny: number;
}

import { Category } from "../../../core";

/** 标记点插件配置 */
export interface MarkerPluginOptions {
    /** 标记点样式 */
    style?: Partial<MarkerStyle>;
    /**
     * 允许标记的对象分类列表
     * 默认：[Category.DrawRect, Category.Image]
     */
    markableCategories?: Category[];
}
