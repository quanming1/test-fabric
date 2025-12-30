import React from "react";
import { Tooltip } from "antd";
import { PlusOutlined, MinusOutlined } from "@ant-design/icons";
import type { ZoomPlugin } from "../plugins/viewport/ZoomPlugin";
import { useEditorEvent } from "../hooks";
import styles from "../index.module.scss";
import { CanvasEditor } from "../core";

interface ZoomBarProps {
  editor: CanvasEditor | null;
}

/**
 * 缩放控制组件
 * 绝对定位到画布底部水平居中，包含：
 * - 缩小按钮（-）
 * - 当前缩放百分比
 * - 放大按钮（+）
 */
export const ZoomBar: React.FC<ZoomBarProps> = ({ editor }) => {
  // 订阅缩放变化事件
  const zoom = useEditorEvent(editor, "zoom:change", 1);
  const zoomPlugin = editor?.getPlugin<ZoomPlugin>("zoom");

  /** 放大 10% */
  const handleZoomIn = () => zoomPlugin?.setZoom(zoom + 0.1);
  /** 缩小 10% */
  const handleZoomOut = () => zoomPlugin?.setZoom(zoom - 0.1);

  // 缩放范围限制
  const minZoom = 0.1;
  const maxZoom = 20;

  return (
    <div className={styles.zoomBar}>
      <Tooltip title="缩小" placement="top">
        <button
          className={styles.zoomBtn}
          onClick={handleZoomOut}
          disabled={zoom <= minZoom}
        >
          <MinusOutlined />
        </button>
      </Tooltip>
      <span className={styles.zoomValue}>{(zoom * 100).toFixed(0)}%</span>
      <Tooltip title="放大" placement="top">
        <button
          className={styles.zoomBtn}
          onClick={handleZoomIn}
          disabled={zoom >= maxZoom}
        >
          <PlusOutlined />
        </button>
      </Tooltip>
    </div>
  );
};
