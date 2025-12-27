import React, { useCallback, useMemo, useRef, useState } from "react";
import { Button, List, Space, Typography } from "antd";
import { FabricObject } from "fabric";
import type { FabricPlugin, FabricPluginContext } from "../core/types";
import { createId, invZoomScalePolicy } from "../core/utils";
import {
  Bag,
  Element,
  FollowBehavior,
  attachBehaviorOnType,
  getSceneFromCanvas,
  getScenePointFromEvent,
  sceneToLocalPoint,
} from "../core";
import type { MarkPoint, MarkerBinding, MarkerMeta } from "./markerTypes";
import { makeDropletMarker } from "./markerGraphics";

// ---------------------------
// 业务配置（不放进 util）
// ---------------------------
// marker 的反比缩放（1/zoom^2）需要设置上下限，否则 zoom 极端时会“过小/过大”
const MARKER_INV_ZOOM2_MIN = 0.9;
const MARKER_INV_ZOOM2_MAX = 2.0;
// marker 的基础尺寸倍率：想让“默认更大/更小”就改这里（例如 1.3 / 1.6）
const MARKER_BASE_SCALE = 1.7;
const markerInvZoom2Policy = invZoomScalePolicy({
  power: 2,
  min: MARKER_INV_ZOOM2_MIN,
  max: MARKER_INV_ZOOM2_MAX,
});

function isImageObject(obj: unknown): obj is FabricObject {
  const o = obj as any;
  return !!o && o.type === "image";
}

function getMarkerMeta(obj: FabricObject): MarkerMeta | null {
  const m = Bag.get<MarkerMeta>(obj, "__meta");
  if (!m || m.kind !== "marker") return null;
  return m;
}

function setMarkerHoverStyle(marker: FabricObject, hovered: boolean) {
  const parts = (marker as any).__parts as
    | { dropPath?: { set?: (p: any) => void }; label?: { set?: (p: any) => void } }
    | undefined;
  const drop = parts?.dropPath ?? (marker as any)?.getObjects?.()?.[0];
  const label = parts?.label ?? (marker as any)?.getObjects?.()?.[1];

  if (drop?.set) {
    drop.set({
      fill: hovered ? "#ff7875" : "#ff4d4f",
      stroke: hovered ? "rgba(0,0,0,0.32)" : "rgba(0,0,0,0.18)",
      strokeWidth: hovered ? 1.2 : 1,
    });
  }
  if (label?.set) {
    label.set({
      fontWeight: hovered ? "700" : "400",
    });
  }
  (marker as any).dirty = true;
}

