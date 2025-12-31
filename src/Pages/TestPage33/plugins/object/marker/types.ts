import { Category } from "../../../core";

// ─── Point 类型 ─────────────────────────────────────────

/** 标记点样式配置 */
export interface PointStyle {
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
export const DEFAULT_POINT_STYLE: PointStyle = {
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
export interface PointData {
    id: string;
    /** 关联的目标对象 ID */
    targetId: string;
    /** 归一化坐标 (0~1) */
    nx: number;
    ny: number;
}

// ─── Region 类型 ─────────────────────────────────────────

/** 区域样式配置 */
export interface RegionStyle {
    /** 填充颜色 */
    fill: string;
    /** 边框颜色 */
    stroke: string;
    /** 边框宽度 */
    strokeWidth: number;
    /** 圆角 */
    rx: number;
    ry: number;
}

/** 默认区域样式 */
export const DEFAULT_REGION_STYLE: RegionStyle = {
    fill: "rgba(255, 87, 34, 0.2)",
    stroke: "#ff5722",
    strokeWidth: 2,
    rx: 4,
    ry: 4,
};

/** 区域内部数据 */
export interface RegionData {
    id: string;
    /** 关联的目标对象 ID */
    targetId: string;
    /** 归一化坐标和尺寸 (0~1) */
    nx: number;
    ny: number;
    nw: number;
    nh: number;
}

// ─── 插件配置 ─────────────────────────────────────────

/** 标记插件配置 */
export interface MarkerPluginOptions {
    /** 标记点样式 */
    style?: Partial<PointStyle>;
    /** 区域样式 */
    regionStyle?: Partial<RegionStyle>;
    /**
     * 允许标记的对象分类列表
     * 默认：[Category.DrawRect, Category.Image]
     */
    markableCategories?: Category[];
}

// ─── 兼容旧类型名 ─────────────────────────────────────────

/** @deprecated 使用 PointStyle */
export type MarkerStyle = PointStyle;
/** @deprecated 使用 PointData */
export type MarkerData = PointData;
/** @deprecated 使用 DEFAULT_POINT_STYLE */
export const DEFAULT_MARKER_STYLE = DEFAULT_POINT_STYLE;
