import type { FabricObject } from "fabric";

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

/** 辅助线命中信息 */
/** 辅助线命中信息 */
export interface GuidelineSnapInfo {
  targetId: string;  // 被吸附的目标元素ID
  direction: "horizontal" | "vertical";
}

/** 编辑器事件类型 */
export interface EditorEvents {
  "zoom:change": (zoom: number) => void;
  "selection:change": (obj: FabricObject | null) => void;
  "toolbar:update": (pos: ToolbarPosition) => void;
  "markers:change": (markers: MarkPoint[]) => void;
  "markers:viewUpdate": (views: Record<string, PointView>) => void;
  "layer:change": () => void;
  resize: (size: { width: number; height: number }) => void;
  "guideline:snap": (info: GuidelineSnapInfo) => void;
}