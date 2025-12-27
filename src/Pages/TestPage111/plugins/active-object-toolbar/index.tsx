import { useCallback, useMemo, useRef } from "react";
import { Button, Tooltip } from "antd";
import {
  DeleteOutlined,
  VerticalAlignTopOutlined,
  VerticalAlignBottomOutlined,
} from "@ant-design/icons";
import { FabricObject, Point, util } from "fabric";
import { createRoot, Root } from "react-dom/client";
import type { FabricPlugin, FabricPluginContext } from "../core/types";
import styles from "./index.module.scss";

type ToolbarAction = {
  key: string;
  label: string;
  icon: React.ReactNode;
  onClick: (obj: FabricObject, ctx: FabricPluginContext) => void;
};

function getViewportBBox(ctx: FabricPluginContext, obj: FabricObject) {
  const vpt = ctx.canvas.viewportTransform;
  if (!vpt) return null;

  // object coords are in scene plane; transform to viewport plane
  const pts = obj.getCoords(); // 4 corners in scene plane
  const vpts = pts.map((p) => util.transformPoint(p, vpt));
  const xs = vpts.map((p) => p.x);
  const ys = vpts.map((p) => p.y);
  return {
    left: Math.min(...xs),
    right: Math.max(...xs),
    top: Math.min(...ys),
    bottom: Math.max(...ys),
  };
}

function toContainerCssPoint(ctx: FabricPluginContext, viewportX: number, viewportY: number) {
  // viewportX/Y 是“画布平面”的坐标（与 canvas.getWidth/getHeight 对齐）
  // overlay 在 containerEl 内定位，所以要：
  // 1) 处理 canvas DOM 大小与 fabric 尺寸的缩放比（含 retina/CSS 缩放）
  // 2) 加上 canvasEl 相对 containerEl 的偏移
  const containerRect = ctx.containerEl.getBoundingClientRect();
  const canvasRect = ctx.canvasEl.getBoundingClientRect();
  // viewport 坐标与 canvas.getWidth/getHeight 在同一平面（CSS 像素视角），这里仅做 DOM 尺寸比换算（通常为 1）
  const scaleX = canvasRect.width / (ctx.canvas.getWidth() || 1);
  const scaleY = canvasRect.height / (ctx.canvas.getHeight() || 1);
  // 绝对定位的参考原点是 padding box（不包含 border），需要扣掉 clientLeft/Top
  const offsetX = canvasRect.left - containerRect.left - ctx.containerEl.clientLeft;
  const offsetY = canvasRect.top - containerRect.top - ctx.containerEl.clientTop;
  return {
    x: offsetX + viewportX * scaleX,
    y: offsetY + viewportY * scaleY,
  };
}

