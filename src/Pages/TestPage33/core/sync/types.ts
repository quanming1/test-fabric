import type { HistoryRecord } from "../history/types";
import type { CanvasEditor } from "../editor/CanvasEditor";

// ═══════════════════════════════════════════════════════════════
// 核心类型（顶层导出，高频使用）
// ═══════════════════════════════════════════════════════════════

/**
 * 同步事件类型枚举
 * - client:change: 前端客户端发起的画布变更
 * - server:add_image: 后端主动添加图片
 */
export type SyncEventType = "client:change" | "server:add_image";

/**
 * 同步事件
 */
export interface SyncEvent {
    /** 全局序号，由服务端分配 */
    seq?: number;
    /** 事件类型 */
    eventType: SyncEventType;
    /** 事件数据，根据 eventType 不同而不同 */
    data: SyncEventData;
}

/**
 * 同步事件数据（联合类型）
 */
export type SyncEventData = ClientChangeData | ServerAddImageData;

/**
 * 前端变更事件数据
 */
export interface ClientChangeData {
    clientId: string;
    snapshot: HistoryRecord | HistoryRecord[];
}

/**
 * 后端添加图片事件数据
 */
export interface ServerAddImageData {
    urls: string[];
}

// ═══════════════════════════════════════════════════════════════
// Handler 命名空间
// ═══════════════════════════════════════════════════════════════

/**
 * Handler 相关类型
 */
export namespace Handler {
    /**
     * Handler 处理事件时的上下文
     * 提供 Handler 执行所需的依赖
     */
    export interface Context {
        editor: CanvasEditor;
        clientId: string;
        applySnapshot: (snapshot: HistoryRecord | HistoryRecord[]) => Promise<void>;
    }

    /**
     * 带类型约束的同步事件
     * 将 SyncEvent.data 的类型收窄为具体的 T
     * @template T 事件数据类型
     */
    export type Event<T extends SyncEventData> = Omit<SyncEvent, "data"> & { data: T };

    /**
     * 同步事件处理器接口
     * 每种 eventType 对应一个 Handler 实现
     * @template T 事件数据类型，约束为 SyncEventData 的子类型
     */
    export interface IHandler<T extends SyncEventData = SyncEventData> {
        /** 该 Handler 负责处理的事件类型 */
        readonly eventType: SyncEventType;

        /**
         * 处理接收到的同步事件
         * @param event 完整的同步事件（包含 seq、eventType、data）
         * @param context 处理上下文
         */
        handle(event: Event<T>, context: Context): Promise<void>;

        /**
         * 将事件转换为 HistoryRecord（可选）
         * 用于初始化时批量应用事件
         * @param event 完整的同步事件
         */
        toRecords?(event: Event<T>): HistoryRecord[];
    }
}



// ═══════════════════════════════════════════════════════════════
// API 命名空间
// ═══════════════════════════════════════════════════════════════

/**
 * API 通信相关类型
 */
export namespace API {
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
}



// ═══════════════════════════════════════════════════════════════
// 配置类型
// ═══════════════════════════════════════════════════════════════

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
