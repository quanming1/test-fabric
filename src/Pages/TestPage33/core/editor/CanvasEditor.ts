import { Canvas } from "fabric";
import { EventBus } from "../event/EventBus";
import type { EditorOptions } from "../types";
import type { Plugin } from "../../plugins";
import { ObjectMetadata } from "../object/ObjectMetadata";
import { HotkeyManager } from "../hotkey/HotkeyManager";

/**
 * 核心编辑器类
 * 职责：Canvas 生命周期管理、插件注册、事件分发
 */
export class CanvasEditor {
    canvas: Canvas;
    eventBus = new EventBus();
    metadata: ObjectMetadata;
    hotkey: HotkeyManager;
    private plugins = new Map<string, Plugin>();
    private _destroyed = false;

    constructor(el: HTMLCanvasElement, options?: EditorOptions) {
        this.canvas = new Canvas(el, {
            preserveObjectStacking: true,
            stopContextMenu: true,
            selection: true,
            ...options,
        });
        this.metadata = new ObjectMetadata(this.canvas);
        this.hotkey = new HotkeyManager();
    }

    /** 注册插件（链式调用） */
    use(plugin: Plugin): this {
        if (this._destroyed) {
            console.warn("Editor already destroyed");
            return this;
        }
        if (this.plugins.has(plugin.name)) {
            console.warn(`Plugin "${plugin.name}" already registered`);
            return this;
        }
        plugin.install(this);
        this.plugins.set(plugin.name, plugin);
        return this;
    }

    /** 获取插件实例 */
    getPlugin<T extends Plugin>(name: string): T | undefined {
        return this.plugins.get(name) as T | undefined;
    }

    /** 获取所有插件 */
    getPlugins(): Map<string, Plugin> {
        return this.plugins;
    }

    /** 设置画布尺寸 */
    setSize(width: number, height: number): void {
        const w = Math.max(1, width);
        const h = Math.max(1, height);
        this.canvas.setDimensions({ width: w, height: h });
        this.canvas.requestRenderAll();
        this.eventBus.emit("resize", { width: w, height: h });
    }

    /** 请求重绘 */
    render(): void {
        this.canvas.requestRenderAll();
    }

    /** 销毁编辑器 */
    destroy(): void {
        if (this._destroyed) return;
        this._destroyed = true;

        const pluginList = Array.from(this.plugins.values()).reverse();
        pluginList.forEach((p) => {
            try {
                p.destroy();
            } catch (e) {
                console.error(`Error destroying plugin "${p.name}":`, e);
            }
        });
        this.plugins.clear();
        this.eventBus.clear();
        this.hotkey.destroy();
        this.canvas.dispose();
    }

    get isDestroyed(): boolean {
        return this._destroyed;
    }
}
