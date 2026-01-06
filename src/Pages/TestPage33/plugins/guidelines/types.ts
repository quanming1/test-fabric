import type { Category } from "../../core";

/** 辅助线方向：vertical=竖线，horizontal=横线 */
export type GuidelineType = "vertical" | "horizontal";

/** 辅助线数据 */
export interface Guideline {
    type: GuidelineType;
    position: number; // 辅助线在场景坐标中的位置（竖线是x坐标，横线是y坐标）
    sourceId: string; // 触发这条辅助线的参照物ID，"__canvas__"表示画布
}

/** 吸附点：表示一个可能的对齐位置 */
export interface SnapPoint {
    delta: number;    // 目标需要移动的距离（正值向右/下，负值向左/上）
    position: number; // 对齐位置的坐标值
}

/** 吸附计算结果 */
export interface SnapResult {
    snapped: boolean;       // 是否发生了吸附
    deltaX: number;         // X方向需要移动的距离
    deltaY: number;         // Y方向需要移动的距离
    guidelines: Guideline[]; // 需要显示的辅助线列表
}

/** 对象边界信息（场景坐标系） */
export interface ObjectBounds {
    left: number;    // 左边缘x坐标
    right: number;   // 右边缘x坐标
    top: number;     // 上边缘y坐标
    bottom: number;  // 下边缘y坐标
    centerX: number; // 水平中心x坐标
    centerY: number; // 垂直中心y坐标
}

/** 辅助线样式配置 */
export interface GuidelinesStyle {
    color: string;        // 辅助线颜色
    lineWidth: number;    // 辅助线宽度（屏幕像素，不随画布缩放变化）
    snapThreshold: number; // 吸附触发阈值（场景坐标像素）
}

/** 辅助线插件配置 */
export interface GuidelinesPluginOptions {
    style?: Partial<GuidelinesStyle>;
    enabled?: boolean;              // 是否启用辅助线
    allowedCategories?: Category[]; // 允许参与对齐的元素类型
    canvasSnap?: boolean;           // 是否启用画布边缘/中心对齐，默认true
}
