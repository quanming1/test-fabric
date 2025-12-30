import { BasePlugin } from "../base/Plugin";

/**
 * 缩放插件
 * 功能：滚轮缩放、重置缩放
 * 事件：zoom:change
 */
export class ZoomPlugin extends BasePlugin {
  readonly name = "zoom";

  private _zoom = 1;
  private minZoom = 0.1;
  private maxZoom = 20;

  get zoom(): number {
    return this._zoom;
  }

  protected onInstall(): void {
    this._zoom = this.canvas.getZoom();
    this.canvas.on("mouse:wheel", this.onWheel);
  }

  private onWheel = (opt: any): void => {
    const e = opt.e as WheelEvent;
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

  protected onDestroy(): void {
    this.canvas.off("mouse:wheel", this.onWheel);
  }
}
