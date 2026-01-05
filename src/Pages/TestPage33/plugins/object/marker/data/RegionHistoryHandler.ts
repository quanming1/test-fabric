import type { HistoryManager, HistoryRecord, ObjectSnapshot } from "../../../../core";
import type { RegionData } from "../types";

export interface RegionHistoryHandlerOptions {
    historyManager: HistoryManager;
    pluginName: string;
    addRegion: (region: RegionData) => void;
    removeRegion: (id: string) => void;
}

/**
 * 区域标记历史记录处理器
 */
export class RegionHistoryHandler {
    private historyManager: HistoryManager;
    private pluginName: string;
    private addRegion: (region: RegionData) => void;
    private removeRegion: (id: string) => void;

    constructor(options: RegionHistoryHandlerOptions) {
        this.historyManager = options.historyManager;
        this.pluginName = options.pluginName;
        this.addRegion = options.addRegion;
        this.removeRegion = options.removeRegion;
    }

    get isPaused(): boolean {
        return this.historyManager.isPaused;
    }

    // ─── 快照 ─────────────────────────────────────────

    createSnapshot(region: RegionData): ObjectSnapshot {
        return {
            id: region.id,
            data: { type: "region", ...region },
        };
    }

    // ─── 记录操作 ─────────────────────────────────────────

    recordAdd(region: RegionData): void {
        if (this.isPaused) return;
        this.historyManager.addRecord({
            type: "add",
            pluginName: this.pluginName,
            objectIds: [region.id],
            after: [this.createSnapshot(region)],
        });
    }

    recordRemove(region: RegionData): void {
        if (this.isPaused) return;
        this.historyManager.addRecord({
            type: "remove",
            pluginName: this.pluginName,
            objectIds: [region.id],
            before: [this.createSnapshot(region)],
        });
    }

    // ─── 撤销/重做 ─────────────────────────────────────────

    applyUndo(record: HistoryRecord): void {
        this.historyManager.pause();
        try {
            switch (record.type) {
                case "add":
                    for (const id of record.objectIds) {
                        this.removeRegion(id);
                    }
                    break;
                case "remove":
                    if (record.before) {
                        for (const snapshot of record.before) {
                            const data = snapshot.data as unknown as RegionData & { type: string };
                            if (data.type === "region") {
                                this.addRegion({
                                    id: snapshot.id,
                                    targetId: data.targetId,
                                    nx: data.nx,
                                    ny: data.ny,
                                    nw: data.nw,
                                    nh: data.nh,
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
                            const data = snapshot.data as unknown as RegionData & { type: string };
                            if (data.type === "region") {
                                this.addRegion({
                                    id: snapshot.id,
                                    targetId: data.targetId,
                                    nx: data.nx,
                                    ny: data.ny,
                                    nw: data.nw,
                                    nh: data.nh,
                                });
                            }
                        }
                    }
                    break;
                case "remove":
                    for (const id of record.objectIds) {
                        this.removeRegion(id);
                    }
                    break;
            }
        } finally {
            this.historyManager.resume();
        }
    }
}
