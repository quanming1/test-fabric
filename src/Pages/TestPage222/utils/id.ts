export function createId(prefix = "o") {
  // 足够稳定 + 可读；不追求加密强度
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function ensureId(obj: any, prefix?: string) {
  if (!obj) return "";
  if (typeof obj.__id === "string" && obj.__id) return obj.__id;
  obj.__id = createId(prefix);
  return obj.__id as string;
}
