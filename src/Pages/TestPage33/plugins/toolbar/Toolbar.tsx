import React, { useMemo, useState, useRef, useEffect } from "react";
import { Tooltip } from "antd";
import {
  DragOutlined,
  BorderOutlined,
  DeleteOutlined,
  SelectOutlined,
  PictureOutlined,
  GatewayOutlined,
  DownloadOutlined,
  UploadOutlined,
  ExportOutlined,
} from "@ant-design/icons";
import type { ModePlugin } from "../mode/ModePlugin";
import type { MarkerPlugin } from "../object/marker/MarkerPlugin";
import type { ImagePlugin } from "../object/image/ImagePlugin";
import type { ImportExportPlugin } from "../io/ImportExportPlugin";
import { EditorMode } from "../mode/ModePlugin";
import { useEditorEvent } from "../../hooks";
import styles from "../../index.module.scss";
import type { DOMLayerProps } from "../../core";
import { openFilePicker } from "../../utils";

interface ToolItem {
  key: string;
  icon: React.ReactNode;
  tooltip: string;
  onClick?: () => void;
  danger?: boolean;
  mode?: EditorMode;
}

/**
 * 画布工具栏组件
 */
export const Toolbar: React.FC<DOMLayerProps> = ({ editor }) => {
  const modePlugin = editor?.getPlugin<ModePlugin>("mode");
  const [showModePopup, setShowModePopup] = useState(false);
  const modeButtonRef = useRef<HTMLDivElement>(null);

  const modeData = useEditorEvent(editor, "mode:change", { mode: EditorMode.Select });
  const currentMode = modeData?.mode ?? EditorMode.Select;

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (modeButtonRef.current && !modeButtonRef.current.contains(e.target as Node)) {
        setShowModePopup(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleModeChange = (mode: EditorMode) => {
    modePlugin?.setMode(mode);
    setShowModePopup(false);
  };

  const modeOptions = [
    { mode: EditorMode.Select, icon: <SelectOutlined />, label: "选择模式" },
    { mode: EditorMode.Pan, icon: <DragOutlined />, label: "拖拽模式" },
    { mode: EditorMode.DrawRect, icon: <BorderOutlined />, label: "绘制矩形" },
    { mode: EditorMode.RangeSelect, icon: <GatewayOutlined />, label: "区域选择" },
  ];

  const getCurrentModeIcon = () => {
    const option = modeOptions.find((opt) => opt.mode === currentMode);
    return option?.icon ?? <SelectOutlined />;
  };

  const handleClearAll = () => {
    if (!editor) return;
    editor.canvas.getObjects().forEach((obj) => editor.canvas.remove(obj));
    editor.canvas.requestRenderAll();
    editor.getPlugin<MarkerPlugin>("marker")?.clearMarkers();
  };

  const handleUploadImage = async () => {
    const file = await openFilePicker({ accept: "image/*" });
    if (file) {
      await editor?.getPlugin<ImagePlugin>("image")?.addImageFromFile(file);
    }
  };

  const handleExport = () => {
    editor?.getPlugin<ImportExportPlugin>("io")?.export({ download: "canvas.json" });
  };

  const handleImport = () => {
    editor?.getPlugin<ImportExportPlugin>("io")?.import();
  };

  const handleExportImage = async () => {
    const imagePlugin = editor?.getPlugin<ImagePlugin>("image");
    if (!imagePlugin) return;

    const activeObj = editor?.canvas.getActiveObject();
    const imageId = activeObj ? editor?.metadata.getField(activeObj, "id") : null;
    if (!imageId) {
      console.warn("请先选中一张图片");
      return;
    }

    const result = await imagePlugin.exportWithMarkers(imageId);
    if (result) {
      const link = document.createElement("a");
      link.href = result.dataUrl;
      link.download = `export_${imageId}.png`;
      link.click();
    }
  };

  const toolGroups: ToolItem[][] = useMemo(
    () => [
      [
        {
          key: "upload-image",
          icon: <PictureOutlined />,
          tooltip: "上传图片",
          onClick: handleUploadImage,
        },
      ],
      [
        {
          key: "export",
          icon: <DownloadOutlined />,
          tooltip: "导出 JSON",
          onClick: handleExport,
        },
        {
          key: "import",
          icon: <UploadOutlined />,
          tooltip: "导入 JSON",
          onClick: handleImport,
        },
        {
          key: "export-image",
          icon: <ExportOutlined />,
          tooltip: "导出选中图片（含标记）",
          onClick: handleExportImage,
        },
      ],
      [
        {
          key: "clear",
          icon: <DeleteOutlined />,
          tooltip: "清空画布",
          onClick: handleClearAll,
          danger: true,
        },
      ],
    ],
    [editor],
  );

  const handleClick = (item: ToolItem) => {
    if (item.mode !== undefined) {
      handleModeChange(item.mode);
    } else if (item.onClick) {
      item.onClick();
    }
  };

  const isActive = (item: ToolItem): boolean => {
    return item.mode !== undefined && item.mode === currentMode;
  };

  return (
    <div className={styles.toolbarLeft}>
      <div ref={modeButtonRef} className={styles.modeButtonWrapper}>
        <button
          className={`${styles.toolBtn} ${styles.active}`}
          onClick={() => setShowModePopup(!showModePopup)}
        >
          {getCurrentModeIcon()}
        </button>
        {showModePopup && (
          <div className={styles.modePopup}>
            {modeOptions.map((option) => (
              <div
                key={option.mode}
                className={`${styles.modeOption} ${currentMode === option.mode ? styles.active : ""}`}
                onClick={() => handleModeChange(option.mode)}
              >
                {option.icon}
                <span>{option.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={styles.toolDivider} />

      {toolGroups.map((group, groupIndex) => (
        <React.Fragment key={groupIndex}>
          {groupIndex > 0 && <div className={styles.toolDivider} />}
          {group.map((item) => (
            <Tooltip key={item.key} title={item.tooltip} placement="right">
              <button
                className={`
                  ${styles.toolBtn} 
                  ${item.danger ? styles.danger : ""} 
                  ${isActive(item) ? styles.active : ""}
                `}
                onClick={() => handleClick(item)}
              >
                {item.icon}
              </button>
            </Tooltip>
          ))}
        </React.Fragment>
      ))}
    </div>
  );
};
