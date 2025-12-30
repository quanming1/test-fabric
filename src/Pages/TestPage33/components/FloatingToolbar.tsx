import React from "react";
import { Button, Space } from "antd";
import type { CanvasEditor } from "../core/CanvasEditor";
import type { ToolbarPosition } from "../core/types";
import { useEditorEvent } from "../hooks";
import { SelectionPlugin } from "../plugins";
import styles from "../index.module.scss";

interface FloatingToolbarProps {
  editor: CanvasEditor | null;
}

const initialPos: ToolbarPosition = { x: 0, y: 0, visible: false };

export const FloatingToolbar: React.FC<FloatingToolbarProps> = ({ editor }) => {
  // 订阅工具栏位置事件
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

  const handleDelete = () => {
    selectionPlugin?.deleteSelected();
  };

  return (
    <div
      className={styles.objectToolbar}
      style={{
        left: pos.x,
        top: pos.y,
        display: pos.visible ? "block" : "none",
      }}
    >
      <Space size={4}>
        <Button size="small" onClick={handleClone}>
          复制
        </Button>
        <Button size="small" onClick={handleBringToFront}>
          置顶
        </Button>
        <Button size="small" onClick={handleSendToBack}>
          置底
        </Button>
        <Button size="small" danger onClick={handleDelete}>
          删除
        </Button>
      </Space>
    </div>
  );
};
