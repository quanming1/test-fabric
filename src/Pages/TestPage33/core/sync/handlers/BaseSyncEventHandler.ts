import type { HistoryRecord } from "../../history/types";
import type { SyncEventType, SyncEventData, Handler } from "../types";

/**
 * 同步事件处理器基类
 * 提供 Handler 的通用实现和共享方法
 *
 * 使用策略模式：SyncManager 负责分发，Handler 负责具体处理逻辑
 * @template T 事件数据类型
 */
export abstract class BaseSyncEventHandler<T extends SyncEventData = SyncEventData>
    implements Handler.IHandler<T> {
    abstract readonly eventType: SyncEventType;

    /**
     * 处理接收到的同步事件
     * 子类必须实现此方法
     */
    abstract handle(event: Handler.Event<T>, context: Handler.Context): Promise<void>;

    /**
     * 将事件转换为 HistoryRecord
     * 子类可选实现，用于初始化时批量应用事件
     */
    toRecords?(event: Handler.Event<T>): HistoryRecord[];

    // ─── 共享工具方法 ─────────────────────────────────────────

    /**
     * 暂停历史记录、应用快照、清空历史栈
     * 这是处理远程事件的标准流程
     */
    protected async applyAndClearHistory(
        snapshot: HistoryRecord | HistoryRecord[],
        context: Handler.Context
    ): Promise<void> {
        const { editor, applySnapshot } = context;

        editor.history.pause();
        try {
            await applySnapshot(snapshot);
        } finally {
            editor.history.resume();
        }

        // 清空本地历史栈，避免状态不一致
        editor.history.clear();
    }

    /**
     * 生成确定性的 ID
     * 使用 seq + eventType + 自定义后缀，保证多端生成的 ID 一致
     * @param seq 事件序号
     * @param eventType 事件类型
     * @param suffix 自定义后缀（如 url 或索引）
     */
    protected generateDeterministicId(seq: number, eventType: string, suffix: string): string {
        return `${eventType}_${seq}_${this.hashString(suffix)}`;
    }

    /**
     * 简单的字符串哈希函数
     * 将长字符串（如 URL）转为短的哈希值
     */
    private hashString(str: string): string {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(36);
    }

    /**
     * 生成唯一的记录 ID
     */
    protected generateRecordId(): string {
        return `record_${Date.now()}_${Math.round(Math.random() * 1000)}`;
    }
}
