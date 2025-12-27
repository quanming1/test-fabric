import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, InputNumber, Space, Switch, Typography } from "antd";
import { PencilBrush, type FabricObject } from "fabric";
import type { FabricPlugin, FabricPluginContext } from "../core/types";
import { createId } from "../core/utils";
import { ensureElementMetaOnObject, getSceneFromCanvas } from "../core";

type PenSettings = {
  enabled: boolean;
  color: string;
  width: number;
};

function isPenStroke(obj: FabricObject) {
  return (obj as any)?.__meta?.kind === "pen-stroke";
}

export function usePenPlugin(): FabricPlugin {
  const ctxRef = useRef<FabricPluginContext | null>(null);
  const prevRef = useRef<{
    selection: boolean;
    skipTargetFind: boolean;
    defaultCursor?: string;
    hoverCursor?: string;
  } | null>(null);

  const [settings, setSettings] = useState<PenSettings>({
    enabled: false,
    color: "#1677ff",
    width: 4,
  });

  const ensureBrush = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const c: any = ctx.canvas as any;
    console.log("c.freeDrawingBrush", c.freeDrawingBrush);
    if (!c.freeDrawingBrush) {
      // fabric@7：可能不会默认创建 freeDrawingBrush，必须显式 new
      c.freeDrawingBrush = new PencilBrush(c);
    }
  }, []);

  const applyBrush = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const c: any = ctx.canvas as any;
    ensureBrush();
    if (!c.freeDrawingBrush) return;
    c.freeDrawingBrush.color = settings.color;
    c.freeDrawingBrush.width = settings.width;
  }, [ensureBrush, settings.color, settings.width]);

  const setEnabled = useCallback(
    (enabled: boolean) => {
      const ctx = ctxRef.current;
      if (!ctx) {
        setSettings((s) => ({ ...s, enabled }));
        return;
      }

      const c: any = ctx.canvas as any;
      if (enabled) {
        prevRef.current ??= {
          selection: !!c.selection,
          skipTargetFind: !!c.skipTargetFind,
          defaultCursor: c.defaultCursor,
          hoverCursor: c.hoverCursor,
        };
        ensureBrush();
        c.isDrawingMode = true;
        c.selection = false;
        c.skipTargetFind = true; // 避免与其它交互（选中、marker、拖拽）冲突
        c.defaultCursor = "crosshair";
        c.hoverCursor = "crosshair";
        if (typeof c.setCursor === "function") c.setCursor("crosshair");
        applyBrush();
      } else {
        c.isDrawingMode = false;
        const prev = prevRef.current;
        if (prev) {
          c.selection = prev.selection;
          c.skipTargetFind = prev.skipTargetFind;
          if (prev.defaultCursor != null) c.defaultCursor = prev.defaultCursor;
          if (prev.hoverCursor != null) c.hoverCursor = prev.hoverCursor;
        }
        prevRef.current = null;
      }
      c.requestRenderAll();
      setSettings((s) => ({ ...s, enabled }));
    },
    [applyBrush, ensureBrush],
  );

  // settings 改变时更新 brush（仅在 enabled 时）
  useEffect(() => {
    if (!settings.enabled) return;
    applyBrush();
  }, [applyBrush, settings.enabled]);

  const clearStrokes = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const c = ctx.canvas;
    const strokes = c.getObjects().filter((o) => isPenStroke(o as any)) as FabricObject[];
    strokes.forEach((o) => c.remove(o));
    c.discardActiveObject();
    c.requestRenderAll();
  }, []);

  const toolbar = useMemo(() => {
    return (
      <Space size={10} align="center" wrap>
        <Typography.Text type="secondary">钢笔</Typography.Text>
        <Switch checked={settings.enabled} onChange={setEnabled} />

        <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            颜色
          </Typography.Text>
          <input
            type="color"
            value={settings.color}
            onChange={(e) => setSettings((s) => ({ ...s, color: e.target.value }))}
            disabled={!settings.enabled}
            style={{ width: 32, height: 28, padding: 0, border: "none", background: "transparent" }}
          />
        </label>

        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          线宽
        </Typography.Text>
        <InputNumber
          size="small"
          min={1}
          max={60}
          value={settings.width}
          onChange={(v) => setSettings((s) => ({ ...s, width: Number(v ?? s.width) }))}
          disabled={!settings.enabled}
        />

        <Button danger onClick={clearStrokes}>
          清空笔迹
        </Button>
      </Space>
    );
  }, [clearStrokes, setEnabled, settings.color, settings.enabled, settings.width]);

  const init = useCallback(
    (ctx: FabricPluginContext) => {
      ctxRef.current = ctx;
      const c: any = ctx.canvas as any;
      const scene = getSceneFromCanvas(c);

      // 初始化 brush（fabric 版本差异较大，这里用 best-effort）
      ensureBrush();
      applyBrush();

      const onPathCreated = (opt: any) => {
        const path = (opt?.path ?? opt?.target) as FabricObject | undefined;
        if (!path) return;

        // 标记为“钢笔笔迹”，并让 Scene 能 wrap
        const id = createId("pen");
        (path as any).__meta = { ...(path as any).__meta, kind: "pen-stroke", id };
        ensureElementMetaOnObject(path, { id, type: "pen-stroke" });
        scene?.ensureElementFromObject(path);

        // 默认笔迹不可导出/不可选中？这里先保留可选中，便于未来做编辑
        // 如果你希望笔迹只展示不交互，可以在这里 set({ selectable:false, evented:false })
      };

      // Esc 退出绘制
      const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") setEnabled(false);
      };

      c.on("path:created", onPathCreated);
      window.addEventListener("keydown", onKeyDown);

      return () => {
        c.off("path:created", onPathCreated);
        window.removeEventListener("keydown", onKeyDown);
        setEnabled(false);
        ctxRef.current = null;
      };
    },
    [applyBrush, setEnabled],
  );

  return useMemo(
    () => ({
      id: "pen",
      init,
      toolbar,
    }),
    [init, toolbar],
  );
}
