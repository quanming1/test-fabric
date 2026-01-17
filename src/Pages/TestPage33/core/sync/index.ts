export { SyncManager } from "./SyncManager";
export { BaseSyncEventHandler, ClientChangeHandler, ServerAddImageHandler } from "./handlers";

// 导出命名空间
export { Handler, API } from "./types";

// 导出类型
export type {
    SyncEvent,
    SyncEventType,
    SyncEventData,
    ClientChangeData,
    ServerAddImageData,
    SyncManagerOptions,
} from "./types";
