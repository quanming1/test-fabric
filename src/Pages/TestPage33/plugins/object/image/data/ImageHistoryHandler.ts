import { type FabricObject, util } from "fabric";
import { BaseHistoryHandler, Category, type HistoryRecord, type ObjectSnapshot, type HistoryManager, type CanvasEditor, type ImageObjectData } from "../../../../core";
import { ImageFactory } from "../helper";
import type { ImageExportData, StyleData } from "../../../io/types";

// 前向声明，避免循环依赖
import type { ImageManager } from "./ImageManager";

export interface ImageHistoryHandlerOptions {
    editor: CanvasEditor;
    historyManager: HistoryManager;
    pluginName: string;
    manager: ImageManager;  // 持有 ImageManager 引用
}

/**
 * 图片历史记录处理器
 * 
 * 职责：
 * 1. 创建和管理快照（使用 ImageExportData 格式）
 * 2. 记录历史操作
 * 3. 执行撤销/重做时，调用 ImageManager 的方法
 * 
 * 快照格式：{ id, metadata, style }
 */
export class ImageHistoryHandler extends BaseHistoryHandler<FabricObject> {
    private editor: CanvasEditor;
    private manager: ImageManager;  // ImageManager 引用

    /** 变换开始时的快照 */
    private transformStartSnapshots = new Map<string, ObjectSnapshot>();

    /** 图片操作默认需要同步 */
    protected override defaultNeedSync = true;

    constructor(options: ImageHistoryHandlerOptions) {
        super(options.historyManager, options.pluginName);
        this.editor = options.editor;
        this.manager = options.manager;
    }

    // ─── 快照 ─────────────────────────────────────────

    /**
     * 创建完整快照（ImageExportData 格式）
     */
    createSnapshot(obj: FabricObject): ObjectSnapshot {
        const metadata = this.editor.metadata.get(obj) as ImageObjectData | undefined;
        const id = metadata?.id ?? "";
        const matrix = obj.calcTransformMatrix();

        const data: ImageExportData = {
            id,
            metadata: { ...metadata } as ImageObjectData,
            style: {
                matrix: [matrix[0], matrix[1], matrix[2], matrix[3], matrix[4], matrix[5]],
            },
        };

        return { id, data };
    }


    // ─── 变换记录 ─────────────────────────────────────────

    onTransformStart(objects: FabricObject[]): void {
        this.transformStartSnapshots.clear();
        for (const obj of objects) {
            if (!this.editor.metadata.is(obj, "category", Category.Image)) continue;
            const id = this.editor.metadata.get(obj)?.id;
            if (id) {
                this.transformStartSnapshots.set(id, this.createSnapshot(obj));
            }
        }
    }

    onObjectModified(objects: FabricObject[]): void {
        const modifiedImages = objects.filter((obj) =>
            this.editor.metadata.is(obj, "category", Category.Image)
        );

        if (modifiedImages.length === 0) return;

        const beforeSnapshots: ObjectSnapshot[] = [];
        const afterSnapshots: ObjectSnapshot[] = [];
        const objectIds: string[] = [];

        for (const obj of modifiedImages) {
            const id = this.editor.metadata.get(obj)?.id;
            if (!id) continue;

            const beforeSnapshot = this.transformStartSnapshots.get(id);
            if (beforeSnapshot) {
                beforeSnapshots.push(beforeSnapshot);
                afterSnapshots.push(this.createSnapshot(obj));
                objectIds.push(id);
            }
        }

        if (objectIds.length > 0) {
            this.recordModify(objectIds, beforeSnapshots, afterSnapshots);
        }

        this.transformStartSnapshots.clear();
    }

    // ─── 记录操作（便捷方法）─────────────────────────────────

    recordClone(objects: FabricObject[]): void {
        const images = objects.filter((obj) =>
            this.editor.metadata.is(obj, "category", Category.Image)
        );
        if (images.length === 0) return;

        const objectIds: string[] = [];
        const afterSnapshots: ObjectSnapshot[] = [];

        for (const obj of images) {
            const id = this.editor.metadata.get(obj)?.id;
            if (id) {
                objectIds.push(id);
                afterSnapshots.push(this.createSnapshot(obj));
            }
        }

        if (objectIds.length > 0) {
            this.recordAdd(objectIds, afterSnapshots);
        }
    }

