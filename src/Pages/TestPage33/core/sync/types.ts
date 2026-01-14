import type { HistoryRecord } from "../history/types";

/**
 * 同步事件
 */
export interface SyncEvent {
    /** 全局序号，由服务端分配 */
    seq?: number;
    /** 操作发起者的客户端标识 */
    clientId: string;
    /** 操作的快照数据 */
    snapshot: HistoryRecord | HistoryRecord[];
}

/**
 * 推送同步事件的响应
 */
export interface PushEventResponse {
    /** 服务端分配的全局序号 */
    seq: number;
    /** 当前事件数组的长度 */
    eventArrayLength: number;
}

/**
 * 获取初始化数据的响应
 */
export interface InitDataResponse {
    /** 画布全量数据，首次使用时可能为 null */
    canvasJSON: object | null;
    /** 增量事件数组，按 seq 升序排列 */
    events: SyncEvent[];
}

/**
 * SSE 广播的消息格式
 */
export interface SSEMessage {
    type: "sync_event";
    data: SyncEvent;
}

/**
 * 同步管理器配置
 */
export interface SyncManagerOptions {
    /** 触发全量同步的事件数量阈值，默认 15 */
    fullSyncThreshold?: number;
    /** API 基础路径 */
    apiBasePath?: string;
    /** SSE 连接地址 */
    sseUrl?: string;
}
