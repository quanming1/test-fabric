import React from "react";
import { Tooltip } from "antd";
import { SelectOutlined, PictureOutlined, GatewayOutlined } from "@ant-design/icons";
import type { ModePlugin } from "../mode/ModePlugin";
import type { ImagePlugin } from "../object/image/ImagePlugin";
import type { MarkerPlugin } from "../object/marker/MarkerPlugin";
import { EditorMode } from "../mode/ModePlugin";
import { useEditorEvent } from "../../hooks";
import type { DOMLayerProps } from "../../core";
import { openFilePicker } from "../../utils";

const containerStyle: React.CSSProperties = {
  position: "absolute",
  bottom: 24,
  left: "50%",
  transform: "translateX(-50%)",
  display: "flex",
  alignItems: "center",
  gap: 4,
  padding: 4,
  background: "#fff",
  borderRadius: 12,
  boxShadow: "0 4px 16px rgba(0, 0, 0, 0.1)",
  zIndex: 10,
};

const btnStyle: React.CSSProperties = {
  width: 40,
  height: 40,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  border: "none",
  background: "transparent",
  borderRadius: 8,
  cursor: "pointer",
  color: "#333",
  fontSize: 18,
  transition: "all 0.15s",
};

const activeBtnStyle: React.CSSProperties = {
  ...btnStyle,
  background: "#f5f5f5",
};

const dividerStyle: React.CSSProperties = {
  width: 1,
  height: 24,
  background: "#e5e5e5",
  margin: "0 8px",
};

const colorDotStyle = (color: string, active: boolean): React.CSSProperties => ({
  width: 20,
  height: 20,
  borderRadius: "50%",
  background: color,
  cursor: "pointer",
  border: active ? "2px solid #333" : "2px solid transparent",
  boxSizing: "border-box",
});

const hintTextStyle: React.CSSProperties = {
  fontSize: 14,
  color: "rgba(0, 0, 0, 0.65)",
  marginLeft: 8,
  whiteSpace: "nowrap",
};

const exitBtnStyle: React.CSSProperties = {
  padding: "6px 16px",
  fontSize: 14,
  color: "#333",
  background: "#f5f5f5",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  marginLeft: 8,
  transition: "background 0.15s",
};

const colors = [
  { key: "red", color: "#ff645d" },
  { key: "orange", color: "#ffb500" },
  { key: "green", color: "#00f34a" },
  { key: "blue", color: "#00aeff" },
];

/**
 * 底部工具栏组件
 */
export const Toolbar: React.FC<DOMLayerProps> = ({ editor }) => {
  const modePlugin = editor?.getPlugin<ModePlugin>("mode");
  const markerPlugin = editor?.getPlugin<MarkerPlugin>("marker");
  const modeData = useEditorEvent(editor, "mode:change", { mode: EditorMode.Select });
  const currentMode = modeData?.mode ?? EditorMode.Select;
  const [selectedColor, setSelectedColor] = React.useState("red");

  // 初始化时设置默认颜色
  React.useEffect(() => {
    markerPlugin?.setTheme(colors[0].color);
  }, [markerPlugin]);

  const handleColorChange = (key: string, color: string) => {
    setSelectedColor(key);
    markerPlugin?.setTheme(color);
  };

  const isRangeSelectMode = currentMode === EditorMode.RangeSelect;

  const handleSelectMode = () => {
    modePlugin?.setMode(EditorMode.Select);
  };

  const handleUploadImage = async () => {
    const file = await openFilePicker({ accept: "image/*" });
    if (file) {
      await editor?.getPlugin<ImagePlugin>("image")?.addImageFromFile(file);
    }
  };

  const handleRangeSelectMode = () => {
    modePlugin?.setMode(EditorMode.RangeSelect);
  };

  const handleExit = () => {
    // 退出框选模式，回到选择模式
    modePlugin?.setMode(EditorMode.Select);
  };

  const tools = [
    {
      key: "select",
      icon: <SelectOutlined />,
      tooltip: "选择模式",
      onClick: handleSelectMode,
      active: currentMode === EditorMode.Select,
    },
    {
      key: "upload",
      icon: <PictureOutlined />,
      tooltip: "上传图片",
      onClick: handleUploadImage,
      active: false,
    },
    {
      key: "range-select",
      icon: <GatewayOutlined />,
      tooltip: "框选模式",
      onClick: handleRangeSelectMode,
      active: currentMode === EditorMode.RangeSelect,
    },
  ];

  return (
    <div style={containerStyle}>
      {/* 工具按钮 */}
      {tools.map((tool) => (
        <Tooltip key={tool.key} title={tool.tooltip} placement="top">
          <button
            style={tool.active ? activeBtnStyle : btnStyle}
            onClick={tool.onClick}
            onMouseEnter={(e) => {
              if (!tool.active) e.currentTarget.style.background = "#f5f5f5";
            }}
            onMouseLeave={(e) => {
              if (!tool.active) e.currentTarget.style.background = "transparent";
            }}
          >
            {tool.icon}
          </button>
        </Tooltip>
      ))}

      {/* 框选模式下展开的内容 */}
      {isRangeSelectMode && (
        <>
          <div style={dividerStyle} />

          {/* 颜色选择 */}
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {colors.map((c) => (
              <div
                key={c.key}
                style={colorDotStyle(c.color, selectedColor === c.key)}
                onClick={() => handleColorChange(c.key, c.color)}
              />
            ))}
          </div>

          {/* 提示文字 */}
          <span style={hintTextStyle}>点击或选择编辑的区域</span>

          {/* 退出按钮 */}
          <button
            style={exitBtnStyle}
            onClick={handleExit}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#e8e8e8")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "#f5f5f5")}
          >
            退出
          </button>
        </>
      )}
    </div>
  );
};
