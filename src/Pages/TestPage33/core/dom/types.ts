import type { ComponentType } from "react";
import type { CanvasEditor } from "../editor/CanvasEditor";

/**
 * DOM 图层配置
 */
export interface DOMLayerConfig {
    /** 唯一标识 */
    id: string;
    /** 层级，数值越大越靠上 */
    zIndex: number;
    /** 可见性：布尔值或返回布尔值的函数 */
    visible?: boolean | (() => boolean);
}

/**
 * DOM 图层组件 Props
 */
export interface DOMLayerProps {
    editor: CanvasEditor;
}

/**
 * DOM 图层定义
 */
export interface DOMLayer {
    config: DOMLayerConfig;
    component: ComponentType<DOMLayerProps>;
}

/**
 * DOM 图层管理器事件
 */
export interface DOMLayerEvents {
    /** 图层列表变化 */
    "layer:change": void;
}
