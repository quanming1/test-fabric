import type { TPointerEventInfo } from "fabric";
import { BasePlugin } from "../base/Plugin";
import { calculateBounds, animate, Easing, type AnimationOptions } from "./helpers";

/** 适配视图动画配置 */
export interface FitViewAnimationOptions {
  /** 是否启用缩放动画，默认 true */
  enabled?: boolean;
  /** 动画时长(ms)，默认 300 */
  duration?: number;
  /** 缓动函数，默认 easeInCubic */
  easing?: (t: number) => number;
}

/** 适配视图配置 */
export interface FitViewOptions {
  /** 边距，默认 50 */
  padding?: number;
  /** 动画配置 */
  animation?: FitViewAnimationOptions;
}

const DEFAULT_FIT_VIEW_OPTIONS: Required<FitViewOptions> = {
  padding: 50,
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
   * 1. 先平移到中心（无动画）
   * 2. 再缩放到合适大小（带动画）
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

    // 计算所有元素的包围盒
    const bounds = calculateBounds(objects);
    if (!bounds) return;

    const canvasWidth = this.canvas.getWidth();
    const canvasHeight = this.canvas.getHeight();
    const padding = opts.padding;

    // 计算目标缩放比例
    const scaleX = (canvasWidth - padding * 2) / bounds.width;
    const scaleY = (canvasHeight - padding * 2) / bounds.height;
    let targetZoom = Math.min(scaleX, scaleY);

    // 限制在最大缩放范围内
    targetZoom = Math.min(targetZoom, this.maxZoom);
    targetZoom = Math.max(targetZoom, this.minZoom);

    // 计算元素中心点
    const centerX = bounds.left + bounds.width / 2;
    const centerY = bounds.top + bounds.height / 2;

    // 1. 先平移到中心（无动画）
    const vpt = this.canvas.viewportTransform;
    if (vpt) {
      vpt[4] = canvasWidth / 2 - centerX;
      vpt[5] = canvasHeight / 2 - centerY;
      this.canvas.setViewportTransform(vpt);
    }

    // 2. 缩放（带动画或不带）
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

  protected onDestroy(): void {
    this.canvas.off("mouse:wheel", this.onWheel);
    this.eventBus.off("sync:initialized", this.onSyncInitialized);
  }
}
