import type { CanvasEditor } from "../editor/CanvasEditor";
import type { HistoryRecord } from "../history/types";
import type {
    SyncEvent,
    SyncEventType,
    SyncManagerOptions,
    Handler,
    API,
} from "./types";
import { ClientChangeHandler, ServerAddImageHandler } from "./handlers";

// ─── 工具函数 ─────────────────────────────────────────

/** 生成客户端唯一标识（UUID v4 格式） */
const generateClientId = (): string => {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
};

/** 获取或创建 clientId，存储在 sessionStorage */
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
 *
 * 职责：
 * 1. 管理 SSE 连接，接收服务端广播的事件
 * 2. 分发事件到对应的 Handler 处理
 * 3. 推送本地事件到服务端
 * 4. 管理全量同步和初始化流程
 *
 * 采用策略模式：SyncManager 只负责分发，具体处理逻辑由 Handler 实现
 */
export class SyncManager {
    private editor: CanvasEditor;                              // 编辑器实例
    private options: Required<SyncManagerOptions>;             // 配置选项
    private _clientId: string;                                 // 当前客户端唯一标识
    private eventSource: EventSource | null = null;            // SSE 连接
    private initialized = false;                               // 是否已初始化
    private handlers: Map<SyncEventType, Handler.IHandler>;   // 事件处理器注册表

    constructor(editor: CanvasEditor, options?: SyncManagerOptions) {
        this.editor = editor;
        this.options = { ...DEFAULT_OPTIONS, ...options };
        this._clientId = getOrCreateClientId();
        this.handlers = new Map();

        // 注册默认的事件处理器
        this.registerDefaultHandlers();
    }

    /** 当前客户端唯一标识 */
    get clientId(): string {
        return this._clientId;
    }

    // ─── Handler 注册机制 ─────────────────────────────────────────

    /**
     * 注册事件处理器
     * @param handler 处理器实例
     */
    registerHandler(handler: Handler.IHandler): void {
        this.handlers.set(handler.eventType, handler);
        console.log(`[SyncManager] 注册 Handler: ${handler.eventType}`);
    }

    /** 注册默认的事件处理器 */
    private registerDefaultHandlers(): void {
        this.registerHandler(new ClientChangeHandler());
        this.registerHandler(new ServerAddImageHandler());
    }


    // ─── 初始化 ─────────────────────────────────────────

    /**
     * 初始化同步
     * 流程：获取全量数据 → 应用增量事件 → 建立 SSE 连接
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

            console.log("[SyncManager] 画布对象:", this.editor.canvas.getObjects());
            console.log("[SyncManager] 增量事件:", data.events);

            // 3. 按顺序应用增量事件
            if (data.events && data.events.length > 0) {
                this.editor.history.pause();
                try {
                    for (const event of data.events) {
                        await this.applyEventOnInit(event);
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
     * 初始化时应用单个事件
     * 使用 Handler 的 toRecords 方法转换数据
     */
    private async applyEventOnInit(event: SyncEvent): Promise<void> {
        const handler = this.handlers.get(event.eventType);

        if (!handler) {
            console.warn(`[SyncManager] 未找到 Handler: ${event.eventType}`);
            return;
        }

        // 如果 Handler 实现了 toRecords，使用它转换数据
        if (handler.toRecords) {
            const records = handler.toRecords(event as any);
            await this.applySnapshot(records);
        }
    }

    // ─── 事件处理 ─────────────────────────────────────────

    /**
     * 处理接收到的同步事件（SSE 推送）
     * 根据 eventType 分发到对应的 Handler
     */
    async handleReceivedEvent(event: SyncEvent): Promise<void> {
        console.log("[SyncManager] 收到事件:", event.seq, event.eventType);

        const handler = this.handlers.get(event.eventType);

        if (!handler) {
            console.warn(`[SyncManager] 未知的事件类型: ${event.eventType}`);
            return;
        }

        // 构建处理上下文
        const context: Handler.Context = {
            editor: this.editor,
            clientId: this._clientId,
            applySnapshot: this.applySnapshot.bind(this),
        };

        // 传入完整的 event，Handler 可以访问 seq 等信息
        await handler.handle(event as any, context);
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
     * 触发全量同步
     */
    async triggerFullSync(): Promise<void> {
        try {
            const ioPlugin = this.editor.getPlugin<any>("io");
            if (!ioPlugin) {
                console.warn("[SyncManager] 未找到 io 插件，无法执行全量同步");
                return;
            }

            const canvasJSON = await ioPlugin.export();
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
        this.handlers.clear();
        this.initialized = false;
    }


    // ─── 私有方法 ─────────────────────────────────────────

    /**
     * 应用快照到画布
     * 复用各插件的 applyRedo 方法
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
                const message: API.SSEMessage = JSON.parse(event.data);
                if (message.type === "sync_event") {
                    this.handleReceivedEvent(message.data);
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
    private async postEvent(snapshot: HistoryRecord | HistoryRecord[]): Promise<API.PushEventResponse> {
        const body: SyncEvent = {
            eventType: "client:change",
            data: {
                clientId: this._clientId,
                snapshot,
            },
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

    /** 上传全量数据 */
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
