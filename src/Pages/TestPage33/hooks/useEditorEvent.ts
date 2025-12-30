import { useState, useEffect } from "react";
import type { CanvasEditor } from "../core/CanvasEditor";

/**
 * 通用事件订阅 Hook
 * 订阅 editor 的事件，自动更新 React state
 *
 * @param editor 编辑器实例
 * @param event 事件名称
 * @param initial 初始值
 */
export function useEditorEvent<T>(
    editor: CanvasEditor | null,
    event: string,
    initial: T
): T {
    const [state, setState] = useState<T>(initial);

    useEffect(() => {
        if (!editor) return;
        // 订阅事件，返回取消订阅函数
        return editor.eventBus.on(event, setState);
    }, [editor, event]);

    return state;
}
