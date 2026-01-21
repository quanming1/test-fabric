import React, { useRef } from "react";
import { useCanvasEditor, useSyncManager } from "./hooks";
import { Toolbar, ZoomBar, FloatingToolbar, MarkerLayer } from "./components";
import styles from "./index.module.scss";

/**
 * FabricJS Group 演示页面
 * 采用插件化架构，核心逻辑分离到 core/ 和 plugins/
 */
export default function TestPage33() {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const { canvasElRef, editor } = useCanvasEditor(wrapRef);

  // 启用多端同步
  const { initialized } = useSyncManager(editor, {
    enabled: true,
  });

  return (
    <div className={styles.page}>
      {/* 同步状态指示器 */}
      <div
        style={{
          position: "fixed",
          top: 10,
          right: 10,
          padding: "8px 12px",
          background: initialized ? "#4caf50" : "#ff9800",
          color: "#fff",
          borderRadius: 4,
          fontSize: 12,
          zIndex: 9999,
        }}
      >
        {initialized ? "同步已连接" : "连接中..."}
      </div>

      <div className={styles.stage}>
        <div ref={wrapRef} className={styles.canvasWrap}>
          <Toolbar editor={editor} />
          <ZoomBar editor={editor} />
          <MarkerLayer editor={editor} />
          <FloatingToolbar editor={editor} />
          <canvas ref={canvasElRef} className={styles.canvasEl} />
        </div>
      </div>
    </div>
  );
}
