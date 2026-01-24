/**
 * 子项目导出入口
 * 
 * 主项目使用方式：
 * import { CanvasEditor } from 'your-lib-name';
 * 
 * <CanvasEditor
 *   width="100%"
 *   height="600px"
 *   syncEnabled={false}
 *   onReady={(editor) => console.log('ready', editor)}
 * />
 */

// 核心组件
export { CanvasEditor, default as CanvasEditorDefault } from "../Pages/TestPage33/CanvasEditor";

// 类型导出
export type {
    CanvasEditorProps,
    CanvasEditorRef,
} from "../Pages/TestPage33/CanvasEditor";

// 核心类型（主项目可能需要）
export type {
    MarkPoint,
    ToolbarPosition,
    EditorEvents,
} from "../Pages/TestPage33/core/types";
