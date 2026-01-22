import React from "react";
import { Tooltip } from "antd";
import { PlusOutlined, MinusOutlined } from "@ant-design/icons";
import type { ZoomPlugin } from "../ZoomPlugin";
import { useEditorEvent } from "../../../hooks";
import styles from "../../../index.module.scss";
import type { DOMLayerProps } from "../../../core";

/**
 * 缩放控制组件
 * 绝对定位到画布底部水平居中
 */
export const ZoomBar: React.FC<DOMLayerProps> = ({ editor }) => {
  const zoom = useEditorEvent(editor, "zoom:change", 1);
  const zoomPlugin = editor?.getPlugin<ZoomPlugin>("zoom");

  const handleZoomIn = () => zoomPlugin?.setZoom(zoom + 0.1);
  const handleZoomOut = () => zoomPlugin?.setZoom(zoom - 0.1);

  const minZoom = 0.1;
  const maxZoom = 20;

  return (
    <div className={styles.zoomBar}>
      <Tooltip title="缩小" placement="top">
        <button className={styles.zoomBtn} onClick={handleZoomOut} disabled={zoom <= minZoom}>
          <MinusOutlined />
        </button>
      </Tooltip>
      <span className={styles.zoomValue}>{(zoom * 100).toFixed(0)}%</span>
      <Tooltip title="放大" placement="top">
        <button className={styles.zoomBtn} onClick={handleZoomIn} disabled={zoom >= maxZoom}>
          <PlusOutlined />
        </button>
      </Tooltip>
    </div>
  );
};
