import React from "react";
import type { CanvasEditor } from "../core/CanvasEditor";
import type { MarkPoint, PointView } from "../core/types";
import { useEditorEvent } from "../hooks";
import styles from "../index.module.scss";

interface MarkerLayerProps {
  editor: CanvasEditor | null;
}

export const MarkerLayer: React.FC<MarkerLayerProps> = ({ editor }) => {
  // 订阅标记点数据和视图位置
  const markers = useEditorEvent<MarkPoint[]>(editor, "markers:change", []);
  const views = useEditorEvent<Record<string, PointView>>(editor, "markers:viewUpdate", {});

  return (
    <div className={styles.markerLayer}>
      {markers.map((p, index) => {
        const pos = views[p.id];
        if (!pos) return null;
        return (
          <div
            key={p.id}
            className={styles.markerDot}
            style={{ left: pos.x, top: pos.y }}
          >
            <span>{index + 1}</span>
          </div>
        );
      })}
    </div>
  );
};
