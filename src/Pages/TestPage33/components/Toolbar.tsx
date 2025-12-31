import React, { useMemo, useState, useRef, useEffect } from "react";
import { Tooltip } from "antd";
import {
  DragOutlined,
  BorderOutlined,
  DeleteOutlined,
  SelectOutlined,
  PictureOutlined,
} from "@ant-design/icons";
import type { ModePlugin } from "../plugins/mode/ModePlugin";
import type { MarkerPlugin } from "../plugins/object/marker/MarkerPlugin";
import type { ImagePlugin } from "../plugins/object/image/ImagePlugin";
import { EditorMode } from "../plugins/mode/ModePlugin";
import { useEditorEvent } from "../hooks";
import styles from "../index.module.scss";
import { CanvasEditor } from "../core";
import { openFilePicker } from "../utils";

/**
 * 工具项配置接口
 */
interface ToolItem {
  /** 唯一标识，同时作为模式值（如果是模式切换按钮） */
  key: string;
  /** 图标 */
  icon: React.ReactNode;
  /** 提示文字 */
  tooltip: string;
  /** 点击回调（非模式切换按钮使用） */
  onClick?: () => void;
  /** 是否为危险操作（红色样式） */
  danger?: boolean;
  /** 关联的模式（模式切换按钮使用） */
  mode?: EditorMode;
}

interface ToolbarProps {
  editor: CanvasEditor | null;
}

/**
 * 画布工具栏组件
 * 左侧工具按钮组：
 * - 模式切换（选择/拖拽）
 * - 绘制工具（矩形）
 * - 清空画布
 *
 * 采用配置化方式，通过 toolGroups 数组定义工具按钮
 */
export const Toolbar: React.FC<ToolbarProps> = ({ editor }) => {
  const modePlugin = editor?.getPlugin<ModePlugin>("mode");
  const [showModePopup, setShowModePopup] = useState(false);
  const modeButtonRef = useRef<HTMLDivElement>(null);

  // 订阅模式变化事件
  const modeData = useEditorEvent(editor, "mode:change", { mode: EditorMode.Select });
  const currentMode = modeData?.mode ?? EditorMode.Select;

  // 点击外部关闭弹窗
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (modeButtonRef.current && !modeButtonRef.current.contains(e.target as Node)) {
        setShowModePopup(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // ============ 模式切换 ============
  /** 切换到指定模式 */
  const handleModeChange = (mode: EditorMode) => {
    modePlugin?.setMode(mode);
    setShowModePopup(false);
  };

  /** 模式选项配置 */
  const modeOptions = [
    { mode: EditorMode.Select, icon: <SelectOutlined />, label: "选择模式" },
    { mode: EditorMode.Pan, icon: <DragOutlined />, label: "拖拽模式" },
    { mode: EditorMode.DrawRect, icon: <BorderOutlined />, label: "绘制矩形" },
  ];

  /** 获取当前模式的图标 */
  const getCurrentModeIcon = () => {
    const option = modeOptions.find((opt) => opt.mode === currentMode);
    return option?.icon ?? <SelectOutlined />;
  };

  // ============ 其他操作 ============
  /** 清空画布所有对象 */
  const handleClearAll = () => {
    if (!editor) return;
    editor.canvas.getObjects().forEach((obj) => editor.canvas.remove(obj));
    editor.render();
    editor.getPlugin<MarkerPlugin>("marker")?.clearMarkers();
  };

  /** 上传图片 */
  const handleUploadImage = async () => {
    const file = await openFilePicker({ accept: "image/*" });
    if (file) {
      await editor?.getPlugin<ImagePlugin>("image")?.addImageFromFile(file);
    }
  };

  // ============ 工具栏配置 ============
  /**
   * 工具按钮分组配置
   * 每个子数组为一组，组之间会显示分隔线
   */
  const toolGroups: ToolItem[][] = useMemo(
    () => [
      // 第一组：上传图片
      [
        {
          key: "upload-image",
          icon: <PictureOutlined />,
          tooltip: "上传图片",
          onClick: handleUploadImage,
        },
      ],
      // 第二组：危险操作
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

  /**
   * 处理按钮点击
   */
  const handleClick = (item: ToolItem) => {
    if (item.mode !== undefined) {
      handleModeChange(item.mode);
    } else if (item.onClick) {
      item.onClick();
    }
  };

  /**
   * 判断按钮是否激活
   */
  const isActive = (item: ToolItem): boolean => {
    return item.mode !== undefined && item.mode === currentMode;
  };

  return (
    // 左侧工具栏 - 绝对定位到画布左侧垂直居中
    <div className={styles.toolbarLeft}>
      {/* 模式切换按钮（带弹窗） */}
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
          {/* 组之间添加分隔线 */}
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
