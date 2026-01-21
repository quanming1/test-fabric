/** 导出选项 */
export interface ExportOptions {
    /** 是否下载文件，传入文件名则下载 */
    download?: string;
}

/** 导入选项 */
export interface ImportOptions {
    /** 是否清空画布后导入 */
    clearCanvas?: boolean;
}

import type { ImageObjectData } from "../../core";

/** 样式数据 */
export interface StyleData {
    /** 变换矩阵 [a, b, c, d, e, f] */
    matrix: [number, number, number, number, number, number];
}

/** 标准图片导出数据格式 */
export interface ImageExportData {
    id: string;
    metadata: ImageObjectData;
    style: StyleData;
}

/** JSON 导出数据结构 - 图片对象数组 */
export type CanvasJSON = ImageExportData[];

/** 导入导出事件 */
export interface IOEvents {
    "io:export:start": void;
    "io:export:complete": { data: CanvasJSON };
    "io:export:error": { error: Error };
    "io:import:start": void;
    "io:import:complete": { objects: object[] };
    "io:import:error": { error: Error };
}

