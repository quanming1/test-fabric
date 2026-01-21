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
  data: unknown;
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
  /** 是否需要同步到其他客户端 */
  needSync?: boolean;
}

/**
 * 历史栈元素
 * - 单条操作：HistoryRecord
 * - 集体操作（批处理）：HistoryRecord[]
 *
 * 说明：
 * 某些 UI/交互（如多选复制、批量删除）在概念上是一次操作，
 * 但底层可能会由多个插件分别产生多条 HistoryRecord。
 * 通过 HistoryEntry 支持把这些记录合并为历史栈中的“一个元素”，从而一次撤销/重做完成集体回放。
 */
export type HistoryEntry = HistoryRecord | HistoryRecord[];

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

/**
 * addRecord 方法的选项
 */
export interface AddRecordOptions {
  /** 是否需要同步到其他客户端，默认 false */
  needSync?: boolean;
}
