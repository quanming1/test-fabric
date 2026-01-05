import { Canvas } from "fabric/*";
import type { EventBus } from "../event/EventBus";
import type { HotkeyManager } from "../hotkey/HotkeyManager";
import type { HistoryOptions, HistoryRecord } from "./types";

let recordIdCounter = 0;
const genRecordId = () => `record_${Date.now()}_${++recordIdCounter}`;

const DEFAULT_MAX_RECORDS = 50;

export interface HistoryManagerDeps {
    hotkey: HotkeyManager;
    eventBus: EventBus;
    /** 应用历史记录的回调，由 CanvasEditor 提供 */
    applyRecord: (record: HistoryRecord, action: "undo" | "redo") => void;
    canvas: Canvas;
}

/**
 * 历史记录管理器
 * 职责：管理撤销/重做栈，快捷键绑定，执行撤销/重做
 * 
 * 使用单栈+指针实现：
 * - stack: 所有历史记录
 * - cursor: 当前位置，指向下一个 undo 的位置
 * - [0, cursor) 为可撤销区域
 * - [cursor, length) 为可重做区域
 * 
 * 事件：
 * - history:change - 状态变化时触发
 * - history:undo:before / history:undo:after - 撤销前后
 * - history:redo:before / history:redo:after - 重做前后
 */
export class HistoryManager {
    /** 历史记录栈 */
    private stack: HistoryRecord[] = [];
    /** 当前指针位置 */
    private cursor = 0;
    /** 最大记录数 */
    private maxRecords: number;
    /** 是否暂停记录 */
    private paused = false;
    /** 依赖 */
    private deps: HistoryManagerDeps | null = null;
    /** 快捷键取消订阅 */
    private unsubscribeHotkeys: Array<() => void> = [];

    constructor(options?: HistoryOptions) {
        this.maxRecords = options?.maxRecords ?? DEFAULT_MAX_RECORDS;
    }

    /**
     * 初始化依赖（由 CanvasEditor 调用）
     */
    init(deps: HistoryManagerDeps): void {
        this.deps = deps;
        this.bindHotkeys(deps.hotkey);
    }

    /**
     * 绑定撤销/重做快捷键
     */
    private bindHotkeys(hotkey: HotkeyManager): void {
        // Ctrl+Z 撤销
        const unsubUndo = hotkey.watch(
            ({ event, matched }) => {
                if (matched && event.type === "keydown") {
                    event.preventDefault();
                    this.performUndo();
                }
            },
            { codes: ["ControlLeft", "KeyZ"], mode: "only" }
        );

        // Ctrl+Y 重做
        const unsubRedoY = hotkey.watch(
            ({ event, matched }) => {
                if (matched && event.type === "keydown") {
                    event.preventDefault();
                    this.performRedo();
                }
            },
            { codes: ["ControlLeft", "KeyY"], mode: "only" }
        );

        // Ctrl+Shift+Z 重做
        const unsubRedoShiftZ = hotkey.watch(
            ({ event, matched }) => {
                if (matched && event.type === "keydown") {
                    event.preventDefault();
                    this.performRedo();
                }
            },
            { codes: ["ControlLeft", "ShiftLeft", "KeyZ"], mode: "only" }
        );

        this.unsubscribeHotkeys.push(unsubUndo, unsubRedoY, unsubRedoShiftZ);
    }

    /**
     * 执行撤销
     */
    performUndo(): void {
        if (!this.canUndo || !this.deps) return;

        this.cursor--;
        const record = this.stack[this.cursor];

        this.deps.eventBus.emit("history:undo:before", record);
        this.pause();
        try {
            this.deps.canvas.discardActiveObject();
            this.deps.applyRecord(record, "undo");
        } finally {
            this.resume();
        }
        this.deps.eventBus.emit("history:undo:after", record);
        this.emitChange();
    }

    /**
     * 执行重做
     */
    performRedo(): void {
        if (!this.canRedo || !this.deps) return;

        const record = this.stack[this.cursor];
        this.cursor++;

        this.deps.eventBus.emit("history:redo:before", record);
        this.pause();
        try {
            this.deps.canvas.discardActiveObject();
            this.deps.applyRecord(record, "redo");
        } finally {
            this.resume();
        }
        this.deps.eventBus.emit("history:redo:after", record);
        this.emitChange();
    }

    /**
     * 添加历史记录
     */
    addRecord(record: Omit<HistoryRecord, "id" | "timestamp">): void {
        if (this.paused) return;

        const fullRecord: HistoryRecord = {
            ...record,
            id: genRecordId(),
            timestamp: Date.now(),
        };

        // 截断 cursor 之后的记录（丢弃 redo 部分）
        this.stack.length = this.cursor;
        this.stack.push(fullRecord);
        this.cursor++;

        // 超出上限时移除最早的记录
        while (this.stack.length > this.maxRecords) {
            this.stack.shift();
            this.cursor--;
        }

        this.emitChange();
    }

    pause(): void {
        this.paused = true;
    }

    resume(): void {
        this.paused = false;
    }

    get isPaused(): boolean {
        return this.paused;
    }

    get canUndo(): boolean {
        return this.cursor > 0;
    }

    get canRedo(): boolean {
        return this.cursor < this.stack.length;
    }

    get undoCount(): number {
        return this.cursor;
    }

    get redoCount(): number {
        return this.stack.length - this.cursor;
    }

    clear(): void {
        this.stack = [];
        this.cursor = 0;
        this.emitChange();
    }

    private emitChange(): void {
        this.deps?.eventBus.emit("history:change", {
            canUndo: this.canUndo,
            canRedo: this.canRedo,
        });
    }

    destroy(): void {
        this.unsubscribeHotkeys.forEach((unsub) => unsub());
        this.unsubscribeHotkeys = [];
        this.stack = [];
        this.cursor = 0;
        this.deps = null;
    }
}
