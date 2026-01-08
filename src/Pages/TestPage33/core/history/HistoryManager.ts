import type { CanvasEditor } from "../editor/CanvasEditor";
import type { HistoryEntry, HistoryOptions, HistoryRecord } from "./types";

let recordIdCounter = 0;
const genRecordId = () => `record_${Date.now()}_${++recordIdCounter}`;

const DEFAULT_MAX_RECORDS = 50;

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
  private stack: HistoryEntry[] = [];
  /** 当前指针位置 */
  private cursor = 0;
  /** 最大记录数 */
  private maxRecords: number;
  /** 是否暂停记录 */
  private paused = false;
  /** 批处理栈（支持嵌套 batch）；非空表示正在进行集体操作合并 */
  private batchStack: HistoryRecord[][] = [];
  /** 编辑器实例 */
  private editor: CanvasEditor;
  /** 快捷键取消订阅 */
  private unsubscribeHotkeys: Array<() => void> = [];

  constructor(editor: CanvasEditor, options?: HistoryOptions) {
    this.editor = editor;
    this.maxRecords = options?.maxRecords ?? DEFAULT_MAX_RECORDS;
    this.initial();
  }

  private initial(): void {
    this.bindHotkeys();
  }

  /**
   * 绑定撤销/重做快捷键
   */
  private bindHotkeys(): void {
    const hotkey = this.editor.hotkey;

    // Ctrl+Z 撤销
    const unsubUndo = hotkey.watch(
      ({ event, matched }) => {
        if (matched && event.type === "keydown") {
          event.preventDefault();
          this.performUndo();
        }
      },
      { codes: ["ControlLeft", "KeyZ"], mode: "only" },
    );

    // Ctrl+Y 重做
    const unsubRedoY = hotkey.watch(
      ({ event, matched }) => {
        if (matched && event.type === "keydown") {
          event.preventDefault();
          this.performRedo();
        }
      },
      { codes: ["ControlLeft", "KeyY"], mode: "only" },
    );

    // Ctrl+Shift+Z 重做
    const unsubRedoShiftZ = hotkey.watch(
      ({ event, matched }) => {
        if (matched && event.type === "keydown") {
          event.preventDefault();
          this.performRedo();
        }
      },
      { codes: ["ControlLeft", "ShiftLeft", "KeyZ"], mode: "only" },
    );

    this.unsubscribeHotkeys.push(unsubUndo, unsubRedoY, unsubRedoShiftZ);
  }

  /**
   * 应用历史记录到对应插件
   */
  private applyRecord(record: HistoryRecord, action: "undo" | "redo"): void {
    const plugin = this.editor.getPlugin(record.pluginName);
    if (!plugin) {
      console.warn(`[History] Plugin "${record.pluginName}" not found`);
      return;
    }

    if (action === "undo" && typeof (plugin as any).applyUndo === "function") {
      (plugin as any).applyUndo(record);
    } else if (action === "redo" && typeof (plugin as any).applyRedo === "function") {
      (plugin as any).applyRedo(record);
    }

    this.editor.canvas.requestRenderAll();
  }

  /**
   * 执行撤销
   */
  performUndo(): void {
    if (!this.canUndo || !this.editor) return;

    this.cursor--;
    const entry = this.stack[this.cursor];

    this.editor.eventBus.emit("history:undo:before", entry as any);
    this.pause();
    try {
      this.editor.canvas.discardActiveObject();
      // 批处理：撤销时需倒序回放
      if (Array.isArray(entry)) {
        for (let i = entry.length - 1; i >= 0; i--) {
          this.applyRecord(entry[i], "undo");
        }
      } else {
        this.applyRecord(entry, "undo");
      }
    } finally {
      this.resume();
    }
    this.editor.eventBus.emit("history:undo:after", entry as any);
    this.emitChange();
  }

  /**
   * 执行重做
   */
  performRedo(): void {
    if (!this.canRedo || !this.editor) return;

    const entry = this.stack[this.cursor];
    this.cursor++;

    this.editor.eventBus.emit("history:redo:before", entry as any);
    this.pause();
    try {
      this.editor.canvas.discardActiveObject();
      // 批处理：重做时需正序回放
      if (Array.isArray(entry)) {
        for (const record of entry) {
          this.applyRecord(record, "redo");
        }
      } else {
        this.applyRecord(entry, "redo");
      }
    } finally {
      this.resume();
    }
    this.editor.eventBus.emit("history:redo:after", entry as any);
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

    // 如果正在 batch，则先收集到 batch，最后由 endBatch() 合并入栈
    const currentBatch = this.batchStack[this.batchStack.length - 1];
    if (currentBatch) {
      currentBatch.push(fullRecord);
      return;
    }

    this.pushEntry(fullRecord);
  }

  /**
   * 开始一个批处理（集体操作）
   * 批处理中产生的多条 record 将被合并为历史栈中的 1 个元素。
   */
  beginBatch(): void {
    this.batchStack.push([]);
  }

  /**
   * 结束批处理
   */
  endBatch(): void {
    const batch = this.batchStack.pop();
    if (!batch) return;

    // 内层 batch 结束时，先合并到外层 batch（支持嵌套）
    const parent = this.batchStack[this.batchStack.length - 1];
    if (parent) {
      parent.push(...batch);
      return;
    }

    // 最外层：真正入栈（空 batch 不入栈）
    if (batch.length === 0) return;
    this.pushEntry(batch.length === 1 ? batch[0] : batch);
  }

  /**
   * 以批处理方式执行一段逻辑（支持 async）
   */
  async runBatch<T>(fn: () => Promise<T> | T): Promise<T> {
    this.beginBatch();
    try {
      return await fn();
    } finally {
      this.endBatch();
    }
  }

  /** 将元素推入历史栈（包含 cursor 截断、maxRecords 控制、emitChange） */
  private pushEntry(entry: HistoryEntry): void {
    // 截断 cursor 之后的记录（丢弃 redo 部分）
    this.stack.length = this.cursor;
    this.stack.push(entry);
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
    this.editor?.eventBus.emit("history:change", {
      canUndo: this.canUndo,
      canRedo: this.canRedo,
    });
  }

  destroy(): void {
    this.unsubscribeHotkeys.forEach((unsub) => unsub());
    this.unsubscribeHotkeys = [];
    this.stack = [];
    this.cursor = 0;
  }
}
