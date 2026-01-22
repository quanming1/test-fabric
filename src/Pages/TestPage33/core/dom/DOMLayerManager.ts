import type { ComponentType } from "react";
import type { DOMLayer, DOMLayerConfig, DOMLayerProps } from "./types";

type Listener = () => void;

/**
 * DOM 图层管理器
 * 负责注册、注销、排序 DOM 图层，供 React 组件订阅渲染
 */
export class DOMLayerManager {
    private layers = new Map<string, DOMLayer>();
    private listeners = new Set<Listener>();
    private sortedCache: DOMLayer[] | null = null;

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
                zIndex: config?.zIndex ?? 0,
                visible: config?.visible ?? true,
            },
            component,
        };

        this.layers.set(id, layer);
        this.invalidateCache();
        this.notify();
    }

    /**
     * 注销 DOM 图层
     */
    unregister(id: string): void {
        if (this.layers.delete(id)) {
            this.invalidateCache();
            this.notify();
        }
    }

    /**
     * 更新图层配置
     */
    update(id: string, config: Partial<Omit<DOMLayerConfig, "id">>): void {
        const layer = this.layers.get(id);
        if (!layer) return;

        layer.config = { ...layer.config, ...config };
        this.invalidateCache();
        this.notify();
    }

    /**
     * 设置图层可见性
     */
    setVisible(id: string, visible: boolean | (() => boolean)): void {
        this.update(id, { visible });
    }

    /**
     * 获取所有图层（按 zIndex 排序）
     */
    getLayers(): DOMLayer[] {
        if (!this.sortedCache) {
            this.sortedCache = Array.from(this.layers.values()).sort(
                (a, b) => a.config.zIndex - b.config.zIndex
            );
        }
        return this.sortedCache;
    }

    /**
     * 获取指定图层
     */
    getLayer(id: string): DOMLayer | undefined {
        return this.layers.get(id);
    }

    /**
     * 检查图层是否可见
     */
    isVisible(id: string): boolean {
        const layer = this.layers.get(id);
        if (!layer) return false;

        const { visible } = layer.config;
        if (typeof visible === "function") {
            return visible();
        }
        return visible !== false;
    }

    /**
     * 订阅图层变化（用于 React useSyncExternalStore）
     */
    subscribe(listener: Listener): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    /**
     * 获取快照（用于 React useSyncExternalStore）
     */
    getSnapshot = (): DOMLayer[] => {
        return this.getLayers();
    };

    /**
     * 清空所有图层
     */
    clear(): void {
        this.layers.clear();
        this.invalidateCache();
        this.notify();
    }

    /**
     * 销毁
     */
    destroy(): void {
        this.clear();
        this.listeners.clear();
    }

    private invalidateCache(): void {
        this.sortedCache = null;
    }

    private notify(): void {
        this.listeners.forEach((listener) => listener());
    }
}
