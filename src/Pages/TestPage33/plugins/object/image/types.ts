import { type ObjectData } from "../../../core";

/** 图片内部数据（序列化用） */
export interface ImageData {
    id: string;
    src: string;
    left: number;
    top: number;
    scaleX: number;
    scaleY: number;
    angle: number;
    originX: string;
    originY: string;
    crossOrigin: string | null;
}

/** 图片需要额外序列化的属性 */
export const EXTRA_PROPS = ["data", "src", "crossOrigin"] as const;

// ─── 轻量快照类型 ─────────────────────────────────────────

/** 变换矩阵类型 [a, b, c, d, e, f] */
export type TransformMatrix = [number, number, number, number, number, number];

/**
 * 图片轻量快照数据
 * - modify 操作：只存 matrix
 * - add/remove 操作：存完整信息
 */
export interface ImageSnapshotData extends Record<string, unknown> {
    /** 变换矩阵（必须） */
    matrix: TransformMatrix;
    /** 图片源（add/remove 时需要） */
    src?: string;
    /** 对象元数据（add/remove 时需要） */
    objectData?: ObjectData;
}

// ─── 图片样式配置 ─────────────────────────────────────────

/** 图片样式配置（预留扩展） */
export interface ImageStyle {
    /** 默认缩放比例上限 */
    maxScale: number;
    /** 画布占比 */
    canvasRatio: number;
}

/** 默认图片样式 */
export const DEFAULT_IMAGE_STYLE: ImageStyle = {
    maxScale: 1,
    canvasRatio: 0.8,
};

// ─── 模式配置 ─────────────────────────────────────────

import { EditorMode } from "../../mode/ModePlugin";

/** 各模式下图片的交互配置 */
export const IMAGE_MODE_CONFIG: Record<
    EditorMode,
    { selectable: boolean; evented: boolean }
> = {
    [EditorMode.Select]: { selectable: true, evented: true },
    [EditorMode.Pan]: { selectable: false, evented: false },
    [EditorMode.DrawRect]: { selectable: false, evented: false },
    [EditorMode.RangeSelect]: { selectable: false, evented: true },
};