// Editor
export { CanvasEditor } from "./editor/CanvasEditor";

// Event
export { EventBus } from "./event/EventBus";

// Object
export { ObjectMetadata } from "./object/ObjectMetadata";
export { Category } from "./object/types";
export type { ObjectData, ImageObjectData } from "./object/types";

// History
export { HistoryManager, BaseHistoryHandler } from "./history";
export type {
    HistoryOptions,
    HistoryRecord,
    HistoryActionType,
    ObjectSnapshot,
    HistoryEvents,
    AddRecordOptions,
} from "./history";

// Sync
export { SyncManager } from "./sync";
export { API } from "./sync";
export type {
    SyncEventType,
    SyncEventData,
    ObjectExportData,
    SyncManagerOptions,
} from "./sync";

// DOM Layer
export { DOMLayerManager } from "./dom";
export { DOMLayerRenderer } from "./dom/DOMLayerRenderer";
export type { DOMLayer, DOMLayerConfig, DOMLayerProps, DOMLayerEvents } from "./dom";

// Utils
export { CoordinateHelper, type ScreenPoint } from "./utils/coordinateUtils";
export { genId } from "./utils/genId";

// Render
export { BaseRenderer } from "./render";

// Types
export type {
    MarkPoint,
    ToolbarPosition,
    PointView,
    EditorEvents,
} from "./types";
