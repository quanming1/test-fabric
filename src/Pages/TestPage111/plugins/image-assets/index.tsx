import React, { useCallback, useMemo, useRef, useState } from "react";
import { Button, Select } from "antd";
import { FabricImage, FabricObject } from "fabric";
import type { FabricPlugin } from "../core/types";
import { createId, easeOutCubic } from "../core/utils";
import { ensureElementMetaOnObject, getSceneFromCanvas } from "../core";

type ImageItem = {
  id: string;
  name: string;
  obj: FabricObject;
};

export function useImageAssetsPlugin(): FabricPlugin {
  const canvasRef = useRef<import("fabric").Canvas | null>(null);
  const focusAnimRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [imageItems, setImageItems] = useState<ImageItem[]>([]);
  const [selectedImageId, setSelectedImageId] = useState<string | undefined>(undefined);

  const syncImagesFromCanvas = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const scene = getSceneFromCanvas(c as any);

    const imgs: ImageItem[] = c
      .getObjects()
      .filter((o) => o && ((o as any).type === "image" || o instanceof FabricImage))
      .map((o, idx) => {
        const fo = o as FabricObject;
        const meta = ((fo as any).__meta ??= {});
        meta.id ??= createId("img");
        meta.name ??= `图片 ${idx + 1}`;
        // 标记为框架层 Element（Scene 会在 object:added 时自动 wrap）
        ensureElementMetaOnObject(fo, { id: meta.id as string, type: "image" });
        scene?.ensureElementFromObject(fo);
        return { id: meta.id as string, name: meta.name as string, obj: fo };
      });

    setImageItems(imgs);
    setSelectedImageId((prev) => (prev && imgs.some((x) => x.id === prev) ? prev : imgs[0]?.id));
  }, []);

  const stopFocusAnim = useCallback(() => {
    if (focusAnimRef.current != null) {
      cancelAnimationFrame(focusAnimRef.current);
      focusAnimRef.current = null;
    }
  }, []);

  const focusObject = useCallback(
    (obj: FabricObject) => {
      const c = canvasRef.current;
      if (!c) return;

      c.setActiveObject(obj);

      const center = obj.getCenterPoint();
      const vpt = c.viewportTransform;
      if (!vpt) return;
      const canvasCenterX = c.getWidth() / 2;
      const canvasCenterY = c.getHeight() / 2;

      const targetE = canvasCenterX - (vpt[0] * center.x + vpt[2] * center.y);
      const targetF = canvasCenterY - (vpt[1] * center.x + vpt[3] * center.y);

      stopFocusAnim();

      const startE = vpt[4];
      const startF = vpt[5];
      const duration = 260;
      const startTs = performance.now();

      const tick = (now: number) => {
        const t = Math.min(1, (now - startTs) / duration);
        const k = easeOutCubic(t);

        vpt[4] = startE + (targetE - startE) * k;
        vpt[5] = startF + (targetF - startF) * k;

        c.setViewportTransform(vpt);
        c.requestRenderAll();

        if (t < 1) {
          focusAnimRef.current = requestAnimationFrame(tick);
        } else {
          focusAnimRef.current = null;
        }
      };

      focusAnimRef.current = requestAnimationFrame(tick);
    },
    [stopFocusAnim],
  );

  const onPickFile = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const onClearImages = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    c.getObjects()
      .filter((o) => o && ((o as any).type === "image" || o instanceof FabricImage))
      .forEach((o) => c.remove(o));
    c.discardActiveObject();
    c.requestRenderAll();
    syncImagesFromCanvas();
  }, [syncImagesFromCanvas]);

  const onFileChange: React.ChangeEventHandler<HTMLInputElement> = useCallback(
    async (e) => {
      const file = e.target.files?.[0];
      const c = canvasRef.current;
      if (!file || !c) return;

      const objectUrl = URL.createObjectURL(file);
      try {
        const img = await FabricImage.fromURL(objectUrl);
        (img as any).__meta = {
          id: createId("img"),
          name: file.name,
        };
        ensureElementMetaOnObject(img as any, { id: (img as any).__meta.id, type: "image" });

        img.set({
          originX: "center",
          originY: "center",
          left: c.getWidth() / 2,
          top: c.getHeight() / 2,
          selectable: true,
        });

        const iw = img.width || 1;
        const ih = img.height || 1;
        const cw = c.getWidth();
        const ch = c.getHeight();
        const fit = Math.min((cw * 0.75) / iw, (ch * 0.75) / ih, 1);
        img.scale(fit);

        img.set({
          borderColor: "#1677ff",
          cornerColor: "#1677ff",
          cornerStyle: "circle",
          cornerSize: 10,
          transparentCorners: false,
        });

        c.add(img);
        c.setActiveObject(img);
        c.requestRenderAll();

        syncImagesFromCanvas();
        const id = (img as any).__meta?.id as string | undefined;
        if (id) setSelectedImageId(id);
      } finally {
        URL.revokeObjectURL(objectUrl);
        e.target.value = "";
      }
    },
    [syncImagesFromCanvas],
  );

  const toolbar = useMemo(() => {
    return (
      <>
        <Button type="primary" onClick={onPickFile}>
          上传图片
        </Button>
        <Button danger onClick={onClearImages}>
          清空图片
        </Button>

        <Select
          style={{ width: 260 }}
          placeholder="选择图片并定位"
          value={selectedImageId}
          options={imageItems.map((x) => ({ value: x.id, label: x.name }))}
          onChange={(id) => {
            setSelectedImageId(id);
            const item = imageItems.find((x) => x.id === id);
            if (item) focusObject(item.obj);
          }}
          allowClear
          onClear={() => setSelectedImageId(undefined)}
        />

        <input
          ref={fileInputRef}
          style={{ display: "none" }}
          type="file"
          accept="image/*"
          onChange={onFileChange}
        />
      </>
    );
  }, [focusObject, imageItems, onClearImages, onFileChange, onPickFile, selectedImageId]);

  const init = useCallback(
    (ctx: import("../core/types").FabricPluginContext) => {
      canvasRef.current = ctx.canvas;

      const sync = () => syncImagesFromCanvas();
      ctx.canvas.on("object:added", sync);
      ctx.canvas.on("object:removed", sync);

      syncImagesFromCanvas();

      return () => {
        stopFocusAnim();
        ctx.canvas.off("object:added", sync);
        ctx.canvas.off("object:removed", sync);
        canvasRef.current = null;
      };
    },
    [stopFocusAnim, syncImagesFromCanvas],
  );

  return useMemo(
    () => ({
      id: "image-assets",
      init,
      toolbar,
    }),
    [init, toolbar],
  );
}
