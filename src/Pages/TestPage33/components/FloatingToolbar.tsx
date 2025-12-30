import React from "react";
import {
    CopyOutlined,
    DeleteOutlined,
    VerticalAlignTopOutlined,
    VerticalAlignBottomOutlined,
} from "@ant-design/icons";
import type { ToolbarPosition } from "../core/types";
import { useEditorEvent } from "../hooks";
import { SelectionPlugin } from "../plugins";
import styles from "../index.module.scss";
import { CanvasEditor } from "../core";

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
            className={styles.floatingToolbar}
            style={{
                left: pos.x,
                top: pos.y,
                display: pos.visible ? "flex" : "none",
            }}
        >
            <button
                className={styles.floatingBtn}
                onClick={handleClone}
                title="复制"
            >
                <CopyOutlined />
            </button>
            <button
                className={styles.floatingBtn}
                onClick={handleBringToFront}
                title="置顶"
            >
                <VerticalAlignTopOutlined />
            </button>
            <button
                className={styles.floatingBtn}
                onClick={handleSendToBack}
                title="置底"
            >
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
