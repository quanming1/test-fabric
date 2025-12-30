import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, Point, Rect } from "fabric";
import type { ToolMode } from "./types";
import { attachKeyboardShortcuts, deleteActiveObject } from "./tools/keyboard";
import { attachPanZoom } from "./tools/panZoom";
import { attachCtrlClickMarker } from "./tools/ctrlClickMarker";
import { attachRectDrawTool } from "./tools/rectDraw";
import { registerScreenFixed, syncScreenFixedObjects } from "./utils/screenFixed";
import { viewportPointToScenePoint } from "./utils/pointer";
import { createFollowerManager } from "./lib/follow";
import { exportCanvasToJSONString, importCanvasFromJSONString } from "./lib/persist";

export function useFabricBoard() {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasElRef = useRef<HTMLCanvasElement | null>(null);
  const canvasRef = useRef<Canvas | null>(null);
  const followerMgrRef = useRef<ReturnType<typeof createFollowerManager> | null>(null);

  const [mode, setMode] = useState<ToolMode>("select");
  const [zoom, setZoom] = useState(1);

  const modeRef = useRef<ToolMode>("select");
  const spaceDownRef = useRef(false);

  useEffect(() => {
    modeRef.current = mode;
    const c = canvasRef.current;
    if (!c) return;
    c.selection = mode === "select";
  }, [mode]);

  const setCursor = (cursor: string) => {
    const c = canvasRef.current;
    if (!c) return;
    c.defaultCursor = cursor;
    c.setCursor(cursor);
  };

  const zoomToPoint = (nextZoom: number, point: Point) => {
    const c = canvasRef.current;
    if (!c) return;
    const z = Math.min(6, Math.max(0.2, nextZoom));
    c.zoomToPoint(point, z);
    syncScreenFixedObjects(c, z);
    c.requestRenderAll();
    setZoom(c.getZoom());
  };

  const zoomBy = (ratio: number) => {
    const c = canvasRef.current;
    if (!c) return;
    const center = new Point(c.getWidth() / 2, c.getHeight() / 2);
    zoomToPoint(c.getZoom() * ratio, center);
  };

  const resetView = () => {
    const c = canvasRef.current;
    if (!c) return;
    c.setViewportTransform([1, 0, 0, 1, 0, 0]);
    syncScreenFixedObjects(c, 1);
    c.requestRenderAll();
    setZoom(1);
  };

  const deleteSelected = () => {
    deleteActiveObject(canvasRef.current);
  };

  const addScreenFixedRect = () => {
    const c = canvasRef.current;
    if (!c) return;
    const z = c.getZoom();
    const vpCenter = new Point(c.getWidth() / 2, c.getHeight() / 2);
    const sceneCenter = viewportPointToScenePoint(c as any, vpCenter);

    const w = 180;
    const h = 110;
    const r = new Rect({
      originX: "center",
      originY: "center",
      left: sceneCenter.x,
      top: sceneCenter.y,
      width: w,
      height: h,
      fill: "rgba(255, 77, 79, 0.10)",
      stroke: "rgba(255, 77, 79, 0.95)",
      strokeWidth: 2,
      strokeUniform: true,
      transparentCorners: false,
      cornerColor: "#ff4d4f",
      cornerStyle: "circle",
      objectCaching: false,
      hasControls: false,
      selectable: true,
      evented: true,
    });

    (r as any).__meta = { kind: "rect", role: "screenFixed", createdAt: Date.now() };
    registerScreenFixed(r);
    c.add(r);
    // 加到 canvas 后再统一同步，保证该对象立即生效（含描边/缩放）
    syncScreenFixedObjects(c, z);
    c.setActiveObject(r);
    c.requestRenderAll();
  };

  useEffect(() => {
    if (!wrapRef.current || !canvasElRef.current) return;

    const c = new Canvas(canvasElRef.current, {
      preserveObjectStacking: true,
      stopContextMenu: true,
    });
    canvasRef.current = c;
    followerMgrRef.current = createFollowerManager(c);

    c.backgroundColor = "#ffffff";
    c.selection = modeRef.current === "select";
    c.defaultCursor = "default";
    c.hoverCursor = "move";

    // 初始提示对象（可删）
    const hint = new Rect({
      left: 140,
      top: 120,
      width: 220,
      height: 120,
      fill: "rgba(22, 119, 255, 0.10)",
      stroke: "rgba(22, 119, 255, 0.9)",
      strokeWidth: 2,
      rx: 8,
      ry: 8,
    });
    // 允许在示例矩形上 ctrl 点
    (hint as any).__normalRect = true;
    (hint as any).__meta = { kind: "rect", role: "hint", createdAt: Date.now() };
    c.add(hint);

    const syncZoom = () => setZoom(c.getZoom());
    c.on("after:render", syncZoom);

    const disposePanZoom = attachPanZoom(c, {
      getCanvas: () => canvasRef.current,
      getMode: () => modeRef.current,
      isSpaceDown: () => spaceDownRef.current,
      setCursor,
      zoomToPoint,
    });

    const disposeRectDraw = attachRectDrawTool(c, {
      getMode: () => modeRef.current,
      setCursor,
    });

    const disposeCtrlClickMarker = attachCtrlClickMarker(c, followerMgrRef.current);

    const disposeKeyboard = attachKeyboardShortcuts({
      onDeleteSelected: deleteSelected,
      onSpaceDownChange: (down) => {
        spaceDownRef.current = down;
        setCursor(down ? "grab" : modeRef.current === "rect" ? "crosshair" : "default");
      },
    });

    const ro = new ResizeObserver(() => {
      const rect = wrapRef.current?.getBoundingClientRect();
      if (!rect) return;
      c.setDimensions({ width: Math.floor(rect.width), height: Math.floor(rect.height) });
      c.requestRenderAll();
      setZoom(c.getZoom());
    });
    ro.observe(wrapRef.current);

    setTimeout(() => {
      const rect = wrapRef.current?.getBoundingClientRect();
      if (!rect) return;
      c.setDimensions({ width: Math.floor(rect.width), height: Math.floor(rect.height) });
      c.requestRenderAll();
      setZoom(c.getZoom());
    }, 0);

    return () => {
      ro.disconnect();
      disposeKeyboard();
      disposeCtrlClickMarker();
      disposeRectDraw();
      disposePanZoom();
      c.off("after:render", syncZoom);
      followerMgrRef.current?.dispose();
      followerMgrRef.current = null;
      c.dispose();
      canvasRef.current = null;
    };
  }, []);

  const exportJSON = () => {
    const c = canvasRef.current;
    if (!c) return "";
    return exportCanvasToJSONString(c);
  };

  const importJSON = async (json: string) => {
    const c = canvasRef.current;
    const mgr = followerMgrRef.current;
    if (!c || !mgr) return;
    await importCanvasFromJSONString(c, json, { followerMgr: mgr });
    // 重新套一次 screenFixed（以当前 zoom）
    syncScreenFixedObjects(c, c.getZoom());
    c.requestRenderAll();
  };

  const api = useMemo(
    () => ({
      wrapRef,
      canvasElRef,
      canvasRef,
      mode,
      setMode,
      zoom,
      zoomBy,
      zoomToPoint,
      resetView,
      deleteSelected,
      addScreenFixedRect,
      exportJSON,
      importJSON,
      setCursor,
      isSpaceDownRef: spaceDownRef,
      modeRef,
    }),
    [mode, zoom],
  );

  return api;
}
