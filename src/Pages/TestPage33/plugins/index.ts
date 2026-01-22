// Base
export { BasePlugin, type Plugin } from "./base/Plugin";

// Viewport
export { ZoomPlugin } from "./viewport/ZoomPlugin";

// Selection
export { SelectionPlugin } from "./selection/SelectionPlugin";

// Mode
export { ModePlugin, EditorMode } from "./mode/ModePlugin";

// Draw
export { DrawPlugin } from "./draw/DrawPlugin";

// Object
export { MarkerPlugin, PointRenderer, RegionRenderer } from "./object/marker";
export type { PointStyle, PointData, RegionStyle, RegionData } from "./object/marker";
// 兼容旧类型名
export type { PointStyle as MarkerStyle, PointData as MarkerData } from "./object/marker";
export { ImagePlugin } from "./object/image";

// IO (Import/Export)
export { ImportExportPlugin } from "./io";
export type { ExportOptions, ImportOptions, CanvasJSON, IOEvents } from "./io";

// Guidelines
export { GuidelinesPlugin } from "./guidelines";
export type { GuidelinesPluginOptions, GuidelinesStyle, Guideline } from "./guidelines";

// Controls
export { ControlsPlugin } from "./controls";
export type { ControlsStyle, ControlsPluginOptions } from "./controls";

// Toolbar
export { ToolbarPlugin } from "./toolbar";
