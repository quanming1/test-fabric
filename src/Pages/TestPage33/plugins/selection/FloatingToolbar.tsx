import React, { useRef, useEffect } from "react";
import { DownloadOutlined, DeleteOutlined } from "@ant-design/icons";
import type { ToolbarPosition, DOMLayerProps } from "../../core";
import { useEditorEvent } from "../../hooks";
import type { SelectionPlugin } from "./SelectionPlugin";
import styles from "../../index.module.scss";

const initialPos: ToolbarPosition = { x: 0, y: 0, visible: false };

/**
 * 浮动工具栏组件
 * 跟随选中对象显示
 */
export const FloatingToolbar: React.FC<DOMLayerProps> = ({ editor }) => {
  const pos = useEditorEvent(editor, "toolbar:update", initialPos);
  const selectionPlugin = editor?.getPlugin<SelectionPlugin>("selection");
  const toolbarRef = useRef<HTMLDivElement>(null);
  const hasMeasured = useRef(false);

  // 工具栏可见时测量宽度并通知插件（只测量一次）
  useEffect(() => {
    if (pos.visible && toolbarRef.current && selectionPlugin && !hasMeasured.current) {
      const width = toolbarRef.current.offsetWidth;
      if (width > 0) {
        selectionPlugin.setToolbarWidth(width);
        hasMeasured.current = true;
      }
    }
  }, [pos.visible, selectionPlugin]);

  const handleDownload = () => {
    // TODO: 实现下载功能
  };

  const handleDelete = async () => {
    await selectionPlugin?.deleteSelected();
  };

  return (
    <div
      ref={toolbarRef}
      className={styles.floatingToolbar}
      style={{
        left: pos.x,
        top: pos.y,
        display: pos.visible ? "flex" : "none",
      }}
    >
      <button className={styles.floatingBtn} onClick={handleDownload} title="下载">
        <DownloadOutlined />
      </button>
      <button
        className={`${styles.floatingBtn} ${styles.danger}`}
        onClick={handleDelete}
        title="删除"
      >
        <DeleteOutlined />
      </button>
    </div>
  );
};
