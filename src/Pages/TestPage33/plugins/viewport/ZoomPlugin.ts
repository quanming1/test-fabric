import type { TPointerEventInfo } from "fabric";
import { BasePlugin } from "../base/Plugin";
import { calculateBounds, animate, animateMultiple, Easing } from "./helpers";

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

/** 定位到元素配置 */
export interface FocusToObjectOptions {
  /** 目标缩放比例，不传则保持当前缩放 */
  zoom?: number;
  /** 动画时长(ms)，默认 300 */
  duration?: number;
  /** 缓动函数，默认 easeInCubic */
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
 * 功能：滚轮缩放、重置缩放、适配视图、初始化 loading 遮罩
 * 事件：zoom:change
 */
export class ZoomPlugin extends BasePlugin {
  readonly name = "zoom";

  private _zoom = 1;
  private minZoom = 0.1;
  private maxZoom = 20;
  private fitViewOptions: Required<FitViewOptions> = DEFAULT_FIT_VIEW_OPTIONS;
  private loadingOverlay: HTMLDivElement | null = null;

  get zoom(): number {
    return this._zoom;
  }

  protected onInstall(): void {
    this._zoom = this.canvas.getZoom();
    this.canvas.on("mouse:wheel", this.onWheel);
    this.eventBus.on("sync:initialized", this.onSyncInitialized);

    // 创建 loading 遮罩层
    this.createLoadingOverlay();
  }

  /** 创建 loading 遮罩层 */
  private createLoadingOverlay(): void {
    const container = this.canvas.getElement().parentElement;
    if (!container) return;

    this.loadingOverlay = document.createElement("div");
    this.loadingOverlay.className = "zoom-plugin-loading-overlay";
    Object.assign(this.loadingOverlay.style, {
      position: "absolute",
      top: "0",
      left: "0",
      width: "100%",
      height: "100%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "#fff",
      zIndex: "1000",
      transition: "opacity 0.3s ease",
    });

    // loading 内容
    this.loadingOverlay.innerHTML = `
      <div style="text-align: center;">
        <div style="
          width: 40px;
          height: 40px;
          border: 3px solid #e0e0e0;
          border-top-color: #3b82f6;
          border-radius: 50%;
          animation: zoom-plugin-spin 0.8s linear infinite;
          margin: 0 auto 12px;
        "></div>
        <div style="color: #666; font-size: 14px;">加载中...</div>
      </div>
      <style>
        @keyframes zoom-plugin-spin {
          to { transform: rotate(360deg); }
        }
      </style>
    `;

    container.appendChild(this.loadingOverlay);
  }

  /** 隐藏并移除 loading 遮罩层 */
  private hideLoadingOverlay(): void {
    if (!this.loadingOverlay) return;

    this.loadingOverlay.style.opacity = "0";
    setTimeout(() => {
      this.loadingOverlay?.remove();
      this.loadingOverlay = null;
    }, 300);
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

  /** 同步初始化完成后适配视图并隐藏 loading */
  private onSyncInitialized = (): void => {
    this.fitToView();
    this.hideLoadingOverlay();
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

  /**
   * 定位到指定元素
   * @param id 元素 ID
   * @param options 配置项
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

    // 计算目标视口位置
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
    this.loadingOverlay?.remove();
    this.loadingOverlay = null;
  }
}
