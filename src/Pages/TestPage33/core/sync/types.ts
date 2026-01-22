// ═══════════════════════════════════════════════════════════════
// 核心类型（顶层导出，高频使用）
// ═══════════════════════════════════════════════════════════════

import type { ImageExportData } from "../../plugins/io/types";

/**
 * 同步事件类型枚举
 * - client:change: 前端客户端发起的画布变更
 * - server:add_image: 后端主动添加图片
 */
export type SyncEventType = "client:change" | "server:add_image";

/**
 * 对象导出数据的联合类型
 * 目前只有图片类型，后续可扩展其他类型（如 TextExportData、ShapeExportData 等）
 */
export type ObjectExportData = ImageExportData;

/**
 * 同步事件数据
 * = 对象导出数据 + client_id
 */
export type SyncEventData = ObjectExportData & {
    /** 客户端唯一标识，用于过滤自己发出的事件 */
    client_id?: string;
};

// ═══════════════════════════════════════════════════════════════
// 推送端类型（发送到服务端的格式）
// ═══════════════════════════════════════════════════════════════

/**
 * 单个同步事件项（推送格式）
 */
export interface SyncEventItem {
    /** 操作的对象 ID */
    id: string;
    /** 事件类型 */
    event_type: SyncEventType;
    /** 事件数据 */
    event_data: SyncEventData;
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
        /** 服务端当前的序列号 */
        sequence_id: number;
    }

    /**
     * 获取初始化数据的响应
     */
    export interface InitDataResponse {
        /** 画布全量数据（对象导出数据数组） */
        canvasJSON: ObjectExportData[] | null;
        /** 当前序列号 */
        sequence_id: number;
    }

    /**
     * SSE 广播的消息格式
     */
    export interface SSEMessage {
        type: "sync_event" | "connected";
        data?: SSEEventData;
    }

    /**
     * SSE 事件数据
     */
    export interface SSEEventData {
        sequence_id: number;
        event_type: string;
        event_data: SyncEventData;
    }
}



// ═══════════════════════════════════════════════════════════════
// 配置类型
// ═══════════════════════════════════════════════════════════════

/**
 * 同步管理器配置
 */
export interface SyncManagerOptions {
    /** API 基础路径 */
    apiBasePath?: string;
    /** SSE 连接地址 */
    sseUrl?: string;
}
