import { useEffect, useRef, useState } from "react";
import { SyncManager, type SyncManagerOptions, type CanvasEditor } from "../core";

export interface UseSyncManagerOptions extends SyncManagerOptions {
    /** 是否启用同步，默认 false */
    enabled?: boolean;
}

export interface UseSyncManagerReturn {
    /** 同步管理器实例 */
    syncManager: SyncManager | null;
    /** 是否已初始化完成 */
    initialized: boolean;
    /** 初始化错误 */
    error: Error | null;
}

/**
 * 同步管理器 Hook
 * 负责创建和管理 SyncManager 生命周期
 */
export function useSyncManager(
    editor: CanvasEditor | null,
    options?: UseSyncManagerOptions
): UseSyncManagerReturn {
    const { enabled = false, ...syncOptions } = options ?? {};
    const syncManagerRef = useRef<SyncManager | null>(null);
    const [initialized, setInitialized] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        if (!editor || !enabled) {
            return;
        }

        // 创建同步管理器
        const syncManager = new SyncManager(editor, syncOptions);
        syncManagerRef.current = syncManager;

        // 将同步管理器注入到历史管理器
        editor.history.setSyncManager(syncManager);

        // 初始化同步
        syncManager
            .initialize()
            .then(() => {
                setInitialized(true);
                setError(null);
            })
            .catch((err) => {
                console.error("[useSyncManager] 初始化失败:", err);
                setError(err);
                setInitialized(false);
            });

        return () => {
            syncManager.destroy();
            syncManagerRef.current = null;
            editor.history.setSyncManager(null);
            setInitialized(false);
        };
    }, [editor, enabled]);

    return {
        syncManager: syncManagerRef.current,
        initialized,
        error,
    };
}
