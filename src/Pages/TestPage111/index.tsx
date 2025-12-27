import React, { useEffect, useMemo, useRef } from "react";
import styles from "./index.module.scss";
import { Canvas } from "fabric";
import type { FabricPlugin } from "./plugins/core/types";
import { createScenePlugin } from "./plugins/core";
import { useActiveObjectToolbarPlugin } from "./plugins/active-object-toolbar";
import { useCtrlClickMarkerPlugin } from "./plugins/ctrl-click-marker";
import { useGridAndAlignPlugin } from "./plugins/grid-align";
import { useImageAssetsPlugin } from "./plugins/image-assets";
import { usePenPlugin } from "./plugins/pen";
import { useViewportAndResizePlugin } from "./plugins/viewport-resize";

export default function TestPage111() {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasElRef = useRef<HTMLCanvasElement | null>(null);
  const canvasRef = useRef<Canvas | null>(null);
  const pluginDisposersRef = useRef<Array<() => void>>([]);

  // Plugin 1: 图片导入/编辑 + 图片列表/定位 + 清理图片
  const imagePlugin = useImageAssetsPlugin();
  // Plugin 2: 网格背景 + 对齐辅助/吸附
  const gridAlignPlugin = useGridAndAlignPlugin();
  // Plugin 3: 画布视图操作 + 自适应容器大小
  const viewportResizePlugin = useViewportAndResizePlugin();

  // Plugin 4: Ctrl+左键打点（输出相对图片坐标）
  const ctrlClickMarkerPlugin = useCtrlClickMarkerPlugin();
  // Plugin 5: Active 对象浮动工具栏
  const activeObjectToolbarPlugin = useActiveObjectToolbarPlugin();

  const plugins = useMemo<FabricPlugin[]>(
    () => [
      // 基础框架层：Scene（事件路由/Element/Behavior）
      createScenePlugin(),
      imagePlugin,
      viewportResizePlugin,
      gridAlignPlugin,
      ctrlClickMarkerPlugin,
      activeObjectToolbarPlugin,
    ],
    [
      activeObjectToolbarPlugin,
      ctrlClickMarkerPlugin,
      gridAlignPlugin,
      imagePlugin,
      viewportResizePlugin,
    ],
  );

  const markerToolbar = useMemo(
    () => plugins.find((p) => p.id === "ctrl-click-marker")?.toolbar,
    [plugins],
  );
  const leftToolbars = useMemo(
    () => plugins.filter((p) => p.id !== "ctrl-click-marker"),
    [plugins],
  );

  useEffect(() => {
    if (!wrapRef.current || !canvasElRef.current) return;

    const c = new Canvas(canvasElRef.current, {
      preserveObjectStacking: true,
      stopContextMenu: true,
    });
    canvasRef.current = c;

    const ctx = {
      canvas: c,
      canvasEl: canvasElRef.current,
      containerEl: wrapRef.current,
    };

    const disposers: Array<() => void> = [];
    plugins.forEach((p) => {
      const d = p.init(ctx);
      if (d) disposers.push(d);
    });
    pluginDisposersRef.current = disposers;

    return () => {
      pluginDisposersRef.current.forEach((d) => d());
      pluginDisposersRef.current = [];
      c.dispose();
      canvasRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <div className={styles.toolbarMain}>
          {leftToolbars.map((p) => (
            <div key={p.id} className={styles.toolbarBlock}>
              {p.toolbar}
            </div>
          ))}
        </div>

        <div className={styles.toolbarFooter}>
          {markerToolbar}
          <div className={styles.tips}>
            左键：选中/拖动/拉伸图片；右键按住拖动：平移画布（抓手）；滚轮：缩放画布
          </div>
        </div>
      </div>

      <div className={styles.stage}>
        <div
          ref={wrapRef}
          className={styles.canvasWrap}
          onContextMenu={(ev) => {
            ev.preventDefault();
          }}
        >
          <canvas ref={canvasElRef} className={styles.canvasEl} />
        </div>
      </div>
    </div>
  );
}
