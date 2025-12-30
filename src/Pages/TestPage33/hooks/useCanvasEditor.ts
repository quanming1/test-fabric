import { useEffect, useRef, useState } from "react";
import { Rect, Circle } from "fabric";
import { CanvasEditor } from "../core/CanvasEditor";
import { ZoomPlugin, SelectionPlugin, MarkerPlugin } from "../plugins";

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
  wrapRef: React.RefObject<HTMLDivElement | null>
): UseCanvasEditorReturn {
  const canvasElRef = useRef<HTMLCanvasElement>(null);
  const [editor, setEditor] = useState<CanvasEditor | null>(null);

  useEffect(() => {
    const el = canvasElRef.current;
    const wrap = wrapRef.current;
    if (!el || !wrap) return;

    // 创建编辑器
    const editorInstance = new CanvasEditor(el);
    setEditor(editorInstance);

    // 注册插件
    editorInstance
      .use(new ZoomPlugin())
      .use(new SelectionPlugin())
      .use(new MarkerPlugin());

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

    // 添加初始示例对象
    const rect1 = new Rect({
      left: 100,
      top: 100,
      width: 80,
      height: 80,
      fill: "#1677ff",
      rx: 8,
      ry: 8,
    });

    const circle1 = new Circle({
      left: 200,
      top: 120,
      radius: 40,
      fill: "rgba(82,196,26,0.9)",
    });

    // 注册 rect 到 MarkerPlugin
    const markerPlugin = editorInstance.getPlugin<MarkerPlugin>("marker");
    markerPlugin?.registerObject(rect1);

    editorInstance.canvas.add(rect1, circle1);
    editorInstance.render();

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
