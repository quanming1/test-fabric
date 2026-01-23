import type { TPointerEventInfo } from "fabric";
import { BasePlugin } from "../base/Plugin";
import { calculateBounds, animate, animateMultiple, Easing } from "./helpers";
import { ZoomBar, LoadingOverlay } from "./render";

/** 适配视图动画配置 */
export interface FitViewAnimationOptions {
  enabled?: boolean;
  duration?: number;
  easing?: (t: number) => number;
}

/** 适配视图配置 */
export interface FitViewOptions {
  padding?: number;
  animation?: FitViewAnimationOptions;
}

/** 定位到元素配置 */
export interface FocusToObjectOptions {
  zoom?: number;
  duration?: number;
  easing?: (t: number) => number;
}

const DEFAULT_FIT_VIEW_OPTIONS: Required<FitViewOptions> = {
  padding: 150,
  animation: {
    enabled: false,
    duration: 800,
    easing: Easing.easeInCubic,
  },
};

/**
 * 缩放插件
 * 功能：滚轮缩放、重置缩放、适配视图
 * 事件：zoom:change
 */
export class ZoomPlugin extends BasePlugin {
  readonly name = "zoom";

  private _zoom = 1;
  private minZoom = 0.25;
  private maxZoom = 4;
  private fitViewOptions: Required<FitViewOptions> = DEFAULT_FIT_VIEW_OPTIONS;

  get zoom(): number {
    return this._zoom;
  }

  protected onInstall(): void {
    this._zoom = this.canvas.getZoom();
    this.canvas.on("mouse:wheel", this.onWheel);
    this.eventBus.on("sync:initialized", this.onSyncInitialized);

    // 注册 DOM 图层
    this.editor.domLayer.register("loading-overlay", LoadingOverlay, {
      zIndex: 1000,
      visible: true,
    });
    this.editor.domLayer.register("zoom-bar", ZoomBar, {
      zIndex: 100,
      visible: true,
    });
  }

  /** 触摸板滑动判定阈值：deltaY 小于此值视为触摸板滑动 */
  private static readonly TRACKPAD_THRESHOLD = 50;
  /** 普通鼠标滚轮缩放系数 */
  private static readonly MOUSE_ZOOM_FACTOR = 0.999;
  /** 触摸板捏合缩放系数 */
  private static readonly TRACKPAD_ZOOM_FACTOR = 0.99;

  private onWheel = (opt: TPointerEventInfo<WheelEvent>): void => {
    const e = opt.e;
    e.preventDefault();
    e.stopPropagation();

    const isSmallDelta = Math.abs(e.deltaY) < ZoomPlugin.TRACKPAD_THRESHOLD;

    // Mac 触摸板双指捏合：ctrlKey + 小 deltaY
    if (e.ctrlKey && isSmallDelta) {
      this.handleZoom(e, ZoomPlugin.TRACKPAD_ZOOM_FACTOR);
      return;
    }

    // 触摸板双指滑动：deltaX 非零，或 deltaY 较小（无 ctrlKey）
    const isTrackpadPan = !e.ctrlKey && (e.deltaX !== 0 || isSmallDelta);
    if (isTrackpadPan) {
      this.handlePan(e.deltaX, e.deltaY);
      return;
    }

    // 普通鼠标滚轮缩放（包括 Ctrl + 滚轮）
    this.handleZoom(e, ZoomPlugin.MOUSE_ZOOM_FACTOR);
  };

  /** 处理缩放 */
  private handleZoom(e: WheelEvent, factor: number): void {
    const point = { x: e.offsetX, y: e.offsetY };
    let newZoom = this.canvas.getZoom() * factor ** e.deltaY;
    newZoom = Math.max(this.minZoom, Math.min(this.maxZoom, newZoom));

    this.canvas.zoomToPoint(point as any, newZoom);
    this._zoom = newZoom;
    this.eventBus.emit("zoom:change", newZoom);
  }

  /** 处理平移 */
  private handlePan(deltaX: number, deltaY: number): void {
    const vpt = this.canvas.viewportTransform;
    if (!vpt) return;

    vpt[4] -= deltaX;
    vpt[5] -= deltaY;
    this.canvas.setViewportTransform(vpt);
    this.canvas.requestRenderAll();
  }

  /** 重置缩放到 100% */
  reset(): void {
    this.canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    this._zoom = 1;
    this.eventBus.emit("zoom:change", 1);
  }

  /** 设置缩放 */
  setZoom(zoom: number, center?: { x: number; y: number }): void {
    const newZoom = Math.max(this.minZoom, Math.min(this.maxZoom, zoom));
    if (center) {
      this.canvas.zoomToPoint(center as any, newZoom);
    } else {
      this.canvas.setZoom(newZoom);
    }
    this._zoom = newZoom;
    this.eventBus.emit("zoom:change", newZoom);
  }

  /** 同步初始化完成后适配视图 */
  private onSyncInitialized = (): void => {
    this.fitToView();
  };

