export type ToolMode = "select" | "rect";

export type ScreenFixedMeta = {
  /**
   * 标记为“屏幕固定大小”对象：会在 viewport zoom 变化时自动应用反向缩放，
   * 从而保持屏幕上的视觉大小不变（适用于点/矩形/图片/文本等）。
   */
  __screenFixed?: boolean;
  __screenFixedBaseStrokeWidth?: number;
};

export type NormalRectMeta = {
  __normalRect?: boolean;
  __markers?: Array<import("fabric").FabricObject>;
};

export type PersistFollowMeta = {
  ownerId: string;
  mode: "localPoint";
  local: { x: number; y: number };
};

export type PersistMeta = {
  __id?: string;
  __follow?: PersistFollowMeta;
  __meta?: Record<string, any>;
};
