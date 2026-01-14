import type { HistoryManager } from "../HistoryManager";
import type { HistoryRecord, ObjectSnapshot, AddRecordOptions } from "../types";

/**
 * 历史记录处理器抽象基类
 * 
 * 职责：提供历史记录的通用操作模板
 * - 快照创建（子类实现）
 * - 记录添加/删除/修改操作
 * - 撤销/重做应用（子类实现）
 * 
 * @template TData 数据类型（如 PointData、RegionData、FabricObject 等）
 */
export abstract class BaseHistoryHandler<TData = unknown> {
    protected historyManager: HistoryManager;
    protected pluginName: string;
    /** 是否默认需要同步，子类可覆盖 */
    protected defaultNeedSync = false;

    constructor(historyManager: HistoryManager, pluginName: string) {
        this.historyManager = historyManager;
        this.pluginName = pluginName;
    }

    /** 是否暂停记录 */
    get isPaused(): boolean {
        return this.historyManager.isPaused;
    }

    // ─── 快照（子类实现）─────────────────────────────────

    /**
     * 创建对象快照
     * @param target 目标数据
     * @param includeRelated 是否包含关联数据（如标记）
     */
    abstract createSnapshot(target: TData, includeRelated?: boolean): ObjectSnapshot;

    /**
     * 获取对象 ID（子类可选实现，用于 recordClone/recordDelete）
     */
    protected getId?(target: TData): string | undefined;

    // ─── 记录操作 ─────────────────────────────────────────

    /**
     * 记录添加操作
     */
    recordAdd(objectIds: string[], after: ObjectSnapshot[], options?: AddRecordOptions): void {
        if (this.isPaused) return;
        this.historyManager.addRecord({
            type: "add",
            pluginName: this.pluginName,
            objectIds,
            after,
        }, { needSync: this.defaultNeedSync, ...options });
    }

    /**
     * 记录删除操作
     */
    recordRemove(objectIds: string[], before: ObjectSnapshot[], options?: AddRecordOptions): void {
        if (this.isPaused) return;
        this.historyManager.addRecord({
            type: "remove",
            pluginName: this.pluginName,
            objectIds,
            before,
        }, { needSync: this.defaultNeedSync, ...options });
    }

    /**
     * 记录修改操作
     */
    recordModify(objectIds: string[], before: ObjectSnapshot[], after: ObjectSnapshot[], options?: AddRecordOptions): void {
        if (this.isPaused) return;
        this.historyManager.addRecord({
            type: "modify",
            pluginName: this.pluginName,
            objectIds,
            before,
            after,
        }, { needSync: this.defaultNeedSync, ...options });
    }

    /**
     * 记录复制操作（可选，需实现 getId）
     */
    recordClone?(targets: TData[]): void;

    /**
     * 记录删除操作（可选，需实现 getId）
     */
    recordDelete?(targets: TData[]): void;

    // ─── 撤销/重做（子类实现）─────────────────────────────

    /**
     * 应用撤销操作
     */
    abstract applyUndo(record: HistoryRecord): void;

    /**
     * 应用重做操作
     */
    abstract applyRedo(record: HistoryRecord): void;
}
