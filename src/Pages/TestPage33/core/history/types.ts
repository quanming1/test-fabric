/**
 * 历史记录类型
 */
export type HistoryActionType = "add" | "remove" | "modify";

/**
 * 对象快照 - 记录对象的状态
 */
export interface ObjectSnapshot {
    id: string;
    /** 对象序列化数据（插件自行决定存什么） */
    data: Record<string, unknown>;
}

/**
 * 历史记录项
 */
export interface HistoryRecord {
    /** 记录唯一ID */
    id: string;
    /** 操作类型 */
    type: HistoryActionType;
    /** 负责处理的插件名称 */
    pluginName: string;
    /** 时间戳 */
    timestamp: number;
    /** 操作的对象ID列表（支持批量） */
    objectIds: string[];
    /** 操作前状态 */
    before?: ObjectSnapshot[];
    /** 操作后状态 */
    after?: ObjectSnapshot[];
}

/**
 * History 配置项
 */
export interface HistoryOptions {
    /** 历史记录上限，默认 50 */
    maxRecords?: number;
}

/**
 * History 事件
 */
export interface HistoryEvents {
    /** 记录变化 */
    "history:change": { canUndo: boolean; canRedo: boolean };
    /** 执行撤销 */
    "history:undo": HistoryRecord;
    /** 执行重做 */
    "history:redo": HistoryRecord;
}
