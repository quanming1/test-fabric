import type { HistoryRecord } from "../../history/types";
import type { SyncEventType, ServerAddImageData, Handler } from "../types";
import { BaseSyncEventHandler } from "./BaseSyncEventHandler";

/**
 * 服务端添加图片事件处理器
 * 处理 eventType: "server:add_image" 的事件
 *
 * 职责：
 * 1. 将后端传来的图片 URL 封装为 HistoryRecord
 * 2. 复用 applySnapshot 逻辑添加图片到画布
 * 3. 清空本地历史栈
 *
 * 设计说明：
 * - 后端只知道图片 URL，不了解前端的 HistoryRecord 结构
 * - 因此由前端 Handler 负责封装，保持职责清晰
 * - imageId 使用 seq + eventType + url 生成，保证多端一致
 */
export class ServerAddImageHandler extends BaseSyncEventHandler<ServerAddImageData> {
    readonly eventType: SyncEventType = "server:add_image";

    async handle(event: Handler.Event<ServerAddImageData>, context: Handler.Context) {
        const { urls } = event.data;

        console.log("[ServerAddImageHandler] 处理添加图片事件, seq:", event.seq, "urls:", urls);

        const records = this.toRecords(event);
        await this.applyAndClearHistory(records, context);
    }

    /**
     * 将图片 URL 数组转换为 HistoryRecord 数组
     * 每个 URL 对应一条 add 类型的记录
     * imageId 使用确定性算法生成，保证多端一致
     */
    toRecords(event: Handler.Event<ServerAddImageData>): HistoryRecord[] {
        const { seq = 0, eventType, data } = event;
        const { urls } = data;

        return urls.map((url, index) => {
            // 使用 seq + eventType + url 生成确定性 ID，多端一致
            const imageId = this.generateDeterministicId(seq, eventType, `${url}_${index}`);

            return {
                id: this.generateRecordId(),
                type: "add" as const,
                pluginName: "image",
                timestamp: Date.now(),
                objectIds: [imageId],
                after: [
                    {
                        id: imageId,
                        data: {
                            type: "image",
                            src: url,
                            crossOrigin: "anonymous",
                            left: 100 + index * 50,   // 多张图片错开位置
                            top: 100 + index * 50,
                            scaleX: 1,
                            scaleY: 1,
                            angle: 0,
                            originX: "left",
                            originY: "top",
                            data: {
                                category: "image",
                                id: imageId,
                            },
                        },
                    },
                ],
                needSync: false, // 不需要再同步回去，避免循环
            };
        });
    }
}
