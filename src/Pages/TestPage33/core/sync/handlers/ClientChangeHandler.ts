import type { HistoryRecord } from "../../history/types";
import type { SyncEventType, ClientChangeData, Handler } from "../types";
import { BaseSyncEventHandler } from "./BaseSyncEventHandler";

/**
 * 客户端变更事件处理器
 * 处理 eventType: "client:change" 的事件
 *
 * 职责：
 * 1. 判断是否为自己发起的事件（跳过）
 * 2. 应用远程客户端的快照到本地画布
 * 3. 清空本地历史栈
 */
export class ClientChangeHandler extends BaseSyncEventHandler<ClientChangeData> {
    readonly eventType: SyncEventType = "client:change";

    async handle(event: Handler.Event<ClientChangeData>, context: Handler.Context) {
        const { clientId } = context;
        const { data } = event;

        // 跳过自己发起的事件
        if (data.clientId === clientId) {
            return;
        }

        console.log("[ClientChangeHandler] 处理远程变更事件, seq:", event.seq);

        await this.applyAndClearHistory(data.snapshot, context);
    }

    /**
     * 将事件转换为 HistoryRecord
     * client:change 的 data.snapshot 本身就是 HistoryRecord
     */
    toRecords(event: Handler.Event<ClientChangeData>): HistoryRecord[] {
        const { snapshot } = event.data;
        return Array.isArray(snapshot) ? snapshot : [snapshot];
    }
}
