import React, { useMemo, useState } from "react";
import { Card, Divider, Slider, Space, Switch, Typography } from "antd";
import styles from "./index.module.scss";
import ZoomOnPointImage from "@comp/ZoomOnPointImage";

export default function ZoomOnPointDemo() {
  const [start, setStart] = useState(false);
  const [x, setX] = useState(0.35);
  const [y, setY] = useState(0.55);
  const [zoom, setZoom] = useState(2);

  const point = useMemo(() => ({ x, y }), [x, y]);

  return (
    <div className={styles.page}>
      <div className={styles.left}>
        <div className={styles.viewerWrap}>
          <ZoomOnPointImage
            className={styles.viewer}
            src={"https://images.pexels.com/photos/807598/pexels-photo-807598.jpeg"}
            point={point}
            start={start}
            width={"100%"}
            zoom={zoom}
            durationMs={650}
          />
          <div className={styles.dot} style={{ left: `${x * 100}%`, top: `${y * 100}%` }} />
        </div>

        <Card size="small" title="控制面板">
          <Space direction="vertical" style={{ width: "100%" }} size={10}>
            <Space>
              <Typography.Text strong>Start</Typography.Text>
              <Switch checked={start} onChange={setStart} />
            </Space>

            <div>
              <Typography.Text strong>X（0~1）</Typography.Text>
              <Slider min={0} max={1} step={0.001} value={x} onChange={(v) => setX(v as number)} />
            </div>
            <div>
              <Typography.Text strong>Y（0~1）</Typography.Text>
              <Slider min={0} max={1} step={0.001} value={y} onChange={(v) => setY(v as number)} />
            </div>
            <div>
              <Typography.Text strong>Zoom</Typography.Text>
              <Slider
                min={1}
                max={6}
                step={0.05}
                value={zoom}
                onChange={(v) => setZoom(v as number)}
              />
            </div>
          </Space>
        </Card>
      </div>

      <div className={styles.right}>
        <Card title="说明" size="small">
          <Typography.Paragraph style={{ marginBottom: 8 }}>
            这是 <Typography.Text code>ZoomOnPointImage</Typography.Text> 的演示页：
          </Typography.Paragraph>
          <ul style={{ paddingLeft: 18 }}>
            <li>
              <b>point</b> 传入相对坐标（0~1），以该点为中心进行放大。
            </li>
            <li>
              <b>start</b> 打开/关闭都会带 transition 动画。
            </li>
            <li>
              容器宽高比<b>完全跟随图片</b>，不留黑边，指定 width 后高度会按图片比例自动计算。
            </li>
          </ul>
          <Divider />
          <Typography.Paragraph style={{ marginBottom: 0 }}>
            你现在可以访问路由 <Typography.Text code>/zoom</Typography.Text> 直接看效果。
          </Typography.Paragraph>
        </Card>
      </div>
    </div>
  );
}
