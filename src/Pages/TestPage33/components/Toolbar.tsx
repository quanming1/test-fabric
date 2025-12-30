import React from "react";
import { Button, Divider, Space, Typography } from "antd";
import { Rect, Circle, Textbox } from "fabric";
import type { CanvasEditor } from "../core/CanvasEditor";
import type { ZoomPlugin } from "../plugins/viewport/ZoomPlugin";
import type { MarkerPlugin } from "../plugins/object/MarkerPlugin";
import { useEditorEvent } from "../hooks";
import styles from "../index.module.scss";

interface ToolbarProps {
  editor: CanvasEditor | null;
}

export const Toolbar: React.FC<ToolbarProps> = ({ editor }) => {
  // 订阅 zoom 事件
  const zoom = useEditorEvent(editor, "zoom:change", 1);

  const handleResetZoom = () => {
    const zoomPlugin = editor?.getPlugin<ZoomPlugin>("zoom");
    zoomPlugin?.reset();
  };

  const handleAddObjects = () => {
    if (!editor) return;

    const rect = new Rect({
      left: 150 + Math.random() * 100,
      top: 150 + Math.random() * 80,
      width: 60,
      height: 60,
      fill: "#ff4d4f",
      rx: 5,
      ry: 5,
    });

    const circle = new Circle({
      left: 250 + Math.random() * 100,
      top: 160 + Math.random() * 80,
      radius: 30,
      fill: "#faad14",
    });

    const text = new Textbox("文字", {
      left: 200 + Math.random() * 100,
      top: 250 + Math.random() * 50,
      fontSize: 18,
      fill: "#1f1f1f",
      width: 80,
    });

    // 注册 rect 到 MarkerPlugin
    const markerPlugin = editor.getPlugin<MarkerPlugin>("marker");
    markerPlugin?.registerObject(rect);

    editor.canvas.add(rect, circle, text);
    editor.render();
  };

  const handleClearAll = () => {
    if (!editor) return;
    editor.canvas.getObjects().forEach((obj) => editor.canvas.remove(obj));
    editor.render();

    // 清空标记点
    const markerPlugin = editor.getPlugin<MarkerPlugin>("marker");
    markerPlugin?.clearMarkers();
  };

  return (
    <div className={styles.toolbar}>
      <div className={styles.toolbarTop}>
        <Typography.Title level={5} style={{ margin: 0 }}>
          FabricJS Group（组）概念演示
        </Typography.Title>
        <div className={styles.subTitle}>路由：/fabric-basic（插件化架构）</div>
      </div>

      <Divider style={{ margin: "10px 0" }} />

      <div className={styles.toolbarBlock}>
        <Typography.Text strong>1. 画布控制</Typography.Text>
        <Space direction="vertical" style={{ width: "100%" }}>
          <div className={styles.zoomBadge}>缩放：{(zoom * 100).toFixed(0)}%</div>
          <Button onClick={handleResetZoom} block>
            重置缩放 (100%)
          </Button>
        </Space>
        <div className={styles.tip}>
          💡 使用<Typography.Text strong>鼠标滚轮</Typography.Text>
          可以放大缩小画布（以鼠标位置为中心）
        </div>
      </div>

      <div className={styles.toolbarBlock}>
        <Typography.Text strong>2. 添加对象</Typography.Text>
        <Space wrap>
          <Button type="primary" onClick={handleAddObjects}>
            添加示例对象
          </Button>
          <Button danger onClick={handleClearAll}>
            清空画布
          </Button>
        </Space>
        <div className={styles.tip}>点击"添加示例对象"会创建矩形、圆、文字各一个</div>
      </div>

      <div className={styles.toolbarBlock}>
        <Typography.Text strong>3. 多选对象</Typography.Text>
        <div className={styles.tip}>
          • 按住 <Typography.Text code>Shift</Typography.Text> 点击多个对象
          <br />• 或者框选多个对象
          <br />
          <br />
          💡 <Typography.Text strong>调试功能</Typography.Text>：按住{" "}
          <Typography.Text code>Ctrl</Typography.Text> + 左键点击矩形，控制台会打印相对坐标
        </div>
      </div>
    </div>
  );
};
