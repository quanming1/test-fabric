import React, { useState, useRef, useEffect } from "react";
import { Tooltip } from "antd";
import { PlusOutlined, MinusOutlined, CloseOutlined } from "@ant-design/icons";
import type { ZoomPlugin } from "../ZoomPlugin";
import { useEditorEvent } from "../../../hooks";
import type { DOMLayerProps } from "../../../core";

const containerStyle: React.CSSProperties = {
  position: "absolute",
  left: 16,
  top: 16,
  display: "flex",
  alignItems: "center",
  gap: 12,
  zIndex: 10,
};

const btnBase: React.CSSProperties = {
  height: 32,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "#fff",
  border: "1px solid #E5E5E5",
  borderRadius: 8,
  cursor: "pointer",
  transition: "background 0.15s",
};

const squareBtnStyle: React.CSSProperties = {
  ...btnBase,
  width: 32,
};

const zoomBarStyle: React.CSSProperties = {
  ...btnBase,
  padding: "0 8px",
  gap: 4,
};

const zoomBtnStyle: React.CSSProperties = {
  width: 32,
  height: 32,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  border: "none",
  background: "transparent",
  borderRadius: 6,
  cursor: "pointer",
  color: "#333",
  fontSize: 14,
  transition: "background 0.15s",
};

const zoomValueStyle: React.CSSProperties = {
  minWidth: 40,
  textAlign: "center",
  fontSize: 12,
  color: "#333",
  fontVariantNumeric: "tabular-nums",
};

// 快捷键数据
const shortcuts = [
  { label: "撤销", keys: ["Ctrl", "Z"] },
  { label: "重做", keys: ["Ctrl", "Shift", "Z"] },
  { label: "删除", keys: ["Delete / Backspace"] },
  { label: "全选", keys: ["Ctrl", "A"] },
  { label: "放大", keys: ["Ctrl", "+"] },
  { label: "缩小", keys: ["Ctrl", "-"] },
  { label: "移动视图", keys: ["空格 + 拖拽"] },
];

/**
 * 快捷键按钮组件
 */
const ShortcutButton: React.FC = () => {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div ref={wrapperRef} style={{ position: "relative" }}>
      <button
        style={squareBtnStyle}
        onClick={() => setOpen(!open)}
        onMouseEnter={(e) => (e.currentTarget.style.background = "#f5f5f5")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
      >
        <span style={{ fontSize: 14 }}>⌨</span>
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            width: 241,
            height: 320,
            background: "#fff",
            borderRadius: 8,
            boxShadow: "0 4px 16px rgba(0, 0, 0, 0.08)",
            padding: "16px",
            boxSizing: "border-box",
          }}
        >
          {/* 标题栏 */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              height: 40,
            }}
          >
            <span style={{ fontSize: 14, fontWeight: 600, color: "#333" }}>快捷键</span>
            <button
              onClick={() => setOpen(false)}
              style={{
                border: "none",
                background: "transparent",
                cursor: "pointer",
                padding: 4,
                display: "flex",
                color: "#999",
              }}
            >
              <CloseOutlined style={{ fontSize: 12 }} />
            </button>
          </div>

          {/* 快捷键列表 */}
          <div style={{ display: "flex", flexDirection: "column" }}>
            {shortcuts.map((item) => (
              <div
                key={item.label}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  height: 40,
                }}
              >
                <span style={{ fontSize: 14, color: "rgba(0, 0, 0, 0.75)" }}>{item.label}</span>
                <span style={{ fontSize: 12, color: "rgba(0, 0, 0, 0.45)" }}>
                  {item.keys.map((key, i) => (
                    <span key={i}>
                      {i > 0 && " + "}
                      {["+", "-"].includes(key) ? (
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: 20,
                            height: 20,
                            background: "#f0f0f0",
                            borderRadius: 4,
                            fontSize: 12,
                          }}
                        >
                          {key}
                        </span>
                      ) : (
                        key
                      )}
                    </span>
                  ))}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * 缩放控制组件
 */
export const ZoomBar: React.FC<DOMLayerProps> = ({ editor }) => {
  const zoom = useEditorEvent(editor, "zoom:change", 1);
  const zoomPlugin = editor?.getPlugin<ZoomPlugin>("zoom");

  const handleZoomIn = () => zoomPlugin?.setZoom(zoom + 0.1);
  const handleZoomOut = () => zoomPlugin?.setZoom(zoom - 0.1);

  const minZoom = 0.1;
  const maxZoom = 20;

  return (
    <div style={containerStyle}>
      {/* 快捷键按钮 */}
      <ShortcutButton />

      {/* 缩放控制 */}
      <div style={zoomBarStyle}>
        <Tooltip title="缩小" placement="bottom">
          <button
            style={{ ...zoomBtnStyle, opacity: zoom <= minZoom ? 0.4 : 1 }}
            onClick={handleZoomOut}
            disabled={zoom <= minZoom}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#f5f5f5")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <MinusOutlined />
          </button>
        </Tooltip>
        <span style={zoomValueStyle}>{(zoom * 100).toFixed(0)}%</span>
        <Tooltip title="放大" placement="bottom">
          <button
            style={{ ...zoomBtnStyle, opacity: zoom >= maxZoom ? 0.4 : 1 }}
            onClick={handleZoomIn}
            disabled={zoom >= maxZoom}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#f5f5f5")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <PlusOutlined />
          </button>
        </Tooltip>
      </div>
    </div>
  );
};
