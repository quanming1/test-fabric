import { BaseHistoryHandler, type HistoryManager, type HistoryRecord, type ObjectSnapshot } from "../../../../core";
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
export class RegionHistoryHandler extends BaseHistoryHandler<RegionData> {
    private addRegion: (region: RegionData) => void;
    private removeRegion: (id: string) => void;

    constructor(options: RegionHistoryHandlerOptions) {
        super(options.historyManager, options.pluginName);
        this.addRegion = options.addRegion;
        this.removeRegion = options.removeRegion;
    }

    // ─── 快照 ─────────────────────────────────────────

    createSnapshot(region: RegionData): ObjectSnapshot {
        return {
            id: region.id,
            data: { type: "region", ...region },
        };
    }

    // ─── 记录操作（简化版）─────────────────────────────────

    recordAddRegion(region: RegionData): void {
        this.recordAdd([region.id], [this.createSnapshot(region)]);
    }

    recordRemoveRegion(region: RegionData): void {
        this.recordRemove([region.id], [this.createSnapshot(region)]);
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