export function useCtrlClickMarkerPlugin(): FabricPlugin {
  const ctxRef = useRef<FabricPluginContext | null>(null);
  const sceneRef = useRef<ReturnType<typeof getSceneFromCanvas> | null>(null);
  const markersByOwnerIdRef = useRef<Map<string, Element[]>>(new Map());
  const nextIndexByOwnerIdRef = useRef<Map<string, number>>(new Map());

  const [activeImageId, setActiveImageId] = useState<string | undefined>(undefined);
  const [markersVersion, setMarkersVersion] = useState(0);
  const [marks, setMarks] = useState<MarkPoint[]>([]);
  const [lastMark, setLastMark] = useState<
    | {
        ownerId: string;
        index: number;
        localX: number;
        localY: number;
        u: number;
        v: number;
      }
    | undefined
  >(undefined);

  const getMarkersForOwner = useCallback((ownerId: string) => {
    const m = markersByOwnerIdRef.current.get(ownerId);
    if (!m) return [];
    return m;
  }, []);

  const pushMarkerForOwner = useCallback((ownerId: string, marker: Element) => {
    const arr = markersByOwnerIdRef.current.get(ownerId) ?? [];
    arr.push(marker);
    markersByOwnerIdRef.current.set(ownerId, arr);
    setMarkersVersion((v) => v + 1);
  }, []);

  const getNextIndex = useCallback((ownerId: string) => {
    const cur = nextIndexByOwnerIdRef.current.get(ownerId) ?? 1;
    nextIndexByOwnerIdRef.current.set(ownerId, cur + 1);
    return cur;
  }, []);

  const refreshActiveImage = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const obj = ctx.canvas.getActiveObject() as FabricObject | undefined;
    const scene = sceneRef.current;
    const el = scene?.findByObject(obj) ?? null;
    if (!el || el.type !== "image") {
      setActiveImageId(undefined);
      return;
    }
    setActiveImageId(el.id);
  }, []);

  const clearMarkers = useCallback((ownerId?: string) => {
    const ctx = ctxRef.current;
    if (!ctx) return;

    const c = ctx.canvas;
    const ids = ownerId ? [ownerId] : Array.from(markersByOwnerIdRef.current.keys());
    ids.forEach((id) => {
      const markers = markersByOwnerIdRef.current.get(id) ?? [];
      markers.forEach((m) => {
        c.remove(m.obj);
      });
      markersByOwnerIdRef.current.delete(id);
      nextIndexByOwnerIdRef.current.delete(id);
    });

    setMarkersVersion((v) => v + 1);
    setMarks((prev) => {
      if (!ownerId) return [];
      return prev.filter((x) => x.ownerId !== ownerId);
    });
    c.requestRenderAll();
  }, []);

  const copyLastMark = useCallback(async () => {
    if (!lastMark) return;
    const txt = JSON.stringify(lastMark, null, 2);
    try {
      await navigator.clipboard.writeText(txt);
    } catch {
      // ignore
    }
  }, [lastMark]);

  const ensureOwnerBehavior = useCallback(
    (ownerEl: Element) => {
      const has = ownerEl.getBehaviors().some((b) => b.id === "marker-owner");
      if (has) return;
      ownerEl.addBehavior({
        id: "marker-owner",
        onSceneEvent: (_el, ev) => {
          if (ev.name !== "pointer:down") return;
          const e = ev.e as MouseEvent;
          if (e.button !== 0) return;
          if (!e.ctrlKey) return;

          // 只允许在 image 上 ctrl+点击
          if (ownerEl.type !== "image") return;

          e.preventDefault();
          e.stopPropagation();

          const scene = sceneRef.current;
          const ctx = ctxRef.current;
          if (!scene || !ctx) return;

          const scenePt = getScenePointFromEvent(scene.canvas as any, e);
          const localPt = sceneToLocalPoint(ownerEl.obj, scenePt.x, scenePt.y);

          const ownerId = ownerEl.id;
          const idx = getNextIndex(ownerId);

          const markerObj = makeDropletMarker(idx);
          const meta: MarkerMeta = {
            kind: "marker",
            id: createId("marker"),
            ownerId,
            index: idx,
          };
          (markerObj as any).__meta = meta;

          // Element（id 与 meta.id 对齐）
          const markerEl = new Element({ obj: markerObj, type: "marker", id: meta.id });

          // hover / click
          markerEl.addBehavior({
            id: "marker-interaction",
            onSceneEvent: (el, ev2) => {
              if (ev2.name === "pointer:over") {
                setMarkerHoverStyle(el.obj, true);
                scene.canvas.requestRenderAll();
              } else if (ev2.name === "pointer:out") {
                setMarkerHoverStyle(el.obj, false);
                scene.canvas.requestRenderAll();
              } else if (ev2.name === "pointer:down") {
                const ee = ev2.e as MouseEvent;
                if (ee.button !== 0) return;

                const mm = getMarkerMeta(el.obj);
                if (!mm) return;
                const owner = scene.findById(mm.ownerId);
                const binding = FollowBehavior.getBinding(el) as any as MarkerBinding | undefined;
                const localX = binding?.localX;
                const localY = binding?.localY;
                if (localX == null || localY == null) return;

                const w = (owner?.obj?.width ?? 1) as number;
                const h = (owner?.obj?.height ?? 1) as number;
                const u = (localX + w / 2) / w;
                const v = (localY + h / 2) / h;

                // eslint-disable-next-line no-console
                console.log("[marker click]", {
                  markerId: mm.id,
                  ownerId: mm.ownerId,
                  index: mm.index,
                  localX,
                  localY,
                  u,
                  v,
                  sceneX: (el.obj.left ?? 0) as number,
                  sceneY: (el.obj.top ?? 0) as number,
                });

                const mark: MarkPoint = {
                  ownerId: mm.ownerId,
                  index: mm.index,
                  localX,
                  localY,
                  u,
                  v,
                };
                setLastMark(mark);
                setActiveImageId(mm.ownerId);
                if (owner) ctx.canvas.setActiveObject(owner.obj);
                ctx.canvas.requestRenderAll();
              }
            },
          });

          // follow（binding 保存为 owner local plane 坐标）
          FollowBehavior.setBinding(markerEl, { ownerId, localX: localPt.x, localY: localPt.y });
          markerEl.addBehavior(
            new FollowBehavior({
              originX: "center",
              originY: "bottom",
              scalePolicy: markerInvZoom2Policy,
              extraScale: MARKER_BASE_SCALE,
              zOrder: {
                place: "above",
                sortKey: (el2) => getMarkerMeta(el2.obj)?.index ?? 0,
              },
            }),
          );

          scene.add(markerEl, { addToCanvas: true });
          pushMarkerForOwner(ownerId, markerEl);

          // keep image active
          ctx.canvas.setActiveObject(ownerEl.obj);
          ctx.canvas.requestRenderAll();

          // also compute normalized coords (u,v) relative to image width/height in local plane
          const w = (ownerEl.obj.width ?? 1) as number;
          const h = (ownerEl.obj.height ?? 1) as number;
          const u = (localPt.x + w / 2) / w;
          const v = (localPt.y + h / 2) / h;
          const mark: MarkPoint = {
            ownerId,
            index: idx,
            localX: localPt.x,
            localY: localPt.y,
            u,
            v,
          };
          setLastMark(mark);
          setMarks((prev) => [...prev, mark]);
          setActiveImageId(ownerId);
        },
      });
    },
    [getNextIndex, pushMarkerForOwner],
  );

  const visibleMarks = useMemo(() => {
    const list = activeImageId ? marks.filter((m) => m.ownerId === activeImageId) : marks;
    return [...list].sort((a, b) => {
      if (a.ownerId !== b.ownerId) return a.ownerId.localeCompare(b.ownerId);
      return a.index - b.index;
    });
  }, [activeImageId, marks]);

  const toolbar = useMemo(() => {
    return (
      <Space size={8} direction="vertical" style={{ width: "100%" }}>
        <Typography.Text type="secondary">
          Ctrl + 左键：在图片上打点（marker 随图片缩放/层级）
        </Typography.Text>
        <Button
          disabled={!activeImageId || getMarkersForOwner(activeImageId).length === 0}
          onClick={() => activeImageId && clearMarkers(activeImageId)}
        >
          清空当前图片标记
        </Button>
        <Button
          disabled={markersByOwnerIdRef.current.size === 0}
          onClick={() => clearMarkers(undefined)}
        >
          清空全部标记
        </Button>
        <Button disabled={!lastMark} onClick={copyLastMark}>
          复制最近一次坐标
        </Button>
        {lastMark ? (
          <Typography.Text>
            最近：#{lastMark.index} local=({lastMark.localX.toFixed(1)},{" "}
            {lastMark.localY.toFixed(1)}) uv=({lastMark.u.toFixed(4)}, {lastMark.v.toFixed(4)})
          </Typography.Text>
        ) : null}

        <Typography.Text strong style={{ marginTop: 4 }}>
          标记列表（{activeImageId ? "当前图片" : "全部"}：{visibleMarks.length}）
        </Typography.Text>
        <List
          size="small"
          bordered
          dataSource={visibleMarks}
          locale={{ emptyText: "暂无标记点" }}
          style={{ width: "100%" }}
          renderItem={(m) => (
            <List.Item style={{ padding: "6px 8px" }}>
              <Typography.Text style={{ fontSize: 12 }}>
                #{m.index} local=({m.localX.toFixed(1)},{m.localY.toFixed(1)}) uv=(
                {m.u.toFixed(4)},{m.v.toFixed(4)})
              </Typography.Text>
            </List.Item>
          )}
        />
      </Space>
    );
  }, [
    activeImageId,
    clearMarkers,
    copyLastMark,
    getMarkersForOwner,
    lastMark,
    markersVersion,
    visibleMarks,
  ]);

  const init = useCallback(
    (ctx: FabricPluginContext) => {
      ctxRef.current = ctx;
      const c = ctx.canvas;
      const scene = getSceneFromCanvas(c as any);
      sceneRef.current = scene;
      if (!scene) return;

      const onSelection = () => refreshActiveImage();
      c.on("selection:created", onSelection);
      c.on("selection:updated", onSelection);
      c.on("selection:cleared", onSelection);

      // initial
      refreshActiveImage();

      const unsubs: Array<() => void> = [];
      // 自动对所有 image 挂上 marker-owner 行为（包含现有 + 后续新增）
      unsubs.push(attachBehaviorOnType(scene, "image", (el) => ensureOwnerBehavior(el)));
      unsubs.push(
        scene.on("element:removed", ({ element }) => {
          if (element.type === "image") {
            clearMarkers(element.id);
            setActiveImageId((prev) => (prev === element.id ? undefined : prev));
            return;
          }
          if (element.type === "marker") {
            const meta = getMarkerMeta(element.obj);
            if (!meta) return;
            const arr = markersByOwnerIdRef.current.get(meta.ownerId) ?? [];
            if (!arr.length) return;
            markersByOwnerIdRef.current.set(
              meta.ownerId,
              arr.filter((x) => x.id !== element.id),
            );
            setMarkersVersion((v) => v + 1);
          }
        }),
      );

      return () => {
        c.off("selection:created", onSelection);
        c.off("selection:updated", onSelection);
        c.off("selection:cleared", onSelection);
        unsubs.forEach((u) => u());

        // remove all markers
        clearMarkers(undefined);
        ctxRef.current = null;
        sceneRef.current = null;
      };
    },
    [clearMarkers, getNextIndex, pushMarkerForOwner, refreshActiveImage, ensureOwnerBehavior],
  );

  return useMemo(
    () => ({
      id: "ctrl-click-marker",
      init,
      toolbar,
    }),
    [init, toolbar],
  );
}
