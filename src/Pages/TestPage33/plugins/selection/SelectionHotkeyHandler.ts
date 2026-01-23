import type { SelectionPlugin } from "./SelectionPlugin";
import type { HotkeyManager } from "../../core/hotkey/HotkeyManager";
import type { ModePlugin } from "../mode/ModePlugin";
import type { ZoomPlugin } from "../viewport/ZoomPlugin";
import { EditorMode } from "../mode/ModePlugin";

/** Ctrl/Meta 修饰键列表 */
const CTRL_META_KEYS = ["ControlLeft", "ControlRight", "MetaLeft", "MetaRight"] as const;

/**
 * 选择插件热键处理器
 * 
 * 职责：处理与选择相关的快捷键操作
 * - Delete / Backspace: 删除选中元素
 * - Space: 临时进入 Pan 模式（松开恢复）
 * - Ctrl + / Ctrl -: 缩放画布
 * - Ctrl + A: 全选并适配视图
 */
export class SelectionHotkeyHandler {
    private unsubscribes: Array<() => void> = [];
    /** 按下空格前的模式，用于松开时恢复 */
    private modeBeforeSpace: EditorMode | null = null;

    constructor(
        private plugin: SelectionPlugin,
        private hotkey: HotkeyManager
    ) { }

    /** 绑定所有热键 */
    bind(): void {
        this.bindDelete();
        this.bindSpacePan();
        this.bindZoom();
        this.bindSelectAll();
    }

    /** 解绑所有热键 */
    unbind(): void {
        this.unsubscribes.forEach((unsub) => unsub());
        this.unsubscribes = [];
        this.modeBeforeSpace = null;
    }

    /** 检查是否按下 Ctrl 或 Meta 键 */
    private isCtrlOrMeta(): boolean {
        return this.hotkey.isPressed([...CTRL_META_KEYS], "any");
    }

    /** 获取 ZoomPlugin */
    private get zoomPlugin(): ZoomPlugin | undefined {
        return this.plugin.getEditor().getPlugin<ZoomPlugin>("zoom");
    }

    /**
     * 绑定删除快捷键（Delete / Backspace）
     */
    private bindDelete(): void {
        const unsub = this.hotkey.watch(
            ({ event, matched }) => {
                if (matched && event.type === "keydown") {
                    event.preventDefault();
                    this.plugin.deleteSelected();
                }
            },
            {
                codes: ["Delete", "Backspace"],
                mode: "any",
            }
        );
        this.unsubscribes.push(unsub);
    }

    /**
     * 绑定空格键临时进入 Pan 模式
     * - 按下空格：记录当前模式，切换到 Pan
     * - 松开空格：恢复之前的模式
     */
    private bindSpacePan(): void {
        const unsub = this.hotkey.watch(
            ({ event, matched }) => {
                const modePlugin = this.plugin.getEditor().getPlugin<ModePlugin>("mode");
                if (!modePlugin) return;

                if (event.type === "keydown" && matched) {
                    if (this.modeBeforeSpace === null) {
                        this.modeBeforeSpace = modePlugin.mode;
                        modePlugin.setMode(EditorMode.Pan);
                    }
                } else if (event.type === "keyup" && !matched) {
                    if (this.modeBeforeSpace !== null) {
                        modePlugin.setMode(this.modeBeforeSpace);
                        this.modeBeforeSpace = null;
                    }
                }
            },
            {
                codes: "Space",
                mode: "only",
                repeat: false,
            }
        );
        this.unsubscribes.push(unsub);
    }

    /**
     * 绑定缩放快捷键
     * - Ctrl/Cmd + Equal(+): 放大 10%
     * - Ctrl/Cmd + Minus(-): 缩小 10%
     */
    private bindZoom(): void {
        const zoomStep = 0.1;

        const unsubZoomIn = this.hotkey.watch(
            ({ event, matched }) => {
                if (matched && event.type === "keydown" && this.isCtrlOrMeta()) {
                    event.preventDefault();
                    const zoom = this.zoomPlugin;
                    zoom?.setZoom(zoom.zoom + zoomStep);
                }
            },
            { codes: "Equal" }
        );

        const unsubZoomOut = this.hotkey.watch(
            ({ event, matched }) => {
                if (matched && event.type === "keydown" && this.isCtrlOrMeta()) {
                    event.preventDefault();
                    const zoom = this.zoomPlugin;
                    zoom?.setZoom(zoom.zoom - zoomStep);
                }
            },
            { codes: "Minus" }
        );

        this.unsubscribes.push(unsubZoomIn, unsubZoomOut);
    }

    /**
     * 绑定全选快捷键（Ctrl/Cmd + A）
     * - 选中画布上所有可选元素
     * - 适配视图到全部元素
     */
    private bindSelectAll(): void {
        const unsub = this.hotkey.watch(
            ({ event, matched }) => {
                if (matched && event.type === "keydown" && this.isCtrlOrMeta()) {
                    event.preventDefault();
                    this.plugin.selectAll();
                    this.zoomPlugin?.fitToView({ animation: { enabled: true, duration: 200 } });
                }
            },
            { codes: "KeyA" }
        );
        this.unsubscribes.push(unsub);
    }
}
