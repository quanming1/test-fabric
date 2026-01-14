import type { CanvasEditor } from "../editor/CanvasEditor";
import type { HistoryEntry, HistoryOptions, HistoryRecord, AddRecordOptions } from "./types";

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
  /** 批处理是否需要同步 */
  private batchNeedSync = false;
  /** 编辑器实例 */
  private editor: CanvasEditor;
  /** 快捷键取消订阅 */
  private unsubscribeHotkeys: Array<() => void> = [];

  /** 同步管理器（可选，由外部注入） */
  private syncManager: any = null;

  constructor(editor: CanvasEditor, options?: HistoryOptions) {
    this.editor = editor;
    this.maxRecords = options?.maxRecords ?? DEFAULT_MAX_RECORDS;
    this.initial();
  }

  /**
   * 设置同步管理器
   */
  setSyncManager(syncManager: any): void {
    this.syncManager = syncManager;
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
  private async applyRecord(record: HistoryRecord, action: "undo" | "redo"): Promise<void> {
    const plugin = this.editor.getPlugin(record.pluginName);
    if (!plugin) {
      console.warn(`[History] Plugin "${record.pluginName}" not found`);
      return;
    }

    if (action === "undo" && typeof (plugin as any).applyUndo === "function") {
      await (plugin as any).applyUndo(record);
    } else if (action === "redo" && typeof (plugin as any).applyRedo === "function") {
      await (plugin as any).applyRedo(record);
    }

    this.editor.canvas.requestRenderAll();
  }

  /**
   * 执行撤销
   */
  async performUndo(): Promise<void> {
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
          await this.applyRecord(entry[i], "undo");
        }
      } else {
        await this.applyRecord(entry, "undo");
      }
    } finally {
      this.resume();
    }
    this.editor.eventBus.emit("history:undo:after", entry as any);
    this.emitChange();

    // 同步撤销操作：构造反向记录并推送
    if (this.syncManager && this.shouldSyncEntry(entry)) {
      const reversedEntry = this.createReversedEntry(entry);
      this.syncManager.pushEvent(reversedEntry).catch((err: Error) => {
        console.error("[HistoryManager] 撤销同步推送失败:", err);
      });
    }
  }

  /**
   * 执行重做
   */
  async performRedo(): Promise<void> {
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
          await this.applyRecord(record, "redo");
        }
      } else {
        await this.applyRecord(entry, "redo");
      }
    } finally {
      this.resume();
    }
    this.editor.eventBus.emit("history:redo:after", entry as any);
    this.emitChange();

    // 同步重做操作：直接推送原记录
    if (this.syncManager && this.shouldSyncEntry(entry)) {
      this.syncManager.pushEvent(entry).catch((err: Error) => {
        console.error("[HistoryManager] 重做同步推送失败:", err);
      });
    }
  }

  /**
   * 判断 entry 是否需要同步
   */
  private shouldSyncEntry(entry: HistoryEntry): boolean {
    if (Array.isArray(entry)) {
      return entry.some((record) => record.needSync);
    }
    return entry.needSync === true;
  }

  /**
   * 创建反向的 entry（用于撤销同步）
   */
  private createReversedEntry(entry: HistoryEntry): HistoryEntry {
    if (Array.isArray(entry)) {
      // 批处理：反转顺序并反转每条记录
      return entry.map((record) => this.createReversedRecord(record)).reverse();
    }
    return this.createReversedRecord(entry);
  }

  /**
   * 创建反向的 record
   * - add 的反向是 remove
   * - remove 的反向是 add
   * - modify 的反向是 modify，但 before 和 after 互换
   */
  private createReversedRecord(record: HistoryRecord): HistoryRecord {
    const reversed: HistoryRecord = {
      ...record,
      id: genRecordId(),
      timestamp: Date.now(),
    };

    switch (record.type) {
      case "add":
        reversed.type = "remove";
        reversed.before = record.after;
        reversed.after = undefined;
        break;
      case "remove":
        reversed.type = "add";
        reversed.after = record.before;
        reversed.before = undefined;
        break;
      case "modify":
        reversed.before = record.after;
        reversed.after = record.before;
        break;
    }

    return reversed;
  }

  /**
   * 添加历史记录
   * @param record 历史记录（不含 id 和 timestamp）
   * @param options 选项，包含 needSync 字段
   */
  addRecord(record: Omit<HistoryRecord, "id" | "timestamp">, options?: AddRecordOptions): void {
    if (this.paused) return;

    const fullRecord: HistoryRecord = {
      ...record,
      id: genRecordId(),
      timestamp: Date.now(),
      needSync: options?.needSync ?? false,
    };

    // 如果正在 batch，则先收集到 batch，最后由 endBatch() 合并入栈
    const currentBatch = this.batchStack[this.batchStack.length - 1];
    if (currentBatch) {
      currentBatch.push(fullRecord);
      // batch 模式下，只要有一条记录需要同步，整个 batch 都需要同步
      if (fullRecord.needSync && !this.batchNeedSync) {
        this.batchNeedSync = true;
      }
      return;
    }

    this.pushEntry(fullRecord);

    // 如果需要同步，调用同步管理器推送事件
    if (fullRecord.needSync && this.syncManager) {
      this.syncManager.pushEvent(fullRecord).catch((err: Error) => {
        console.error("[HistoryManager] 同步事件推送失败:", err);
      });
    }
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
    if (batch.length === 0) {
      this.batchNeedSync = false;
      return;
    }

    const entry = batch.length === 1 ? batch[0] : batch;
    this.pushEntry(entry);

    // 如果批处理需要同步，推送整个批次
    if (this.batchNeedSync && this.syncManager) {
      this.syncManager.pushEvent(entry).catch((err: Error) => {
        console.error("[HistoryManager] 批处理同步事件推送失败:", err);
      });
    }
    this.batchNeedSync = false;
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
