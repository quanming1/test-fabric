import React, { useState, useEffect } from "react";
import type { CanvasEditor } from "../editor/CanvasEditor";
import type { DOMLayer } from "./types";

interface DOMLayerRendererProps {
  editor: CanvasEditor | null;
}

/**
 * DOM 图层渲染器
 * 订阅 DOMLayerManager，自动渲染所有注册的图层组件
 */
export const DOMLayerRenderer: React.FC<DOMLayerRendererProps> = ({ editor }) => {
  const [layers, setLayers] = useState<DOMLayer[]>([]);

  useEffect(() => {
    if (!editor) {
      setLayers([]);
      return;
    }

    // 初始化
    setLayers(editor.domLayer.getLayers());

    // 订阅变化
    const unsubscribe = editor.domLayer.subscribe(() => {
      setLayers(editor.domLayer.getLayers());
    });

    return unsubscribe;
  }, [editor]);

  if (!editor) return null;

  return (
    <>
      {layers.map((layer) => {
        const { visible } = layer.config;
        const isVisible = typeof visible === "function" ? visible() : visible !== false;
        if (!isVisible) return null;

        const Component = layer.component;
        return <Component key={layer.config.id} editor={editor} />;
      })}
    </>
  );
};
