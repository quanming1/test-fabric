import { FabricImage, type FabricObject, type TOptions, type ImageProps } from "fabric";
import type { HistoryRecord, ObjectSnapshot, HistoryManager } from "../../../core";
import type { CanvasEditor } from "../../../core";
import { Category } from "../../../core";

/** 图片需要额外序列化的属性 */
const EXTRA_PROPS = ["data", "src", "crossOrigin"] as const;

export interface ImageHistoryHandlerOptions {
    editor: CanvasEditor;
    historyManager: HistoryManager;
    pluginName: string;
    getImageList: () => FabricObject[];
}

/**
 * 图片历史记录处理器
 * 职责：管理图片的历史记录（快照、撤销、重做）
 */
export class ImageHistoryHandler {
    private editor: CanvasEditor;
    private historyManager: HistoryManager;
    private pluginName: string;
    private getImageList: () => FabricObject[];

    /** 拖拽开始时的快照 */
    private dragStartSnapshots = new Map<string, ObjectSnapshot>();

    constructor(options: ImageHistoryHandlerOptions) {
        this.editor = options.editor;
        this.historyManager = options.historyManager;
        this.pluginName = options.pluginName;
        this.getImageList = options.getImageList;
    }

    private get canvas() {
        return this.editor.canvas;
    }

    // ─── 快照 ─────────────────────────────────────────

    /**
     * 创建对象快照
     */
    createSnapshot(obj: FabricObject, includeMarkers = false): ObjectSnapshot {
        const id = this.editor.metadata.get(obj)?.id ?? "";
        const data: Record<string, unknown> = {
            ...obj.toObject([...EXTRA_PROPS]),
        };

        if (includeMarkers) {
            const markerPlugin = this.editor.getPlugin<any>("marker");
            if (markerPlugin && id) {
                const markerData = markerPlugin.getMarkersForTarget(id);
                if (markerData.points.length > 0) {
                    data._markers = markerData.points;
                }
                if (markerData.regions.length > 0) {
                    data._regions = markerData.regions;
                }
            }
        }

        return { id, data };
    }

    // ─── 拖拽记录 ─────────────────────────────────────────

    /**
     * 拖拽开始时记录快照
     */
    onDragStart(objects: FabricObject[]): void {
        this.dragStartSnapshots.clear();
        for (const obj of objects) {
            if (!this.editor.metadata.is(obj, "category", Category.Image)) continue;
            const id = this.editor.metadata.get(obj)?.id;
            if (id) {
                this.dragStartSnapshots.set(id, this.createSnapshot(obj));
            }
        }
    }

    /**
     * 对象修改完成时记录历史
     */
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

            const beforeSnapshot = this.dragStartSnapshots.get(id);
            if (beforeSnapshot) {
                beforeSnapshots.push(beforeSnapshot);
                afterSnapshots.push(this.createSnapshot(obj));
                objectIds.push(id);
            }
        }

        if (objectIds.length > 0) {
            this.recordModify(objectIds, beforeSnapshots, afterSnapshots);
        }

        this.dragStartSnapshots.clear();
    }

    // ─── 记录操作 ─────────────────────────────────────────

    recordAdd(objectIds: string[], after: ObjectSnapshot[]): void {
        if (this.historyManager.isPaused) return;
        this.historyManager.addRecord({
            type: "add",
            pluginName: this.pluginName,
            objectIds,
            after,
        });
    }

    recordRemove(objectIds: string[], before: ObjectSnapshot[]): void {
        if (this.historyManager.isPaused) return;
        this.historyManager.addRecord({
            type: "remove",
            pluginName: this.pluginName,
            objectIds,
            before,
        });
    }

    recordModify(objectIds: string[], before: ObjectSnapshot[], after: ObjectSnapshot[]): void {
        if (this.historyManager.isPaused) return;
        this.historyManager.addRecord({
            type: "modify",
            pluginName: this.pluginName,
            objectIds,
            before,
            after,
        });
    }

    // ─── 撤销/重做 ─────────────────────────────────────────

    applyUndo(record: HistoryRecord): void {
        switch (record.type) {
            case "add":
                this.removeObjectsByIds(record.objectIds);
                break;
            case "remove":
                if (record.before) {
                    this.restoreObjects(record.before);
                }
                break;
            case "modify":
                if (record.before) {
                    this.applySnapshots(record.before);
                }
                break;
        }
    }

    applyRedo(record: HistoryRecord): void {
        switch (record.type) {
            case "add":
                if (record.after) {
                    this.restoreObjects(record.after);
                }
                break;
            case "remove":
                this.removeObjectsByIds(record.objectIds);
                break;
            case "modify":
                if (record.after) {
                    this.applySnapshots(record.after);
                }
                break;
        }
    }

    // ─── 私有方法 ─────────────────────────────────────────

    private removeObjectsByIds(ids: string[]): void {
        const idSet = new Set(ids);
        const toRemove = this.getImageList().filter((obj) => {
            const id = this.editor.metadata.get(obj)?.id;
            return id && idSet.has(id);
        });
        toRemove.forEach((obj) => this.canvas.remove(obj));
    }

    private async restoreObjects(snapshots: ObjectSnapshot[]): Promise<void> {
        const markerPlugin = this.editor.getPlugin<any>("marker");

        for (const snapshot of snapshots) {
            const img = await FabricImage.fromObject(snapshot.data as TOptions<ImageProps>);
            this.canvas.add(img as unknown as FabricObject);

            // 恢复关联的标记数据
            if (markerPlugin) {
                const markers = snapshot.data._markers as any[] | undefined;
                const regions = snapshot.data._regions as any[] | undefined;
                if (markers && markers.length > 0) {
                    markerPlugin.loadPoints([
                        ...markerPlugin.getPointsData(),
                        ...markers,
                    ]);
                }
                if (regions && regions.length > 0) {
                    markerPlugin.loadRegions([
                        ...markerPlugin.getRegionsData(),
                        ...regions,
                    ]);
                }
            }
        }
        this.canvas.requestRenderAll();
    }

    private applySnapshots(snapshots: ObjectSnapshot[]): void {
        for (const snapshot of snapshots) {
            const obj = this.getImageList().find((o) => {
                return this.editor.metadata.get(o)?.id === snapshot.id;
            });
            if (obj) {
                obj.set(snapshot.data as Partial<ImageProps>);
                obj.setCoords();
            }
        }
        this.canvas.requestRenderAll();
    }
}
