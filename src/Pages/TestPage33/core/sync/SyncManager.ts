import type { CanvasEditor } from "../editor/CanvasEditor";
import type { HistoryRecord } from "../history/types";
import type {
    SyncEvent,
    SyncManagerOptions,
    PushEventResponse,
    InitDataResponse,
    SSEMessage,
} from "./types";

/** 生成客户端唯一标识 */
const generateClientId = (): string => {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
};

/** 获取或创建 clientId */
const getOrCreateClientId = (): string => {
    const key = "canvas_sync_client_id";
    let clientId = sessionStorage.getItem(key);
    if (!clientId) {
        clientId = generateClientId();
        sessionStorage.setItem(key, clientId);
    }
    return clientId;
};

const DEFAULT_OPTIONS: Required<SyncManagerOptions> = {
    fullSyncThreshold: 15,
    apiBasePath: "http://localhost:3001/api/canvas/sync",
    sseUrl: "http://localhost:3001/api/canvas/sync/sse",
};

/**
 * 同步管理器
 * 职责：管理多端画布同步的所有逻辑
 */
export class SyncManager {
    private editor: CanvasEditor;
    private options: Required<SyncManagerOptions>;
    private _clientId: string;
    private eventSource: EventSource | null = null;
    private initialized = false;

    constructor(editor: CanvasEditor, options?: SyncManagerOptions) {
        this.editor = editor;
        this.options = { ...DEFAULT_OPTIONS, ...options };
        this._clientId = getOrCreateClientId();
    }

    /** 当前客户端唯一标识 */
    get clientId(): string {
        return this._clientId;
    }

    /**
     * 初始化同步
     * 获取全量数据和增量事件，应用到画布，然后建立 SSE 连接
     */
    async initialize(): Promise<void> {
        if (this.initialized) return;

        try {
            // 1. 获取初始化数据
            const data = await this.fetchInitData();

            // 2. 应用全量数据
            if (data.canvasJSON) {
                const ioPlugin = this.editor.getPlugin<any>("io");
                if (ioPlugin) {
                    await ioPlugin.import(data.canvasJSON, { clearCanvas: true });
                }
            }
            console.log("this.editor.canvas.getObjects()", this.editor.canvas.getObjects());
            console.log('data.events', data.events)

            // 3. 按顺序应用增量事件
            if (data.events && data.events.length > 0) {
                this.editor.history.pause();
                try {
                    for (const event of data.events) {
                        await this.applySnapshot(event.snapshot);
                    }
                } finally {
                    this.editor.history.resume();
                }
            }

            // 4. 建立 SSE 连接
            this.connectSSE();

            this.initialized = true;
            console.log("[SyncManager] 初始化完成, clientId:", this._clientId);

            // 5. 广播同步初始化完成事件
            this.editor.eventBus.emit("sync:initialized");
        } catch (error) {
            console.error("[SyncManager] 初始化失败:", error);
            throw error;
        }
    }

    /**
     * 推送同步事件到服务端
     */
    async pushEvent(snapshot: HistoryRecord | HistoryRecord[]): Promise<void> {
        try {
            const response = await this.postEvent(snapshot);

            // 判断是否需要触发全量同步
            if (response.eventArrayLength >= this.options.fullSyncThreshold) {
                await this.triggerFullSync();
            }
        } catch (error) {
            console.error("[SyncManager] 推送事件失败:", error);
            throw error;
        }
    }

    /**
     * 处理接收到的同步事件
     */
    async handleReceivedEvent(event: SyncEvent): Promise<void> {
        // 跳过自己发起的事件
        if (event.clientId === this._clientId) {
            return;
        }

        console.log("[SyncManager] 收到远程事件:", event.seq);

        // 暂停历史记录，应用快照
        this.editor.history.pause();
        try {
            await this.applySnapshot(event.snapshot);
        } finally {
            this.editor.history.resume();
        }

        // 清空本地历史栈
        this.editor.history.clear();
    }

    /**
     * 触发全量同步
     */
    async triggerFullSync(): Promise<void> {
        try {
            const ioPlugin = this.editor.getPlugin<any>("io");
            if (!ioPlugin) {
                console.warn("[SyncManager] 未找到 io 插件，无法执行全量同步");
                return;
            }

            // 导出画布数据
            const canvasJSON = await ioPlugin.export();

            // 上传全量数据
            await this.postFullData(canvasJSON);

            console.log("[SyncManager] 全量同步完成");
        } catch (error) {
            console.error("[SyncManager] 全量同步失败:", error);
            throw error;
        }
    }

    /**
     * 销毁同步管理器
     */
    destroy(): void {
        this.disconnectSSE();
        this.initialized = false;
    }

    // ─── 私有方法 ─────────────────────────────────────────

    /**
     * 应用快照到画布（复用 redo 逻辑）
     */
    private async applySnapshot(snapshot: HistoryRecord | HistoryRecord[]): Promise<void> {
        const records = Array.isArray(snapshot) ? snapshot : [snapshot];

        for (const record of records) {
            const plugin = this.editor.getPlugin(record.pluginName);
            if (!plugin) {
                console.warn(`[SyncManager] 插件 "${record.pluginName}" 未找到`);
                continue;
            }

            if (typeof (plugin as any).applyRedo === "function") {
                await (plugin as any).applyRedo(record);
            }
        }

        this.editor.canvas.requestRenderAll();
    }

    /**
     * 建立 SSE 连接
     */
    private connectSSE(): void {
        if (this.eventSource) return;

        const url = `${this.options.sseUrl}?clientId=${this._clientId}`;
        this.eventSource = new EventSource(url);

        this.eventSource.onmessage = (event) => {
            try {
                const message: SSEMessage = JSON.parse(event.data);
                if (message.type === "sync_event") {
                    this.handleReceivedEvent(message.data);
                }
            } catch (error) {
                console.error("[SyncManager] 解析 SSE 消息失败:", error);
            }
        };

        this.eventSource.onerror = (error) => {
            console.error("[SyncManager] SSE 连接错误:", error);
            // 可以在这里实现重连逻辑
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

    /**
     * 获取初始化数据
     */
    private async fetchInitData(): Promise<InitDataResponse> {
        const response = await fetch(`${this.options.apiBasePath}/full_data`);
        if (!response.ok) {
            throw new Error(`获取初始化数据失败: ${response.status}`);
        }
        return response.json();
    }

    /**
     * 推送同步事件
     */
    private async postEvent(snapshot: HistoryRecord | HistoryRecord[]): Promise<PushEventResponse> {
        const body: Omit<SyncEvent, "seq"> = {
            clientId: this._clientId,
            snapshot,
        };

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

    /**
     * 上传全量数据
     */
    private async postFullData(canvasJSON: object): Promise<void> {
        const body = {
            clientId: this._clientId,
            canvasJSON,
        };

        const response = await fetch(`${this.options.apiBasePath}/full`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            throw new Error(`上传全量数据失败: ${response.status}`);
        }
    }
}
