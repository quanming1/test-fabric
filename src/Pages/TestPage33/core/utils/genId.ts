/**
 * 生成唯一 ID
 */
export function genId(prefix = "id"): string {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
        return `${prefix}_${crypto.randomUUID()}`;
    }
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(16).slice(2)}`;
}
