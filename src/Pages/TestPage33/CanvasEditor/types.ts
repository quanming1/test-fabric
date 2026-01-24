/**
 * CanvasEditor 组件类型定义
 */

import type { CSSProperties } from "react";
import type { FabricObject } from "fabric";
import type { CanvasEditor as EditorInstance } from "../core";

/** CanvasEditor 组件 Props */
export interface CanvasEditorProps {
    /** 画布宽度，默认 100% */
    width?: string | number;
    /** 画布高度，默认 100% */
    height?: string | number;
    /** 是否启用多端同步，默认 false */
    syncEnabled?: boolean;
    /** 自定义 className */
    className?: string;
    /** 自定义样式 */
    style?: CSSProperties;

    // 事件回调
    /** 编辑器初始化完成 */
    onReady?: (editor: EditorInstance) => void;
    /** 缩放变化 */
    onZoomChange?: (zoom: number) => void;
    /** 选中对象变化 */
    onSelectionChange?: (obj: FabricObject | null) => void;
}

/** CanvasEditor ref 暴露的方法 */
export interface CanvasEditorRef {
    /** 获取编辑器实例 */
    getEditor: () => EditorInstance | null;
}
