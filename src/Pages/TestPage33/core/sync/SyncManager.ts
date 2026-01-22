import type { CanvasEditor } from "../editor/CanvasEditor";
import type { HistoryRecord, HistoryEntry, ObjectSnapshot } from "../history/types";
import type { ImageExportData } from "../../plugins/io/types";
import type {
    SyncManagerOptions,
    SyncEventItem,
    SyncEventData,
    API,
} from "./types";

// ─── 工具函数 ─────────────────────────────────────────

let syncRecordIdCounter = 0;
const genSyncRecordId = () => `sync_${Date.now()}_${++syncRecordIdCounter}`;

/** 生成唯一的客户端 ID */
const genClientId = () => `client_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

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
    private clientId: string;                                  // 客户端唯一标识

    constructor(editor: CanvasEditor, options?: SyncManagerOptions) {
        this.editor = editor;
        this.options = { ...DEFAULT_OPTIONS, ...options };
        this.clientId = genClientId();
        console.log("[SyncManager] clientId:", this.clientId);
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
     * 将事件转换为 HistoryRecord，通过 History 的 redo 逻辑应用
     */
    async handleReceivedEvent(eventData: API.SSEEventData): Promise<void> {
        const { sequence_id, event_type, event_data } = eventData;

        // 跳过自己发出的事件
        if (event_data.client_id === this.clientId) {
            console.log(`[SyncManager] 跳过自己的事件: client_id=${event_data.client_id}`);
            return;
        }

        // 版本控制：只处理比本地版本号大的事件
        if (sequence_id <= this.localSequenceId) {
            console.log(`[SyncManager] 跳过旧事件: sequence_id=${sequence_id}, local=${this.localSequenceId}`);
            return;
        }

        console.log("[SyncManager] 处理事件:", sequence_id, event_type);

        // 更新本地版本号
        this.localSequenceId = sequence_id;

        // 打印变更前后的位置（调试用）
        const id = event_data.id;
        const existingObj = this.editor.metadata.getById(id);
        if (existingObj) {
            // 使用 calcTransformMatrix 获取绝对坐标，避免 ActiveSelection 局部坐标问题
            const currentMatrix = existingObj.calcTransformMatrix();
            console.log(`[SyncManager] 对象 ${id} 变更前位置: x=${currentMatrix[4]}, y=${currentMatrix[5]}`);
        }
        const newMatrix = (event_data as any).style?.matrix;
        if (newMatrix) {
            console.log(`[SyncManager] 对象 ${id} 变更后位置: x=${newMatrix[4]}, y=${newMatrix[5]}`);
        }

        // 将 ImageExportData 转换为 HistoryRecord，通过 HistoryManager 应用
        const record = this.convertToHistoryRecord(event_data);
        await this.editor.history.applyRecord(record, "redo", { pauseRecord: true });

        // 收到远程事件后清空本地历史记录
        this.editor.history.clear();
        console.log("[SyncManager] 已清空本地历史记录");
    }

    /**
     * 推送同步事件到服务端
     * @param entry 历史记录
     * @param options.isUndo 是否为撤销操作，撤销时会反转 entry
     */
    async pushEvent(entry: HistoryEntry, options?: { isUndo?: boolean }): Promise<void> {
        try {
            const { isUndo = false } = options ?? {};
            const targetEntry = isUndo ? this.createReversedEntry(entry) : entry;
            const records = Array.isArray(targetEntry) ? targetEntry : [targetEntry];
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

    // ─── 数据转换 ─────────────────────────────────────────

    /**
     * 创建反向的 entry（用于撤销同步）
     */
    private createReversedEntry(entry: HistoryEntry): HistoryEntry {
        if (Array.isArray(entry)) {
            return entry.map((record) => this.createReversedRecord(record)).reverse();
        }
        return this.createReversedRecord(entry);
    }

    /**
     * 创建反向的 record
     * - add → remove
     * - remove → add
     * - modify → modify（before/after 互换）
     */
    private createReversedRecord(record: HistoryRecord): HistoryRecord {
        const reversed: HistoryRecord = {
            ...record,
            id: genSyncRecordId(),
            timestamp: Date.now(),
        };

        switch (record.type) {
            case "add":
                reversed.type = "remove";
                reversed.before = record.after;
                reversed.after = undefined;
                break;
            case "remove":
                reversed.type = "add";
                reversed.after = record.before;
                reversed.before = undefined;
                break;
            case "modify":
                reversed.before = record.after;
                reversed.after = record.before;
                break;
        }

        return reversed;
    }

    /**
     * 将 SyncEventData（ImageExportData + client_id）转换为 HistoryRecord
     */
    private convertToHistoryRecord(eventData: SyncEventData): HistoryRecord {
        const isDelete = eventData.metadata?.is_delete === true;
        const id = eventData.id;
        // 移除 client_id，只保留对象导出数据
        const { client_id, ...exportData } = eventData;
        const snapshot: ObjectSnapshot = { id, data: exportData };

        // 根据 metadata.category 确定 pluginName，默认 "image"
        const pluginName = eventData.metadata?.category ?? "image";

        if (isDelete) {
            // 删除操作
            return {
                id: `sync_${Date.now()}`,
                type: "remove",
                pluginName,
                timestamp: Date.now(),
                objectIds: [id],
                before: [snapshot],
                needSync: false,
            };
        } else {
            // 检查是否已存在（modify）还是新增（add）
            const existingObj = this.editor.metadata.getById(id);
            if (existingObj) {
                // 修改操作
                return {
                    id: `sync_${Date.now()}`,
                    type: "modify",
                    pluginName,
                    timestamp: Date.now(),
                    objectIds: [id],
                    after: [snapshot],
                    needSync: false,
                };
            } else {
                // 添加操作
                return {
                    id: `sync_${Date.now()}`,
                    type: "add",
                    pluginName,
                    timestamp: Date.now(),
                    objectIds: [id],
                    after: [snapshot],
                    needSync: false,
                };
            }
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
                            id: snapshot.id,
                            event_type: "client:change",
                            event_data: {
                                ...exportData,
                                client_id: this.clientId,
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
                            id: snapshot.id,
                            event_type: "client:change",
                            event_data: {
                                ...exportData,
                                client_id: this.clientId,
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
