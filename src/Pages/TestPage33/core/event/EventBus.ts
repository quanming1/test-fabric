type Handler = (...args: any[]) => void;

/**
 * 事件总线 - 解耦模块间通信
 */
export class EventBus {
    private handlers = new Map<string, Set<Handler>>();

    /** 订阅事件 */
    on(event: string, handler: Handler): () => void {
        if (!this.handlers.has(event)) {
            this.handlers.set(event, new Set());
        }
        this.handlers.get(event)!.add(handler);
        return () => this.off(event, handler);
    }

    /** 取消订阅 */
    off(event: string, handler: Handler): void {
        this.handlers.get(event)?.delete(handler);
    }

    /** 触发事件 */
    emit(event: string, ...args: any[]): void {
        this.handlers.get(event)?.forEach((h) => {
            try {
                h(...args);
            } catch (e) {
                console.error(`EventBus error in "${event}":`, e);
            }
        });
    }

    /** 清空所有订阅 */
    clear(): void {
        this.handlers.clear();
    }
}
