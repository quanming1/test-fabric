import { FabricImage, type FabricObject, type TOptions, type ImageProps } from "fabric";
import { BaseHistoryHandler, Category, type HistoryRecord, type ObjectSnapshot, type HistoryManager, type CanvasEditor } from "../../../core";
import type { PointData, RegionData } from "../marker/types";

/** 图片需要额外序列化的属性 */
const EXTRA_PROPS = ["data", "src", "crossOrigin"] as const;

/** MarkerPlugin 需要的方法接口 */
interface MarkerPluginApi {
    getMarkersForTarget(targetId: string): { points: PointData[]; regions: RegionData[] };
    getPointsData(): PointData[];
    getRegionsData(): RegionData[];
    loadPoints(data: PointData[]): void;
    loadRegions(data: RegionData[]): void;
}

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
export class ImageHistoryHandler extends BaseHistoryHandler<FabricObject> {
    private editor: CanvasEditor;
    private getImageList: () => FabricObject[];

    /** 变换开始时的快照 */
    private transformStartSnapshots = new Map<string, ObjectSnapshot>();

    constructor(options: ImageHistoryHandlerOptions) {
        super(options.historyManager, options.pluginName);
        this.editor = options.editor;
        this.getImageList = options.getImageList;
    }

    private get canvas() {
        return this.editor.canvas;
    }

    private get markerPlugin(): MarkerPluginApi | null {
        return (this.editor.getPlugin("marker") as unknown as MarkerPluginApi) ?? null;
    }

    // ─── 快照 ─────────────────────────────────────────

    createSnapshot(obj: FabricObject, includeMarkers = false): ObjectSnapshot {
        const id = this.editor.metadata.get(obj)?.id ?? "";
        const data: Record<string, unknown> = {
            ...obj.toObject([...EXTRA_PROPS]),
        };

        if (includeMarkers && id) {
            const markerData = this.markerPlugin?.getMarkersForTarget(id);
            if (markerData) {
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
                beforeSnapshots.push(this.createSnapshot(obj, true));
            }
        }

        if (objectIds.length > 0) {
            this.recordRemove(objectIds, beforeSnapshots);
        }
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
        for (const snapshot of snapshots) {
            const img = await FabricImage.fromObject(snapshot.data as TOptions<ImageProps>);
            this.canvas.add(img as unknown as FabricObject);

            // 恢复关联的标记数据
            const markerPlugin = this.markerPlugin;
            if (markerPlugin) {
                const markers = snapshot.data._markers as PointData[] | undefined;
                const regions = snapshot.data._regions as RegionData[] | undefined;
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
