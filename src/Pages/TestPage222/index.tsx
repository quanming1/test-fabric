import React, { useMemo, useState } from "react";
import { Button, Divider, Input, Modal, Space, Typography, message } from "antd";
import styles from "./index.module.scss";
import { useFabricBoard } from "./useBoard";

export default function TestPage222() {
  const board = useFabricBoard();
  const [ioOpen, setIoOpen] = useState(false);
  const [ioValue, setIoValue] = useState("");

  const tips = useMemo(() => {
    return (
      <>
        <div className={styles.tipsLine}>
          <Typography.Text strong>矩形</Typography.Text>：切到“矩形”，在画布内左键拖拽创建。
        </div>
        <div className={styles.tipsLine}>
          <Typography.Text strong>缩放</Typography.Text>：滚轮以鼠标点为中心缩放；也可用按钮。
        </div>
        <div className={styles.tipsLine}>
          <Typography.Text strong>平移</Typography.Text>：右键按住拖动，或按住空格再左键拖动。
        </div>
        <div className={styles.tipsLine}>
          <Typography.Text strong>删除</Typography.Text>：选中对象后按 Delete/Backspace，或点“删除选中”。
        </div>
        <div className={styles.tipsLine}>
          <Typography.Text strong>屏幕固定矩形</Typography.Text>：点按钮创建视觉大小/边框粗细不随缩放变化的矩形。
        </div>
      </>
    );
  }, []);

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <div className={styles.toolbarTop}>
          <Typography.Title level={5} style={{ margin: 0 }}>
            Fabric 画板（TestPage222）
          </Typography.Title>
          <div className={styles.subTitle}>工具 + 缩放 + 平移 + 自适应（已工程化拆分）</div>
        </div>

        <Divider style={{ margin: "10px 0" }} />

        <div className={styles.toolbarBlock}>
          <Typography.Text strong>工具</Typography.Text>
          <Space wrap>
            <Button
              type={board.mode === "select" ? "primary" : "default"}
              onClick={() => {
                board.setMode("select");
                board.setCursor("default");
              }}
            >
              选择/移动
            </Button>
            <Button
              type={board.mode === "rect" ? "primary" : "default"}
              onClick={() => {
                board.setMode("rect");
                board.setCursor(board.isSpaceDownRef.current ? "grab" : "crosshair");
              }}
            >
              矩形
            </Button>
            <Button onClick={board.deleteSelected} danger>
              删除选中
            </Button>
            <Button onClick={board.addScreenFixedRect}>屏幕固定矩形</Button>
          </Space>
        </div>

        <div className={styles.toolbarBlock}>
          <Typography.Text strong>导入/导出</Typography.Text>
          <Space wrap>
            <Button
              onClick={async () => {
                const json = board.exportJSON();
                setIoValue(json);
                setIoOpen(true);
                try {
                  await navigator.clipboard.writeText(json);
                  message.success("已复制到剪贴板");
                } catch {
                  // ignore
                }
              }}
            >
              导出 JSON
            </Button>
            <Button
              onClick={() => {
                setIoValue("");
                setIoOpen(true);
              }}
            >
              导入 JSON
            </Button>
          </Space>
        </div>

        <div className={styles.toolbarBlock}>
          <Typography.Text strong>视图</Typography.Text>
          <Space wrap>
            <Button onClick={() => board.zoomBy(1 / 1.15)}>-</Button>
            <Button onClick={() => board.zoomBy(1.15)}>+</Button>
            <Button onClick={board.resetView}>重置视图</Button>
            <div className={styles.zoomBadge}>{Math.round(board.zoom * 100)}%</div>
          </Space>
        </div>

        <Divider style={{ margin: "10px 0" }} />
        <div className={styles.tips}>{tips}</div>
      </div>

      <div className={styles.stage}>
        <div
          ref={board.wrapRef}
          className={styles.canvasWrap}
          onContextMenu={(ev) => {
            ev.preventDefault();
          }}
        >
          <canvas ref={board.canvasElRef} className={styles.canvasEl} />
        </div>
      </div>

      <Modal
        title="导入 / 导出 JSON"
        open={ioOpen}
        onCancel={() => setIoOpen(false)}
        okText="导入到画布"
        cancelText="关闭"
        onOk={async () => {
          if (!ioValue.trim()) {
            message.warning("请输入 JSON");
            return;
          }
          try {
            await board.importJSON(ioValue);
            message.success("导入成功");
            setIoOpen(false);
          } catch (e: any) {
            message.error(`导入失败：${e?.message ?? "未知错误"}`);
          }
        }}
      >
        <Input.TextArea
          value={ioValue}
          onChange={(e) => setIoValue(e.target.value)}
          placeholder="这里粘贴 JSON（导出后也会自动填充）"
          autoSize={{ minRows: 10, maxRows: 18 }}
        />
        <div style={{ marginTop: 8, color: "rgba(0,0,0,0.55)", fontSize: 12, lineHeight: 1.6 }}>
          说明：JSON 会携带对象 id、屏幕固定（screenFixed）以及跟随关系（follow）。
          以后新增更多能力，只需要在持久化层的 rehydrate 阶段扩展即可。
        </div>
      </Modal>
    </div>
  );
}


