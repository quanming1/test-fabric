import type { Category } from "../../core";

/**
 * 辅助线类型
 */
export type GuidelineType = "vertical" | "horizontal";

/**
 * 辅助线数据
 */
export interface Guideline {
    type: GuidelineType;
    position: number; // 场景坐标中的位置
    sourceId: string; // 来源对象ID
}

/**
 * 吸附点
 */
export interface SnapPoint {
    delta: number;
    position: number;
}

/**
 * 对齐结果
 */
export interface SnapResult {
    snapped: boolean;
    deltaX: number;
    deltaY: number;
    guidelines: Guideline[];
}

/**
 * 对象边界信息
 */
export interface ObjectBounds {
    left: number;
    right: number;
    top: number;
    bottom: number;
    centerX: number;
    centerY: number;
}

/**
 * 辅助线样式配置
 */
export interface GuidelinesStyle {
    /** 辅助线颜色 */
    color: string;
    /** 辅助线宽度（屏幕像素，不随缩放变化） */
    lineWidth: number;
    /** 吸附阈值（场景坐标） */
    snapThreshold: number;
}

/**
 * 辅助线插件配置
 */
export interface GuidelinesPluginOptions {
    style?: Partial<GuidelinesStyle>;
    /** 是否启用 */
    enabled?: boolean;
    /** 允许参与辅助线对齐的元素类型 */
    allowedCategories?: Category[];
    /** 是否启用画布对齐（边缘和中心），默认 true */
    canvasSnap?: boolean;
}
