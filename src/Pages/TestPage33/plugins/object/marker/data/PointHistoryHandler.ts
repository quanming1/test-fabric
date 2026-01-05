import type { HistoryManager, HistoryRecord, ObjectSnapshot } from "../../../../core";
import type { PointData } from "../types";

export interface PointHistoryHandlerOptions {
    historyManager: HistoryManager;
    pluginName: string;
    addPoint: (point: PointData) => void;
    removePoint: (id: string) => void;
}

/**
 * 点标记历史记录处理器
 */
export class PointHistoryHandler {
    private historyManager: HistoryManager;
    private pluginName: string;
    private addPoint: (point: PointData) => void;
    private removePoint: (id: string) => void;

    constructor(options: PointHistoryHandlerOptions) {
        this.historyManager = options.historyManager;
        this.pluginName = options.pluginName;
        this.addPoint = options.addPoint;
        this.removePoint = options.removePoint;
    }

    get isPaused(): boolean {
        return this.historyManager.isPaused;
    }

    // ─── 快照 ─────────────────────────────────────────

    createSnapshot(point: PointData): ObjectSnapshot {
        return {
            id: point.id,
            data: { type: "point", ...point },
        };
    }

    // ─── 记录操作 ─────────────────────────────────────────

    recordAdd(point: PointData): void {
        if (this.isPaused) return;
        this.historyManager.addRecord({
            type: "add",
            pluginName: this.pluginName,
            objectIds: [point.id],
            after: [this.createSnapshot(point)],
        });
    }

    recordRemove(point: PointData): void {
        if (this.isPaused) return;
        this.historyManager.addRecord({
            type: "remove",
            pluginName: this.pluginName,
            objectIds: [point.id],
            before: [this.createSnapshot(point)],
        });
    }

    // ─── 撤销/重做 ─────────────────────────────────────────

    applyUndo(record: HistoryRecord): void {
        this.historyManager.pause();
        try {
            switch (record.type) {
                case "add":
                    for (const id of record.objectIds) {
                        this.removePoint(id);
                    }
                    break;
                case "remove":
                    if (record.before) {
                        for (const snapshot of record.before) {
                            const data = snapshot.data as unknown as PointData & { type: string };
                            if (data.type === "point") {
                                this.addPoint({
                                    id: snapshot.id,
                                    targetId: data.targetId,
                                    nx: data.nx,
                                    ny: data.ny,
                                });
                            }
                        }
                    }
                    break;
            }
        } finally {
            this.historyManager.resume();
        }
    }

    applyRedo(record: HistoryRecord): void {
        this.historyManager.pause();
        try {
            switch (record.type) {
                case "add":
                    if (record.after) {
                        for (const snapshot of record.after) {
                            const data = snapshot.data as unknown as PointData & { type: string };
                            if (data.type === "point") {
                                this.addPoint({
                                    id: snapshot.id,
                                    targetId: data.targetId,
                                    nx: data.nx,
                                    ny: data.ny,
                                });
                            }
                        }
                    }
                    break;
                case "remove":
                    for (const id of record.objectIds) {
                        this.removePoint(id);
                    }
                    break;
            }
        } finally {
            this.historyManager.resume();
        }
    }
}
