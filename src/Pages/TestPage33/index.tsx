import React, { useRef } from "react";
import { useCanvasEditor, useSyncManager } from "./hooks";
import { DOMLayerRenderer } from "./core";
import styles from "./index.module.scss";

const config = {
  width: "100%",
  height: "100%",
};

/**
 * FabricJS Group 演示页面
 * 采用插件化架构，核心逻辑分离到 core/ 和 plugins/
 */
export default function TestPage33() {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const { canvasElRef, editor } = useCanvasEditor(wrapRef);

  useSyncManager(editor, { enabled: true });

  return (
    <div
      className={styles.page}
      style={{
        width: config.width,
        height: config.height,
      }}
    >
      <div ref={wrapRef} className={styles.canvasWrap}>
        <canvas ref={canvasElRef} className={styles.canvasEl} />
        <DOMLayerRenderer editor={editor} />
      </div>
    </div>
  );
}
