import { FabricImage } from "fabric";

/** 图片上传服务地址 */
const UPLOAD_API = "http://localhost:3001/api/upload/image";

/**
 * 图片工厂
 * 职责：创建 FabricImage 对象（从 URL、File、快照等）
 */
export class ImageFactory {
    /**
     * 从 URL 创建图片对象
     */
    static async fromUrl(url: string): Promise<FabricImage> {
        return FabricImage.fromURL(url, { crossOrigin: "anonymous" });
    }

    /**
     * 从文件创建图片对象
     * 先上传到服务器获取 URL，再创建图片
     */
    static async fromFile(file: File): Promise<FabricImage> {
        const url = await this.uploadFile(file);
        return this.fromUrl(url);
    }

    /**
     * 从快照数据恢复图片对象
     */
    static async fromSnapshot(data: Record<string, unknown>): Promise<FabricImage> {
        return FabricImage.fromObject(data as any);
    }

    /**
     * 上传文件到服务器
     * @returns 图片的访问 URL
     */
    private static async uploadFile(file: File): Promise<string> {
        const formData = new FormData();
        formData.append("image", file);

        const response = await fetch(UPLOAD_API, {
            method: "POST",
            body: formData,
        });

        if (!response.ok) {
            throw new Error(`上传失败: ${response.status}`);
        }

        const result = await response.json();
        if (!result.success || !result.url) {
            throw new Error(result.error || "上传失败");
        }

        return result.url;
    }
}
