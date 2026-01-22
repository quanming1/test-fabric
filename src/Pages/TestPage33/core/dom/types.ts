import type { ComponentType } from "react";
import type { CanvasEditor } from "../editor/CanvasEditor";

/**
 * DOM 图层配置
 */
export interface DOMLayerConfig {
    /** 唯一标识 */
    id: string;
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
