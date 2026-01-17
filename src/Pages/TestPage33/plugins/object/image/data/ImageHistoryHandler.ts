import { type FabricObject } from "fabric";
import { BaseHistoryHandler, Category, type HistoryRecord, type ObjectSnapshot, type HistoryManager, type CanvasEditor } from "../../../../core";
import type { PointData, RegionData } from "../../marker/types";
import { ImageFactory } from "../helper";
import { EXTRA_PROPS } from "../types";

// 前向声明，避免循环依赖
import type { ImageManager } from "./ImageManager";

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
    manager: ImageManager;  // 持有 ImageManager 引用
}

/**
 * 图片历史记录处理器
 * 
 * 职责：
 * 1. 创建和管理快照
 * 2. 记录历史操作
 * 3. 执行撤销/重做时，调用 ImageManager 的方法
 * 
 * 注意：不直接操作 canvas/renderer，而是通过 ImageManager
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
     * 从快照恢复图片
     * 通过 ImageManager.add 添加，不记录历史
     */
    private async restoreImages(snapshots: ObjectSnapshot[]): Promise<void> {
        for (const snapshot of snapshots) {
            const img = await ImageFactory.fromSnapshot(snapshot.data);

            // 通过 manager.add 添加，不记录历史
            this.manager.add(img, {
                id: snapshot.id,
                recordHistory: false,
                needSync: false,
                setActive: false,
            });

            // 恢复关联的标记数据
            this.restoreMarkers(snapshot);
        }
    }

    /**
     * 恢复关联的标记数据
     */
    private restoreMarkers(snapshot: ObjectSnapshot): void {
        const markerPlugin = this.markerPlugin;
        if (!markerPlugin) return;

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

    /**
     * 应用快照到现有图片（用于 modify 的撤销/重做）
     */
    private applySnapshots(snapshots: ObjectSnapshot[]): void {
        for (const snapshot of snapshots) {
            const obj = this.manager.getById(snapshot.id);
            if (obj) {
                obj.set(snapshot.data as any);
                obj.setCoords();
            }
        }
        this.editor.canvas.requestRenderAll();
    }
}
