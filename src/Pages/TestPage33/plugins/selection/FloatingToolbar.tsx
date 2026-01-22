import React from "react";
import {
  CopyOutlined,
  DeleteOutlined,
  VerticalAlignTopOutlined,
  VerticalAlignBottomOutlined,
} from "@ant-design/icons";
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

  const handleClone = async () => {
    await selectionPlugin?.cloneSelected();
  };

  const handleBringToFront = () => {
    selectionPlugin?.bringToFront();
  };

  const handleSendToBack = () => {
    selectionPlugin?.sendToBack();
  };

  const handleDelete = async () => {
    await selectionPlugin?.deleteSelected();
  };

  return (
    <div
      className={styles.floatingToolbar}
      style={{
        left: pos.x,
        top: pos.y,
        display: pos.visible ? "flex" : "none",
      }}
    >
      <button className={styles.floatingBtn} onClick={handleClone} title="复制">
        <CopyOutlined />
      </button>
      <button className={styles.floatingBtn} onClick={handleBringToFront} title="置顶">
        <VerticalAlignTopOutlined />
      </button>
      <button className={styles.floatingBtn} onClick={handleSendToBack} title="置底">
        <VerticalAlignBottomOutlined />
      </button>
      <div className={styles.floatingDivider} />
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
