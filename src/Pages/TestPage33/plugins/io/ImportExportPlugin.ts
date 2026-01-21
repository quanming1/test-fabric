import { BasePlugin } from "../base/Plugin";
import { downloadBlob, ensureExtension, openFilePicker } from "../../utils";
import type { ExportOptions, ImportOptions, CanvasJSON, ImageExportData } from "./types";

/** 导入导出插件配置 */
export interface ImportExportPluginOptions {
    /** 导入时是否默认清空画布，默认 true */
    clearOnImport?: boolean;
}

/**
 * 导入导出插件
 * 功能：画布内容的 JSON 导入导出
 */
export class ImportExportPlugin extends BasePlugin {
    readonly name = "io";

    private clearOnImport: boolean;

    constructor(options?: ImportExportPluginOptions) {
        super();
        this.clearOnImport = options?.clearOnImport ?? true;
    }

    protected onInstall(): void { }
    protected onDestroy(): void { }

    // ─────────────────────────────────────────────────────
    // 公开 API
    // ─────────────────────────────────────────────────────

    /** 导出画布为 JSON（图片对象数组） */
    async export(options: ExportOptions = {}): Promise<CanvasJSON> {
        this.eventBus.emit("io:export:start", undefined);

        try {
            const result = this.toJSON();
            this.eventBus.emit("io:export:complete", { data: result });

            if (options.download) {
                const jsonStr = JSON.stringify(result, null, 2);
                const blob = new Blob([jsonStr], { type: "application/json" });
                downloadBlob(blob, ensureExtension(options.download, ".json"));
            }

            return result;
        } catch (error) {
            this.eventBus.emit("io:export:error", { error: error as Error });
            throw error;
        }
    }

    /** 导入画布，支持 JSON 数组、字符串、File，不传则打开文件选择器 */
    async import(source?: CanvasJSON | string | File, options: ImportOptions = {}): Promise<void> {
        if (!source) {
            const file = await openFilePicker({ accept: ".json" });
            if (!file) return;
            source = file;
        }

        this.eventBus.emit("io:import:start", undefined);

        try {
            const data = await this.parseSource(source);

            // 使用传入的 clearCanvas，否则用默认配置
            const shouldClear = options.clearCanvas ?? this.clearOnImport;
            if (shouldClear) {
                this.canvas.clear();
                this.forEachSerializable((plugin) => plugin.clearAll?.());
            }

            // 直接导入图片数据到 ImagePlugin
            const imagePlugin = this.editor.getPlugin<BasePlugin>("image");
            if (imagePlugin && Array.isArray(data) && data.length > 0) {
                await imagePlugin.importData?.(data);
            }

            this.canvas.requestRenderAll();

            this.eventBus.emit("io:import:complete", { objects: this.canvas.getObjects() });
        } catch (error) {
            this.eventBus.emit("io:import:error", { error: error as Error });
            throw error;
        }
    }

    // ─────────────────────────────────────────────────────
    // 私有方法
    // ─────────────────────────────────────────────────────

    /** 导出为图片对象数组 */
    private toJSON(): CanvasJSON {
        const imagePlugin = this.editor.getPlugin<BasePlugin>("image");
        if (imagePlugin?.serializable) {
            return (imagePlugin.exportData?.() as ImageExportData[]) ?? [];
        }
        return [];
    }

    private async parseSource(source: CanvasJSON | string | File): Promise<CanvasJSON> {
        if (source instanceof File) {
            return JSON.parse(await source.text());
        }
        if (typeof source === "string") {
            return JSON.parse(source);
        }
        return source;
    }

    private forEachSerializable(callback: (plugin: BasePlugin, name: string) => void): void {
        this.editor.getPlugins().forEach((plugin, name) => {
            if (name !== this.name && plugin instanceof BasePlugin && plugin.serializable) {
                callback(plugin, name);
            }
        });
    }
}
