import { BasePlugin } from "../base/Plugin";
import { Toolbar } from "./Toolbar";

/**
 * 工具栏插件
 * 注册左侧工具栏 DOM 图层
 */
export class ToolbarPlugin extends BasePlugin {
    readonly name = "toolbar";

    protected onInstall(): void {
        this.editor.domLayer.register("toolbar", Toolbar);
    }

    protected onDestroy(): void {
        this.editor.domLayer.unregister("toolbar");
    }
}
