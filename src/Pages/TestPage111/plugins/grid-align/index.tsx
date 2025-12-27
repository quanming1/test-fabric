import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Switch } from "antd";
import { FabricObject, Line, Pattern } from "fabric";
import type { FabricPlugin, FabricPluginContext } from "../core/types";

type GuideLine = Line;

function createGridPattern(gridSize: number, lineColor: string) {
  const patternCanvas = document.createElement("canvas");
  patternCanvas.width = gridSize;
  patternCanvas.height = gridSize;
  const ctx = patternCanvas.getContext("2d");
  if (!ctx) return null;

  ctx.clearRect(0, 0, gridSize, gridSize);
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 1;

  // 在 tile 内画 top/left 线（0.5 像素对齐），repeat 后就是均匀网格
  ctx.beginPath();
  ctx.moveTo(0.5, 0);
  ctx.lineTo(0.5, gridSize);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(0, 0.5);
  ctx.lineTo(gridSize, 0.5);
  ctx.stroke();

  return new Pattern({
    source: patternCanvas,
    repeat: "repeat",
  });
}

function makeVGuide(x: number, y1: number, y2: number) {
  return new Line([x, y1, x, y2], {
    stroke: "rgba(22, 119, 255, 0.9)",
    strokeWidth: 1,
    selectable: false,
    evented: false,
    excludeFromExport: true,
    strokeDashArray: [6, 6],
  });
}

function makeHGuide(y: number, x1: number, x2: number) {
  return new Line([x1, y, x2, y], {
    stroke: "rgba(22, 119, 255, 0.9)",
    strokeWidth: 1,
    selectable: false,
    evented: false,
    excludeFromExport: true,
    strokeDashArray: [6, 6],
  });
}

export function useGridAndAlignPlugin(): FabricPlugin {
  const canvasRef = useRef<import("fabric").Canvas | null>(null);
  const guidesRef = useRef<GuideLine[]>([]);

  const [gridEnabled, setGridEnabled] = useState(true);

  const gridPattern = useMemo(() => {
    return createGridPattern(24, "rgba(0,0,0,0.12)");
  }, []);

  const applyGrid = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    if (gridEnabled && gridPattern) {
      c.backgroundColor = gridPattern as any;
    } else {
      c.backgroundColor = "#ffffff";
    }
    c.requestRenderAll();
  }, [gridEnabled, gridPattern]);

  useEffect(() => {
    applyGrid();
  }, [applyGrid]);

  const toolbar = useMemo(() => {
    return (
      <>
        <span style={{ marginLeft: 8 }}>网格</span>
        <Switch checked={gridEnabled} onChange={setGridEnabled} />
      </>
    );
  }, [gridEnabled]);

  const init = useCallback(
    (ctx: FabricPluginContext) => {
      const c = ctx.canvas;
      canvasRef.current = c;
      applyGrid();

      const clearGuides = () => {
        if (!guidesRef.current.length) return;
        guidesRef.current.forEach((g) => c.remove(g));
        guidesRef.current = [];
      };

      const addGuide = (g: GuideLine) => {
        guidesRef.current.push(g);
        c.add(g);
        c.bringObjectToFront(g);
      };

      const SNAP = 6;

      const onMoving = (opt: any) => {
        const obj = opt.target as FabricObject | undefined;
        if (!obj) return;

        clearGuides();

        const cw = c.getWidth();
        const ch = c.getHeight();
        const r = obj.getBoundingRect();

        const objLeft = r.left;
        const objTop = r.top;
        const objRight = r.left + r.width;
        const objBottom = r.top + r.height;
        const objCX = r.left + r.width / 2;
        const objCY = r.top + r.height / 2;

        const xTargets: number[] = [0, cw / 2, cw];
        const yTargets: number[] = [0, ch / 2, ch];

        c.getObjects()
          .filter((o) => o !== obj && !(o instanceof Line) && (o as any).__meta?.kind !== "marker")
          .forEach((o) => {
            const or = (o as FabricObject).getBoundingRect();
            xTargets.push(or.left, or.left + or.width / 2, or.left + or.width);
            yTargets.push(or.top, or.top + or.height / 2, or.top + or.height);
          });

        const bestX = (() => {
          let best: { dx: number; x: number } | null = null;
          for (const x of xTargets) {
            const dxL = x - objLeft;
            const dxC = x - objCX;
            const dxR = x - objRight;
            for (const dx of [dxL, dxC, dxR]) {
              const adx = Math.abs(dx);
              if (adx <= SNAP && (!best || adx < Math.abs(best.dx))) best = { dx, x };
            }
          }
          return best;
        })();

        const bestY = (() => {
          let best: { dy: number; y: number } | null = null;
          for (const y of yTargets) {
            const dyT = y - objTop;
            const dyC = y - objCY;
            const dyB = y - objBottom;
            for (const dy of [dyT, dyC, dyB]) {
              const ady = Math.abs(dy);
              if (ady <= SNAP && (!best || ady < Math.abs(best.dy))) best = { dy, y };
            }
          }
          return best;
        })();

        if (bestX) {
          const center = obj.getCenterPoint();
          center.x += bestX.dx;
          obj.setPositionByOrigin(center, "center", "center");
          addGuide(makeVGuide(bestX.x, -10000, 10000));
        }

        if (bestY) {
          const center = obj.getCenterPoint();
          center.y += bestY.dy;
          obj.setPositionByOrigin(center, "center", "center");
          addGuide(makeHGuide(bestY.y, -10000, 10000));
        }

        obj.setCoords();
        c.requestRenderAll();
      };

      const clearGuidesOnEnd = () => {
        clearGuides();
        c.requestRenderAll();
      };

      const onMouseUp = (opt: any) => {
        const e = opt.e as MouseEvent;
        if (e.button === 0) clearGuidesOnEnd();
      };

      c.on("object:moving", onMoving);
      c.on("object:modified", clearGuidesOnEnd);
      c.on("selection:cleared", clearGuidesOnEnd);
      c.on("mouse:up", onMouseUp);

      return () => {
        c.off("object:moving", onMoving);
        c.off("object:modified", clearGuidesOnEnd);
        c.off("selection:cleared", clearGuidesOnEnd);
        c.off("mouse:up", onMouseUp);

        clearGuides();
        canvasRef.current = null;
      };
    },
    [applyGrid],
  );

  return useMemo(
    () => ({
      id: "grid-align",
      init,
      toolbar,
    }),
    [init, toolbar],
  );
}
