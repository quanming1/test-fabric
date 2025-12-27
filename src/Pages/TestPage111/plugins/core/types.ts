import type React from "react";
import type { Canvas } from "fabric";

export type PluginDisposer = () => void;

export interface FabricPluginContext {
  canvas: Canvas;
  canvasEl: HTMLCanvasElement;
  containerEl: HTMLDivElement;
}

export interface FabricPlugin {
  id: string;
  init: (ctx: FabricPluginContext) => PluginDisposer | void;
  toolbar?: React.ReactNode;
}
