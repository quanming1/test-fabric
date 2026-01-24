import {
    Category,
    EventBus,
    type CanvasEditor,
} from "../../../../core";
import { type FabricObject, type TPointerEventInfo, type TPointerEvent } from "fabric";

/** MarkerPluginState 事件类型定义 */
export type MarkerPluginStateEvents = {
    "rangeAble:change": [rangeAble: boolean];
    "hoveredTargetId:change": [targetId: string | null];
};

export class MarkerPluginState extends EventBus<MarkerPluginStateEvents> {
    // 当前悬浮的可标记对象 ID
    public hoveredTargetId: string | null = null;
    // 是否可以进行标记（鼠标在可标记区域 + 按下 Ctrl）
    public rangeAble: boolean = false;
    private unwatchHotkey: (() => void) | null = null;

    constructor(
        private markableCategories: Category[],
        private editor: CanvasEditor
    ) {
        super();
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
        this.canvas.on("mouse:move", this.handleMouseMove);
        this.canvas.on("mouse:out", this.handleMouseOut);
        // 使用 HotkeyManager 的 watch API 监听 Mod 键（Mac: Command, Windows: Ctrl）
        this.unwatchHotkey = this.hotkey.watch(
            () => {
                this.updateCanMark();
            },
            {
                codes: "Mod",
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

    private updateCanMark(): void {
        const isModPressed = this.hotkey.isPressed("Mod", "any");
        const oldRangeAble = this.rangeAble;
        this.rangeAble = isModPressed && this.hoveredTargetId !== null;

        if (oldRangeAble !== this.rangeAble) {
            this.emit("rangeAble:change", this.rangeAble);
        }
    }

    private handleMouseMove = (opt: TPointerEventInfo<TPointerEvent>): void => {
        const target = opt.target;
        const newId = target && this.isMarkable(target) ? this.metadata.getField(target, "id") : null;

        if (newId !== this.hoveredTargetId) {
            this.hoveredTargetId = newId;
            this.emit("hoveredTargetId:change", this.hoveredTargetId);
        }
        this.updateCanMark();
    };

    private handleMouseOut = (): void => {
        if (this.hoveredTargetId !== null) {
            this.hoveredTargetId = null;
            this.emit("hoveredTargetId:change", this.hoveredTargetId);
        }
        this.updateCanMark();
    };

    getHoveredTarget(): FabricObject | undefined {
        if (!this.hoveredTargetId) return undefined;
        return this.metadata.getById(this.hoveredTargetId);
    }

    destroy(): void {
        this.canvas.off("mouse:move", this.handleMouseMove);
        this.canvas.off("mouse:out", this.handleMouseOut);
        this.unwatchHotkey?.();
        this.unwatchHotkey = null;
        this.hoveredTargetId = null;
        this.rangeAble = false;
        this.clear(); // 清空所有事件订阅
    }
}