  /** 配置适配视图选项 */
  setFitViewOptions(options: FitViewOptions): void {
    this.fitViewOptions = {
      ...DEFAULT_FIT_VIEW_OPTIONS,
      ...options,
      animation: {
        ...DEFAULT_FIT_VIEW_OPTIONS.animation,
        ...options.animation,
      },
    };
  }

  /**
   * 适配视图：将所有元素居中显示
   * 
   * 计算逻辑：
   * 1. 获取所有对象的场景坐标边界
   * 2. 计算能容纳边界的最佳缩放比例
   * 3. 计算使边界中心对齐画布中心的 viewportTransform
   */
  fitToView(options?: FitViewOptions): void {
    const opts = {
      ...this.fitViewOptions,
      ...options,
      animation: {
        ...this.fitViewOptions.animation,
        ...options?.animation,
      },
    };

    const objects = this.canvas.getObjects();
    if (objects.length === 0) return;

    const bounds = calculateBounds(objects);
    if (!bounds) return;

    const canvasWidth = this.canvas.getWidth();
    const canvasHeight = this.canvas.getHeight();
    const padding = opts.padding;

    // 计算能容纳边界的最佳缩放比例
    const scaleX = (canvasWidth - padding * 2) / bounds.width;
    const scaleY = (canvasHeight - padding * 2) / bounds.height;
    let targetZoom = Math.min(scaleX, scaleY);
    targetZoom = Math.max(this.minZoom, Math.min(this.maxZoom, targetZoom));

    // 边界中心（场景坐标）
    const centerX = bounds.left + bounds.width / 2;
    const centerY = bounds.top + bounds.height / 2;

    // 计算 viewportTransform 的平移值
    // 公式：屏幕坐标 = 场景坐标 * zoom + vpt[4/5]
    // 要让场景中心显示在画布中心：canvasWidth/2 = centerX * zoom + vptX
    const targetVptX = canvasWidth / 2 - centerX * targetZoom;
    const targetVptY = canvasHeight / 2 - centerY * targetZoom;

    const vpt = this.canvas.viewportTransform;
    if (!vpt) return;

    if (opts.animation.enabled) {
      animateMultiple(
        { zoom: this._zoom, vptX: vpt[4], vptY: vpt[5] },
        { zoom: targetZoom, vptX: targetVptX, vptY: targetVptY },
        { duration: opts.animation.duration!, easing: opts.animation.easing! },
        ({ zoom, vptX, vptY }) => {
          vpt[0] = zoom;
          vpt[3] = zoom;
          vpt[4] = vptX;
          vpt[5] = vptY;
          this.canvas.setViewportTransform(vpt);
          this._zoom = zoom;
        },
        () => this.eventBus.emit("zoom:change", targetZoom)
      );
    } else {
      // 直接设置最终的 viewportTransform，避免分步操作导致位置错乱
      vpt[0] = targetZoom;
      vpt[3] = targetZoom;
      vpt[4] = targetVptX;
      vpt[5] = targetVptY;
      this.canvas.setViewportTransform(vpt);
      this._zoom = targetZoom;
      this.eventBus.emit("zoom:change", targetZoom);
    }
  }

  /**
   * 定位到指定元素
   */
  focusToObject(id: string, options?: FocusToObjectOptions): void {
    const obj = this.canvas.getObjects().find((o) => (o as any).id === id);
    if (!obj) return;

    const opts = {
      duration: 300,
      easing: Easing.easeInCubic,
      ...options,
    };

    const canvasWidth = this.canvas.getWidth();
    const canvasHeight = this.canvas.getHeight();
    const objCenter = obj.getCenterPoint();
    const targetZoom = opts.zoom ?? this._zoom;

    const targetVptX = canvasWidth / 2 - objCenter.x * targetZoom;
    const targetVptY = canvasHeight / 2 - objCenter.y * targetZoom;

    const vpt = this.canvas.viewportTransform;
    if (!vpt) return;

    if (opts.duration > 0) {
      animateMultiple(
        { zoom: this._zoom, vptX: vpt[4], vptY: vpt[5] },
        { zoom: targetZoom, vptX: targetVptX, vptY: targetVptY },
        { duration: opts.duration, easing: opts.easing },
        ({ zoom, vptX, vptY }) => {
          vpt[0] = zoom;
          vpt[3] = zoom;
          vpt[4] = vptX;
          vpt[5] = vptY;
          this.canvas.setViewportTransform(vpt);
          this._zoom = zoom;
        },
        () => this.eventBus.emit("zoom:change", targetZoom)
      );
    } else {
      vpt[0] = targetZoom;
      vpt[3] = targetZoom;
      vpt[4] = targetVptX;
      vpt[5] = targetVptY;
      this.canvas.setViewportTransform(vpt);
      this._zoom = targetZoom;
      this.eventBus.emit("zoom:change", targetZoom);
    }
  }

  protected onDestroy(): void {
    this.canvas.off("mouse:wheel", this.onWheel);
    this.eventBus.off("sync:initialized", this.onSyncInitialized);
    this.editor.domLayer.unregister("loading-overlay");
    this.editor.domLayer.unregister("zoom-bar");
  }
}
