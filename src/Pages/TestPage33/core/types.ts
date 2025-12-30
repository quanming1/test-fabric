import type { Canvas, FabricObject } from "fabric";

/** 标记点数据 */
export interface MarkPoint {
  id: string;
  rectId: string;
  /** 归一化坐标 (0~1)，以 rect 左上角为原点 */
  nx: number;
  ny: number;
}

/** 工具栏位置 */
export interface ToolbarPosition {
  x: number;
  y: number;
  visible: boolean;
}

/** 标记点视图坐标 */
export interface PointView {
  x: number;
  y: number;
}

/** 编辑器事件类型 */
export interface EditorEvents {
  "zoom:change": (zoom: number) => void;
  "selection:change": (obj: FabricObject | null) => void;
  "toolbar:update": (pos: ToolbarPosition) => void;
  "markers:change": (markers: MarkPoint[]) => void;
  "markers:viewUpdate": (views: Record<string, PointView>) => void;
  resize: (size: { width: number; height: number }) => void;
}

/** 编辑器配置 */
export interface EditorOptions {
  preserveObjectStacking?: boolean;
  stopContextMenu?: boolean;
  selection?: boolean;
}

/** 生成唯一 ID */
export function genId(prefix = "id") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(16).slice(2)}`;
}
