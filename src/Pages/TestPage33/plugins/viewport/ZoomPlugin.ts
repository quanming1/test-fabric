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
  private minZoom = 0.1;
  private maxZoom = 20;
  private fitViewOptions: Required<FitViewOptions> = DEFAULT_FIT_VIEW_OPTIONS;

  get zoom(): number {
    return this._zoom;
  }

  protected onInstall(): void {
    this._zoom = this.canvas.getZoom();
    this.canvas.on("mouse:wheel", this.onWheel);
    this.eventBus.on("sync:initialized", this.onSyncInitialized);

    // 注册 DOM 图层
    this.editor.domLayer.register("loading-overlay", LoadingOverlay);
    this.editor.domLayer.register("zoom-bar", ZoomBar);
  }

  private onWheel = (opt: TPointerEventInfo<WheelEvent>): void => {
    const e = opt.e;
    e.preventDefault();
    e.stopPropagation();

    const point = { x: e.offsetX, y: e.offsetY };
    let newZoom = this.canvas.getZoom() * 0.999 ** e.deltaY;
    newZoom = Math.max(this.minZoom, Math.min(this.maxZoom, newZoom));

    this.canvas.zoomToPoint(point as any, newZoom);
    this._zoom = newZoom;

    this.eventBus.emit("zoom:change", newZoom);
  };

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

    const scaleX = (canvasWidth - padding * 2) / bounds.width;
    const scaleY = (canvasHeight - padding * 2) / bounds.height;
    let targetZoom = Math.min(scaleX, scaleY);

    targetZoom = Math.min(targetZoom, this.maxZoom);
    targetZoom = Math.max(targetZoom, this.minZoom);

    const centerX = bounds.left + bounds.width / 2;
    const centerY = bounds.top + bounds.height / 2;

    const vpt = this.canvas.viewportTransform;
    if (vpt) {
      vpt[4] = canvasWidth / 2 - centerX;
      vpt[5] = canvasHeight / 2 - centerY;
      this.canvas.setViewportTransform(vpt);
    }

    const center = { x: canvasWidth / 2, y: canvasHeight / 2 };
    if (opts.animation.enabled) {
      animate(
        this._zoom,
        targetZoom,
        { duration: opts.animation.duration!, easing: opts.animation.easing! },
        (zoom) => {
          this.canvas.zoomToPoint(center as any, zoom);
          this._zoom = zoom;
        },
        () => this.eventBus.emit("zoom:change", targetZoom)
      );
    } else {
      this.canvas.zoomToPoint(center as any, targetZoom);
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
