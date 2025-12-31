// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type EventMap = Record<string, any[]>;

type Handler<T extends unknown[] = unknown[]> = (...args: T) => void;


export class EventBus<T extends EventMap = EventMap> {
    private handlers = new Map<keyof T, Set<Handler>>();

    /** 订阅事件 */
    on<K extends keyof T>(event: K, handler: Handler<T[K]>): () => void {
        if (!this.handlers.has(event)) {
            this.handlers.set(event, new Set());
        }
        this.handlers.get(event)!.add(handler as Handler);
        return () => this.off(event, handler);
    }

    /** 取消订阅 */
    off<K extends keyof T>(event: K, handler: Handler<T[K]>): void {
        this.handlers.get(event)?.delete(handler as Handler);
    }

    /** 触发事件 */
    emit<K extends keyof T>(event: K, ...args: T[K]): void {
        this.handlers.get(event)?.forEach((h) => {
            try {
                h(...args);
            } catch (e) {
                console.error(`EventBus error in "${String(event)}":`, e);
            }
        });
    }

    /** 清空所有订阅 */
    clear(): void {
        this.handlers.clear();
    }
}
