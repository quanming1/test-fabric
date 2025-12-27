import { FabricObject, Group, Path, Text } from "fabric";

/**
 * 业务表现层：水滴 marker 的绘制（与通用 util 解耦）
 */
export function makeDropletMarker(index: number) {
  // A symmetric droplet around (0,0); default size roughly 22x28 in object plane.
  const dropPath = new Path(
    "M 0 -12 C 6 -12 10 -7 10 -1 C 10 6 0 14 0 14 C 0 14 -10 6 -10 -1 C -10 -7 -6 -12 0 -12 Z",
    {
      fill: "#ff4d4f",
      stroke: "rgba(0,0,0,0.18)",
      strokeWidth: 1,
      originX: "center",
      originY: "center",
    },
  );

  const label = new Text(String(index), {
    fontSize: 12,
    fontFamily:
      '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,"Noto Sans","PingFang SC","Microsoft YaHei",sans-serif',
    fill: "#ffffff",
    originX: "center",
    originY: "center",
    top: -2, // visually center within droplet head
  });

  const g = new Group([dropPath, label], {
    originX: "center",
    // 关键：让“水滴尖尖的底部”作为锚点，这样 left/top 就是用户点击点
    originY: "bottom",
    selectable: false,
    // 需要 hover/click，所以要接收事件；但 selectable=false 仍然不会被框选/拖动
    evented: true,
    hasControls: false,
    hasBorders: false,
    excludeFromExport: true,
    objectCaching: false,
    hoverCursor: "pointer",
  });

  // 方便外部（plugin）在 hover 时修改子元素样式
  (g as any).__parts = { dropPath, label };

  return g as unknown as FabricObject;
}
