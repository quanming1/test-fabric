import React, { useState, useEffect } from "react";
import type { DOMLayerProps } from "../../../core";

/**
 * 加载遮罩层
 * 初始显示，同步完成后淡出消失
 */
export const LoadingOverlay: React.FC<DOMLayerProps> = ({ editor }) => {
  const [visible, setVisible] = useState(true);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const handleInitialized = () => {
      setFading(true);
      setTimeout(() => setVisible(false), 300);
    };

    editor.eventBus.on("sync:initialized", handleInitialized);
    return () => {
      editor.eventBus.off("sync:initialized", handleInitialized);
    };
  }, [editor]);

  if (!visible) return null;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#fff",
        opacity: fading ? 0 : 1,
        transition: "opacity 0.3s ease",
        pointerEvents: fading ? "none" : "auto",
        zIndex: 999,
      }}
    >
      <div style={{ textAlign: "center" }}>
        <div
          style={{
            width: 40,
            height: 40,
            border: "3px solid #e0e0e0",
            borderTopColor: "#3b82f6",
            borderRadius: "50%",
            animation: "loading-spin 0.8s linear infinite",
            margin: "0 auto 12px",
          }}
        />
        <div style={{ color: "#666", fontSize: 14 }}>加载中...</div>
        <style>{`
          @keyframes loading-spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    </div>
  );
};