export function useActiveObjectToolbarPlugin(): FabricPlugin {
  const ctxRef = useRef<FabricPluginContext | null>(null);
  const overlayElRef = useRef<HTMLDivElement | null>(null);
  const reactRootRef = useRef<Root | null>(null);
  const rafRef = useRef<number | null>(null);

  const actions = useMemo<ToolbarAction[]>(
    () => [
      {
        key: "front",
        label: "置顶",
        icon: <VerticalAlignTopOutlined />,
        onClick: (obj, ctx) => {
          ctx.canvas.bringObjectToFront(obj);
          ctx.canvas.requestRenderAll();
        },
      },
      {
        key: "back",
        label: "置底",
        icon: <VerticalAlignBottomOutlined />,
        onClick: (obj, ctx) => {
          ctx.canvas.sendObjectToBack(obj);
          ctx.canvas.requestRenderAll();
        },
      },
      {
        key: "delete",
        label: "删除",
        icon: <DeleteOutlined />,
        onClick: (obj, ctx) => {
          ctx.canvas.remove(obj);
          ctx.canvas.discardActiveObject();
          ctx.canvas.requestRenderAll();
        },
      },
    ],
    [],
  );

  const cleanupRaf = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const renderToolbar = useCallback(() => {
    const ctx = ctxRef.current;
    const overlay = overlayElRef.current;
    const root = reactRootRef.current;
    if (!ctx || !overlay || !root) return;

    const obj = ctx.canvas.getActiveObject() as FabricObject | undefined;
    if (!obj) {
      overlay.style.display = "none";
      return;
    }

    // markers / helper objects 可通过 meta 控制是否显示
    if ((obj as any).__meta?.kind === "marker") {
      overlay.style.display = "none";
      return;
    }

    const bbox = getViewportBBox(ctx, obj);
    if (!bbox) {
      overlay.style.display = "none";
      return;
    }

    const margin = 10;
    const centerViewportX = (bbox.left + bbox.right) / 2;
    const topViewportY = bbox.top;
    const p = toContainerCssPoint(ctx, centerViewportX, topViewportY);
    const x = p.x;
    const y = p.y - margin;

    overlay.style.display = "block";
    // 采用 left/top + translate(-50%,-100%) 的方案，百分比基于 overlay 自身尺寸，稳定不漂
    overlay.style.left = `${x}px`;
    overlay.style.top = `${y}px`;

    root.render(
      <div
        className={styles.toolbar}
        onMouseDown={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div className={styles.arrow} />
        <div className={styles.actions}>
          {actions.map((a) => (
            <Tooltip key={a.key} title={a.label} placement="top">
              <Button
                className={styles.iconBtn}
                size="small"
                type="text"
                danger={a.key === "delete"}
                icon={a.icon}
                onClick={() => {
                  const cur = ctx.canvas.getActiveObject() as FabricObject | undefined;
                  if (cur) a.onClick(cur, ctx);
                }}
              />
            </Tooltip>
          ))}
        </div>
      </div>,
    );
  }, [actions]);

  const scheduleRender = useCallback(() => {
    cleanupRaf();
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      renderToolbar();
    });
  }, [cleanupRaf, renderToolbar]);

  const init = useCallback(
    (ctx: FabricPluginContext) => {
      ctxRef.current = ctx;

      // overlay 挂载到容器上（相对于容器定位）
      const overlay = document.createElement("div");
      overlay.style.position = "absolute";
      overlay.style.left = "0";
      overlay.style.top = "0";
      overlay.style.pointerEvents = "none"; // 让 canvas 还能拖拽；工具栏自身再开启 pointerEvents
      overlay.style.zIndex = "20";
      overlay.style.display = "none";
      overlay.style.willChange = "transform";
      overlay.style.transform = "translate(-50%, -100%)";

      // 容器需 relative，确保 overlay 绝对定位正确
      const prevPos = ctx.containerEl.style.position;
      if (!prevPos || prevPos === "static") {
        ctx.containerEl.style.position = "relative";
      }

      ctx.containerEl.appendChild(overlay);
      overlayElRef.current = overlay;

      const root = createRoot(overlay);
      reactRootRef.current = root;

      // 监听渲染与选择变化，跟随移动/缩放/平移/缩放等
      const onSel = () => scheduleRender();
      const onClear = () => scheduleRender();
      const onAfterRender = () => scheduleRender();

      ctx.canvas.on("selection:created", onSel);
      ctx.canvas.on("selection:updated", onSel);
      ctx.canvas.on("selection:cleared", onClear);
      ctx.canvas.on("after:render", onAfterRender);

      // 初始化
      scheduleRender();

      return () => {
        cleanupRaf();
        ctx.canvas.off("selection:created", onSel);
        ctx.canvas.off("selection:updated", onSel);
        ctx.canvas.off("selection:cleared", onClear);
        ctx.canvas.off("after:render", onAfterRender);

        reactRootRef.current?.unmount();
        reactRootRef.current = null;

        overlay.remove();
        overlayElRef.current = null;
        ctxRef.current = null;
      };
    },
    [cleanupRaf, scheduleRender],
  );

  return useMemo(
    () => ({
      id: "active-object-toolbar",
      init,
    }),
    [init],
  );
}
