import React from "react";
import { CanvasEditor } from "./CanvasEditor";
import styles from "./index.module.scss";

/**
 * 画布编辑器演示/开发调试页面
 * 使用 CanvasEditor 核心组件
 */
export default function TestPage33() {
  return (
    <div className={styles.page}>
      <CanvasEditor
        width="100%"
        height="100%"
        syncEnabled={true}
        onReady={(editor) => {
          console.log("Canvas Editor ready:", editor);
        }}
      />
    </div>
  );
}
