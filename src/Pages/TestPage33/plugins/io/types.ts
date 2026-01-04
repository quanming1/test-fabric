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

/** JSON 导出数据结构 */
export interface CanvasJSON {
    version: string;
    objects: object[];
    background?: string;
    /** 各插件的数据 */
    plugins?: Record<string, unknown>;
}

/** 导入导出事件 */
export interface IOEvents {
    "io:export:start": void;
    "io:export:complete": { data: CanvasJSON };
    "io:export:error": { error: Error };
    "io:import:start": void;
    "io:import:complete": { objects: object[] };
    "io:import:error": { error: Error };
}
