import React, { useRef } from "react";
import { useCanvasEditor } from "./hooks";
import { Toolbar, ZoomBar, FloatingToolbar, MarkerLayer } from "./components";
import styles from "./index.module.scss";

/**
 * FabricJS Group 演示页面
 * 采用插件化架构，核心逻辑分离到 core/ 和 plugins/
 */
export default function TestPage33() {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const { canvasElRef, editor } = useCanvasEditor(wrapRef);

  return (
    <div className={styles.page}>
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
