/**
 * CanvasEditor - 画布编辑器核心组件
 *
 * 这是子项目导出给主项目使用的核心组件
 * 封装了完整的画布编辑功能，包括：
 * - 画布渲染与交互
 * - 插件系统
 * - 多端同步（可选）
 */

import React, { useRef, useImperativeHandle, forwardRef } from "react";
import { useCanvasEditor, useSyncManager } from "../hooks";
import { DOMLayerRenderer } from "../core";
import type { CanvasEditorProps, CanvasEditorRef } from "./types";
import styles from "./styles.module.scss";

const CanvasEditor = forwardRef<CanvasEditorRef, CanvasEditorProps>((props, ref) => {
  const {
    width = "100%",
    height = "100%",
    syncEnabled = false,
    className,
    style,
    onReady,
    onZoomChange,
    onSelectionChange,
  } = props;

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const { canvasElRef, editor } = useCanvasEditor(wrapRef, {
    onReady,
    onZoomChange,
    onSelectionChange,
  });

  // 同步功能
  useSyncManager(editor, { enabled: syncEnabled });

  // 暴露给父组件的方法
  useImperativeHandle(
    ref,
    () => ({
      getEditor: () => editor,
      // 后续可扩展更多方法
    }),
    [editor],
  );

  return (
    <div
      className={`${styles.canvasEditor} ${className || ""}`}
      style={{
        width,
        height,
        ...style,
      }}
    >
      <div ref={wrapRef} className={styles.canvasWrap}>
        <canvas ref={canvasElRef} className={styles.canvasEl} />
        <DOMLayerRenderer editor={editor} />
      </div>
    </div>
  );
});

CanvasEditor.displayName = "CanvasEditor";

export default CanvasEditor;
export { CanvasEditor };
export * from "./types";
