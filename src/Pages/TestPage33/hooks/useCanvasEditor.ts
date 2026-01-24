import { useEffect, useRef, useState } from "react";
import type { FabricObject } from "fabric";
import { ZoomPlugin, SelectionPlugin, MarkerPlugin, ModePlugin, DrawPlugin, ImagePlugin, ImportExportPlugin, GuidelinesPlugin, ControlsPlugin, ToolbarPlugin } from "../plugins";
import { CanvasEditor, Category } from "../core";

export interface UseCanvasEditorOptions {
  /** 编辑器初始化完成回调 */
  onReady?: (editor: CanvasEditor) => void;
  /** 缩放变化回调 */
  onZoomChange?: (zoom: number) => void;
  /** 选中对象变化回调 */
  onSelectionChange?: (obj: FabricObject | null) => void;
}

export interface UseCanvasEditorReturn {
  canvasElRef: React.RefObject<HTMLCanvasElement>;
  editor: CanvasEditor | null;
}

/**
 * Canvas 编辑器 Hook
 * 只负责创建和管理 editor 生命周期，不暴露具体状态
 * 各组件通过 useEditorEvent 自行订阅需要的事件
 */
export function useCanvasEditor(
  wrapRef: React.RefObject<HTMLDivElement | null>,
  options: UseCanvasEditorOptions = {}
): UseCanvasEditorReturn {
  const { onReady, onZoomChange, onSelectionChange } = options;
  const canvasElRef = useRef<HTMLCanvasElement>(null);
  const [editor, setEditor] = useState<CanvasEditor | null>(null);

  useEffect(() => {
    const el = canvasElRef.current;
    const wrap = wrapRef.current;
    if (!el || !wrap) return;

    // 创建编辑器
    const editorInstance = new CanvasEditor(el);
    setEditor(editorInstance);

    // 注册事件回调
    if (onZoomChange) {
      editorInstance.eventBus.on("zoom:change", onZoomChange);
    }
    if (onSelectionChange) {
      editorInstance.eventBus.on("selection:change", onSelectionChange);
    }

    // 注册插件
    editorInstance
      .use(new ModePlugin())
      .use(new ZoomPlugin())
      .use(new SelectionPlugin({ toolbarOffsetY: 12 }))
      .use(new DrawPlugin())
      .use(new MarkerPlugin())
      .use(new ImagePlugin())
      .use(new ImportExportPlugin())
      .use(new GuidelinesPlugin({
        allowedCategories: [Category.DrawRect, Category.Image],
      }))
      .use(new ControlsPlugin({
        lockAspectRatio: true,
      }))
      .use(new ToolbarPlugin());

    // 响应式尺寸
    let ro: ResizeObserver | null = null;
    const resize = () => {
      editorInstance.setSize(wrap.clientWidth, wrap.clientHeight);
    };

    try {
      ro = new ResizeObserver(resize);
      ro.observe(wrap);
    } catch {
      window.addEventListener("resize", resize);
    }
    resize();

    // 触发 onReady 回调
    onReady?.(editorInstance);

    return () => {
      if (ro) ro.disconnect();
      else window.removeEventListener("resize", resize);
      editorInstance.destroy();
      setEditor(null);
    };
  }, [wrapRef]);

  return {
    canvasElRef,
    editor,
  };
}
