import type { ComponentType } from "react";
import type { DOMLayer, DOMLayerConfig, DOMLayerProps } from "./types";

type Listener = () => void;

/**
 * DOM 图层管理器
 * 负责注册、注销 DOM 图层，供 React 组件订阅渲染
 */
export class DOMLayerManager {
    private layers = new Map<string, DOMLayer>();
    private listeners = new Set<Listener>();

    /**
     * 注册 DOM 图层
     */
    register(
        id: string,
        component: ComponentType<DOMLayerProps>,
        config?: Partial<Omit<DOMLayerConfig, "id">>
    ): void {
        if (this.layers.has(id)) {
            console.warn(`DOMLayer "${id}" already registered`);
            return;
        }

        const layer: DOMLayer = {
            config: {
                id,
                visible: config?.visible ?? true,
            },
            component,
        };

        this.layers.set(id, layer);
        this.notify();
    }

    /**
     * 注销 DOM 图层
     */
    unregister(id: string): void {
        if (this.layers.delete(id)) {
            this.notify();
        }
    }

    /**
     * 设置图层可见性
     */
    setVisible(id: string, visible: boolean | (() => boolean)): void {
        const layer = this.layers.get(id);
        if (!layer) return;

        layer.config.visible = visible;
        this.notify();
    }

    /**
     * 获取所有图层
     */
    getLayers(): DOMLayer[] {
        return Array.from(this.layers.values());
    }

    /**
     * 获取指定图层
     */
    getLayer(id: string): DOMLayer | undefined {
        return this.layers.get(id);
    }

    /**
     * 订阅图层变化
     */
    subscribe(listener: Listener): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    /**
     * 清空所有图层
     */
    clear(): void {
        this.layers.clear();
        this.notify();
    }

    /**
     * 销毁
     */
    destroy(): void {
        this.clear();
        this.listeners.clear();
    }

    private notify(): void {
        this.listeners.forEach((listener) => listener());
    }
}
