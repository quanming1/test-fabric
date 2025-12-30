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

/** 标记类型 */
export type MarkerType = "point" | "region";

/** 标记点内部数据 */
export interface MarkerData {
    id: string;
    /** 关联的目标对象 ID */
    targetId: string;
    /** 标记类型 */
    type: MarkerType;
    /** 归一化坐标 (0~1) */
    nx: number;
    ny: number;
    /** 区域标记的宽高（归一化，仅 type="region" 时有效） */
    nw?: number;
    nh?: number;
}

/** 区域标记样式配置 */
export interface RegionStyle {
    /** 边框颜色 */
    stroke: string;
    /** 边框宽度 */
    strokeWidth: number;
    /** 填充颜色 */
    fill: string;
    /** hover 时的边框颜色 */
    hoverStroke: string;
}

import { Category } from "../../../core";

/** 默认区域标记样式 */
export const DEFAULT_REGION_STYLE: RegionStyle = {
    stroke: "#1890ff",
    strokeWidth: 2,
    fill: "rgba(24, 144, 255, 0.1)",
    hoverStroke: "#40a9ff",
};

/** 标记点插件配置 */
export interface MarkerPluginOptions {
    /** 标记点样式 */
    style?: Partial<MarkerStyle>;
    /** 区域标记样式 */
    regionStyle?: Partial<RegionStyle>;
    /**
     * 允许标记的对象分类列表
     * 默认：[Category.DrawRect, Category.Image]
     */
    markableCategories?: Category[];
    /** 判定为拖拽的最小距离（像素） */
    dragThreshold?: number;
}
