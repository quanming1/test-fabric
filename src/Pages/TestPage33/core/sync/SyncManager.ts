import type { CanvasEditor } from "../editor/CanvasEditor";
import type { HistoryRecord } from "../history/types";
import type {
    SyncManagerOptions,
    SyncEventItem,
    API,
} from "./types";
import type { ImageExportData } from "../../plugins/io/types";

// ─── 工具函数 ─────────────────────────────────────────

const DEFAULT_OPTIONS: Required<SyncManagerOptions> = {
    apiBasePath: "http://localhost:3001/api/canvas/sync",
    sseUrl: "http://localhost:3001/api/canvas/sync/sse",
};

/**
 * 同步管理器
 *
 * 职责：
 * 1. 管理 SSE 连接，接收服务端广播的事件
 * 2. 推送本地事件到服务端
 * 3. 应用远程事件到画布
 * 4. 使用 sequence_id 做版本控制，避免重复处理
 */
export class SyncManager {
    private editor: CanvasEditor;                              // 编辑器实例
    private options: Required<SyncManagerOptions>;             // 配置选项
    private eventSource: EventSource | null = null;            // SSE 连接
    private initialized = false;                               // 是否已初始化
    private localSequenceId = 0;                               // 本地版本号

    constructor(editor: CanvasEditor, options?: SyncManagerOptions) {
        this.editor = editor;
        this.options = { ...DEFAULT_OPTIONS, ...options };
    }


    // ─── 初始化 ─────────────────────────────────────────

    /**
     * 初始化同步
     * 流程：获取全量数据 → 应用到画布 → 建立 SSE 连接
     */
    async initialize(): Promise<void> {
        if (this.initialized) return;

        try {
            // 1. 获取初始化数据
            const data = await this.fetchInitData();

            // 2. 记录当前版本号
            this.localSequenceId = data.sequence_id;

            // 3. 应用全量数据（直接是 ImageExportData 数组）
            if (data.canvasJSON && data.canvasJSON.length > 0) {
                const ioPlugin = this.editor.getPlugin<any>("io");
                if (ioPlugin) {
                    await ioPlugin.import(data.canvasJSON, { clearCanvas: true });
                }
            }

            console.log("[SyncManager] 画布对象:", this.editor.canvas.getObjects());
            console.log("[SyncManager] 当前 sequence_id:", this.localSequenceId);

            // 4. 建立 SSE 连接
            this.connectSSE();

            this.initialized = true;
            console.log("[SyncManager] 初始化完成");

            // 5. 广播同步初始化完成事件
            this.editor.eventBus.emit("sync:initialized");
        } catch (error) {
            console.error("[SyncManager] 初始化失败:", error);
            throw error;
        }
    }

    // ─── 事件处理 ─────────────────────────────────────────

    /**
     * 处理接收到的同步事件（SSE 推送）
     * 使用 sequence_id 做版本控制，只处理比本地版本号大的事件
     */
    async handleReceivedEvent(eventData: API.SSEEventData): Promise<void> {
        const { sequence_id, event_type, event_data } = eventData;

        // 版本控制：只处理比本地版本号大的事件
        if (sequence_id <= this.localSequenceId) {
            console.log(`[SyncManager] 跳过旧事件: sequence_id=${sequence_id}, local=${this.localSequenceId}`);
            return;
        }

        console.log("[SyncManager] 处理事件:", sequence_id, event_type);

        // 更新本地版本号
        this.localSequenceId = sequence_id;

        // 暂停历史记录
        this.editor.history.pause();
        try {
            // 检查是否是删除操作
            if (event_data.metadata?.is_delete) {
                // 删除操作：从画布移除对象
                const imagePlugin = this.editor.getPlugin<any>("image");
                if (imagePlugin) {
                    imagePlugin.remove([event_data.id], false);
                }
            } else {
                // 添加/修改操作：导入到画布
                const ioPlugin = this.editor.getPlugin<any>("io");
                if (ioPlugin) {
                    // 先检查是否已存在，存在则先删除
                    const existingObj = this.editor.metadata.getById(event_data.id);
                    if (existingObj) {
                        const imagePlugin = this.editor.getPlugin<any>("image");
                        if (imagePlugin) {
                            imagePlugin.remove([event_data.id], false);
                        }
                    }
                    // 导入新数据
                    await ioPlugin.import([event_data], { clearCanvas: false });
                }
            }
        } finally {
            this.editor.history.resume();
        }

        // 清空本地历史栈，避免状态不一致
        this.editor.history.clear();
    }

