import { Category, type CanvasEditor } from "src/Pages/TestPage33/core";
import { type FabricObject } from "fabric";

export class MarkerPluginState {
    // 当前悬浮的可标记对象 ID
    public hoveredTargetId: string | null = null;
    // 是否可以进行标记（鼠标在可标记区域 + 按下 Ctrl）
    public rangeAble: boolean = false;
    private unwatchHotkey: (() => void) | null = null;

    constructor(
        private markableCategories: Category[],
        private editor: CanvasEditor
    ) {
        this.bindEvents();
    }

    private get canvas() {
        return this.editor.canvas;
    }

    private get metadata() {
        return this.editor.metadata;
    }

    private get hotkey() {
        return this.editor.hotkey;
    }

    private bindEvents(): void {
        this.canvas.on("mouse:over", this.handleMouseOver);
        this.canvas.on("mouse:out", this.handleMouseOut);
        // 使用 HotkeyManager 的 watch API 监听 Ctrl/Meta 键
        this.unwatchHotkey = this.hotkey.watch(
            () => {
                this.updateCanMark();
            },
            {
                codes: ["ControlLeft", "ControlRight", "MetaLeft", "MetaRight"],
                mode: "any",
                repeat: false,
            }
        );
    }

    private isMarkable(target: FabricObject | undefined): boolean {
        if (!target) return false;
        return this.markableCategories.some((cat) =>
            this.metadata.is(target, "category", cat)
        );
    }

    private getTargetId(target: FabricObject): string | null {
        return this.metadata.get(target)?.id ?? null;
    }

    private updateCanMark(): void {
        // 使用 isPressed 判断 Ctrl/Meta
        const isCtrlOrMeta = this.hotkey.isPressed(
            ["ControlLeft", "ControlRight", "MetaLeft", "MetaRight"],
            "any"
        );
        this.rangeAble = isCtrlOrMeta && this.hoveredTargetId !== null;
    }

    private handleMouseOver = (opt: { target?: FabricObject }): void => {
        const target = opt.target;
        if (target && this.isMarkable(target)) {
            this.hoveredTargetId = this.getTargetId(target);
        }
        this.updateCanMark();
    };

    private handleMouseOut = (opt: { target?: FabricObject }): void => {
        const target = opt.target;
        const targetId = target ? this.getTargetId(target) : null;

        if (targetId && targetId === this.hoveredTargetId) {
            this.hoveredTargetId = null;
        }
        this.updateCanMark();
    };

    getHoveredTarget(): FabricObject | undefined {
        if (!this.hoveredTargetId) return undefined;
        return this.metadata.getById(this.hoveredTargetId);
    }

    destroy(): void {
        this.canvas.off("mouse:over", this.handleMouseOver);
        this.canvas.off("mouse:out", this.handleMouseOut);
        // 取消 hotkey 监听
        this.unwatchHotkey?.();
        this.unwatchHotkey = null;
        this.hoveredTargetId = null;
        this.rangeAble = false;
    }
}