    recordDelete(objects: FabricObject[]): void {
        const images = objects.filter((obj) =>
            this.editor.metadata.is(obj, "category", Category.Image)
        );
        if (images.length === 0) return;

        const objectIds: string[] = [];
        const beforeSnapshots: ObjectSnapshot[] = [];

        for (const obj of images) {
            const id = this.editor.metadata.get(obj)?.id;
            if (id) {
                objectIds.push(id);
                beforeSnapshots.push(this.createSnapshot(obj));
            }
        }

        if (objectIds.length > 0) {
            this.recordRemove(objectIds, beforeSnapshots);
        }
    }


    // ─── 撤销/重做 ─────────────────────────────────────────

    async applyUndo(record: HistoryRecord): Promise<void> {
        switch (record.type) {
            case "add":
                // 撤销添加 = 删除，不记录历史
                this.manager.remove(record.objectIds, { recordHistory: false });
                break;
            case "remove":
                // 撤销删除 = 恢复添加，不记录历史
                if (record.before) {
                    await this.restoreImages(record.before);
                }
                break;
            case "modify":
                // 撤销修改 = 应用 before 快照
                if (record.before) {
                    this.applySnapshots(record.before);
                }
                break;
        }
    }

    async applyRedo(record: HistoryRecord): Promise<void> {
        switch (record.type) {
            case "add":
                // 重做添加 = 恢复添加，不记录历史
                if (record.after) {
                    await this.restoreImages(record.after);
                }
                break;
            case "remove":
                // 重做删除 = 删除，不记录历史
                this.manager.remove(record.objectIds, { recordHistory: false });
                break;
            case "modify":
                // 重做修改 = 应用 after 快照
                if (record.after) {
                    this.applySnapshots(record.after);
                }
                break;
        }
    }

    // ─── 私有方法 ─────────────────────────────────────────

    /**
     * 从快照恢复图片（ImageExportData 格式）
     * 通过 ImageManager.add 添加，不记录历史
     */
    private async restoreImages(snapshots: ObjectSnapshot[]): Promise<void> {
        for (const snapshot of snapshots) {
            const exportData = snapshot.data as ImageExportData;
            const { metadata, style } = exportData;

            if (!metadata?.src) {
                console.warn(`[ImageHistoryHandler] 快照缺少 src，无法恢复: ${snapshot.id}`);
                continue;
            }

            // 从 src 创建图片
            const img = await ImageFactory.fromUrl(metadata.src);

            // 从矩阵恢复变换
            this.applyMatrixToImage(img, style.matrix);

            // 通过 manager.add 添加，不记录历史
            this.manager.add(img, {
                id: snapshot.id,
                recordHistory: false,
                needSync: false,
                setActive: false,
                fileName: metadata.fileName,
                naturalWidth: metadata.naturalWidth,
                naturalHeight: metadata.naturalHeight,
            });
        }
    }

    /**
     * 应用快照到现有图片（用于 modify 的撤销/重做）
     */
    private applySnapshots(snapshots: ObjectSnapshot[]): void {
        for (const snapshot of snapshots) {
            const obj = this.manager.getById(snapshot.id);
            if (!obj) continue;

            const exportData = snapshot.data as ImageExportData;
            const style = exportData.style;

            if (style?.matrix) {
                // 从矩阵恢复变换
                const options = util.qrDecompose(style.matrix);

                obj.set({
                    flipX: false,
                    flipY: false,
                    scaleX: options.scaleX,
                    scaleY: options.scaleY,
                    skewX: options.skewX,
                    skewY: options.skewY,
                    angle: options.angle,
                    left: options.translateX,
                    top: options.translateY,
                });
            }

            obj.setCoords();
        }
        this.editor.canvas.requestRenderAll();
    }

    /**
     * 从变换矩阵恢复图片位置和缩放
     */
    private applyMatrixToImage(img: FabricObject, matrix: StyleData["matrix"]): void {
        const options = util.qrDecompose(matrix);

        img.set({
            originX: "center",
            originY: "center",
            scaleX: options.scaleX,
            scaleY: options.scaleY,
            skewX: options.skewX,
            skewY: options.skewY,
            angle: options.angle,
            left: options.translateX,
            top: options.translateY,
        });
    }
}