    /**
     * 推送同步事件到服务端
     * 将 HistoryRecord 转换为 SyncPushPayload 格式
     */
    async pushEvent(record: HistoryRecord | HistoryRecord[]): Promise<void> {
        try {
            const records = Array.isArray(record) ? record : [record];
            const events = this.convertToSyncEvents(records);

            if (events.length === 0) {
                console.warn("[SyncManager] 没有可推送的事件");
                return;
            }

            const response = await this.postEvent(events);
            // 更新本地版本号
            this.localSequenceId = response.sequence_id;
            console.log("[SyncManager] 推送成功, sequence_id:", this.localSequenceId);
        } catch (error) {
            console.error("[SyncManager] 推送事件失败:", error);
            throw error;
        }
    }

    /**
     * 将 HistoryRecord 转换为 SyncEventItem[]
     * - add/modify: 使用 after 快照，is_delete = false
     * - remove: 使用 before 快照，标记 is_delete = true
     */
    private convertToSyncEvents(records: HistoryRecord[]): SyncEventItem[] {
        const events: SyncEventItem[] = [];

        for (const record of records) {
            if (record.type === "remove") {
                // 删除操作：使用 before 快照，标记 is_delete = true
                if (record.before) {
                    for (const snapshot of record.before) {
                        const exportData = snapshot.data as ImageExportData;
                        events.push({
                            event_type: "client:change",
                            event_data: {
                                ...exportData,
                                metadata: {
                                    ...exportData.metadata,
                                    is_delete: true,
                                },
                            },
                        });
                    }
                }
            } else {
                // add/modify 操作：使用 after 快照
                if (record.after) {
                    for (const snapshot of record.after) {
                        const exportData = snapshot.data as ImageExportData;
                        events.push({
                            event_type: "client:change",
                            event_data: {
                                ...exportData,
                                metadata: {
                                    ...exportData.metadata,
                                    is_delete: false,
                                },
                            },
                        });
                    }
                }
            }
        }

        return events;
    }

    /**
     * 销毁同步管理器
     */
    destroy(): void {
        this.disconnectSSE();
        this.initialized = false;
    }

    /**
     * 建立 SSE 连接
     */
    private connectSSE(): void {
        if (this.eventSource) return;

        this.eventSource = new EventSource(this.options.sseUrl);

        this.eventSource.onmessage = (event) => {
            try {
                const message: API.SSEMessage = JSON.parse(event.data);
                if (message.type === "sync_event" && message.data) {
                    this.handleReceivedEvent(message.data);
                } else if (message.type === "connected") {
                    console.log("[SyncManager] SSE 连接成功");
                }
            } catch (error) {
                console.error("[SyncManager] 解析 SSE 消息失败:", error);
            }
        };

        this.eventSource.onerror = (error) => {
            console.error("[SyncManager] SSE 连接错误:", error);
        };

        console.log("[SyncManager] SSE 连接已建立");
    }

    /**
     * 断开 SSE 连接
     */
    private disconnectSSE(): void {
        if (this.eventSource) {
            this.eventSource.close();
            this.eventSource = null;
            console.log("[SyncManager] SSE 连接已断开");
        }
    }

    // ─── API 请求 ─────────────────────────────────────────

    /** 获取初始化数据 */
    private async fetchInitData(): Promise<API.InitDataResponse> {
        const response = await fetch(`${this.options.apiBasePath}/full_data`);
        if (!response.ok) {
            throw new Error(`获取初始化数据失败: ${response.status}`);
        }
        return response.json();
    }

    /** 推送同步事件 */
    private async postEvent(events: SyncEventItem[]): Promise<API.PushEventResponse> {
        const body = { events };

        const response = await fetch(`${this.options.apiBasePath}/event`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            throw new Error(`推送事件失败: ${response.status}`);
        }
        return response.json();
    }
}
