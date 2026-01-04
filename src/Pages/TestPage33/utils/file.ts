/**
 * 文件相关工具函数
 */

/** 触发浏览器下载 */
export function downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/** Data URL 转 Blob */
export function dataURLToBlob(dataUrl: string, mimeType: string): Blob {
    const byteString = atob(dataUrl.split(",")[1]);
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
    }
    return new Blob([ab], { type: mimeType });
}

/** 获取文件扩展名（小写） */
export function getFileExtension(filename: string): string {
    return filename.split(".").pop()?.toLowerCase() || "";
}

/** 确保文件名有正确的扩展名 */
export function ensureExtension(filename: string, ext: string): string {
    const normalizedExt = ext.startsWith(".") ? ext : `.${ext}`;
    return filename.endsWith(normalizedExt) ? filename : filename + normalizedExt;
}
