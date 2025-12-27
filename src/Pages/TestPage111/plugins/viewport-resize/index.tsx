import React, { useCallback, useMemo, useRef } from "react";
import { Button } from "antd";
import { Point } from "fabric";
import type { FabricPlugin, FabricPluginContext } from "../core/types";

export function useViewportAndResizePlugin(): FabricPlugin {
  const canvasRef = useRef<import("fabric").Canvas | null>(null);
  const roRef = useRef<ResizeObserver | null>(null);

  const onResetView = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    c.setViewportTransform([1, 0, 0, 1, 0, 0]);
    c.requestRenderAll();
  }, []);

  const toolbar = useMemo(() => {
    return (
      <>
        <Button onClick={onResetView}>重置视图</Button>
      </>
    );
  }, [onResetView]);

  const init = useCallback((ctx: FabricPluginContext) => {
    const c = ctx.canvas;
    canvasRef.current = c;

    // 基础交互体验
    c.selection = true;
    c.defaultCursor = "default";
    c.hoverCursor = "move";

    // 右键拖动平移（抓手光标）
    let isPanning = false;
    let lastX = 0;
    let lastY = 0;

    const setGrabCursor = (mode: "idle" | "down") => {
      if (mode === "down") {
        c.defaultCursor = "grabbing";
        c.setCursor("grabbing");
      } else {
        c.defaultCursor = "default";
        c.setCursor("default");
      }
    };

    const onMouseDown = (opt: any) => {
      const e = opt.e as MouseEvent;
      if (e.button === 2) {
        e.preventDefault();
        e.stopPropagation();

        isPanning = true;
        lastX = e.clientX;
        lastY = e.clientY;

        c.discardActiveObject();
        c.selection = false;
        setGrabCursor("down");
      }
    };

    const onMouseMove = (opt: any) => {
      if (!isPanning) return;
      const e = opt.e as MouseEvent;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;

      const vpt = c.viewportTransform;
      if (!vpt) return;
      vpt[4] += dx;
      vpt[5] += dy;
      c.requestRenderAll();
    };

    const onMouseUp = (opt: any) => {
      const e = opt.e as MouseEvent;
      if (e.button === 2) {
        isPanning = false;
        c.selection = true;
        setGrabCursor("idle");
      }
    };

    // 滚轮缩放（以鼠标点为中心）
    const onMouseWheel = (opt: any) => {
      const e = opt.e as WheelEvent;
      e.preventDefault();
      e.stopPropagation();

      const delta = e.deltaY;
      const zoom = c.getZoom();
      const nextZoom = Math.min(5, Math.max(0.2, zoom * Math.pow(0.999, delta)));

      const p = new Point(e.offsetX, e.offsetY);
      c.zoomToPoint(p, nextZoom);
      c.requestRenderAll();
    };

    c.on("mouse:down", onMouseDown);
    c.on("mouse:move", onMouseMove);
    c.on("mouse:up", onMouseUp);
    c.on("mouse:wheel", onMouseWheel);

    // Resize：让 canvas 永远铺满容器
    const ro = new ResizeObserver(() => {
      const rect = ctx.containerEl.getBoundingClientRect();
      c.setDimensions({ width: Math.floor(rect.width), height: Math.floor(rect.height) });
      c.requestRenderAll();
    });
    ro.observe(ctx.containerEl);
    roRef.current = ro;

    // 初次触发一次
    setTimeout(() => {
      const rect = ctx.containerEl.getBoundingClientRect();
      c.setDimensions({ width: Math.floor(rect.width), height: Math.floor(rect.height) });
      c.requestRenderAll();
    }, 0);

    return () => {
      c.off("mouse:down", onMouseDown);
      c.off("mouse:move", onMouseMove);
      c.off("mouse:up", onMouseUp);
      c.off("mouse:wheel", onMouseWheel);

      roRef.current?.disconnect();
      roRef.current = null;
      canvasRef.current = null;
    };
  }, []);

  return useMemo(
    () => ({
      id: "viewport-resize",
      init,
      toolbar,
    }),
    [init, toolbar],
  );
}
