import { Point, util, type FabricObject } from "fabric";
import { BasePlugin } from "../base/Plugin";
import { genId, type MarkPoint, type PointView } from "../../core/types";
import { CoordinateHelper } from "../../core/coordinateUtils";

/**
 * 标记点插件
 * 功能：Ctrl+点击在矩形上创建标记点，标记点跟随对象变换（移动、缩放、旋转）
 *
 * 核心原理：
 * - 存储时：将点击位置转换为归一化坐标 (0~1)，相对于矩形左上角
 * - 渲染时：归一化坐标 → 局部坐标 → 场景坐标 → 屏幕坐标
 *
 * 事件：
 * - markers:change: 标记点数据变化时触发
 * - markers:viewUpdate: 标记点屏幕位置更新时触发
 */
export class MarkerPlugin extends BasePlugin {
  readonly name = "marker";

  private points: MarkPoint[] = [];
  private rectById = new Map<string, FabricObject>();

  get markers(): MarkPoint[] {
    return [...this.points];
  }

  protected onInstall(): void {
    this.canvas.on("mouse:down", this.onMouseDown);
    this.canvas.on("object:moving", this.scheduleRecompute);
    this.canvas.on("object:scaling", this.scheduleRecompute);
    this.canvas.on("object:rotating", this.scheduleRecompute);
    this.canvas.on("object:modified", this.scheduleRecompute);
    this.canvas.on("after:render", this.scheduleRecompute);

    // 监听缩放变化
    this.eventBus.on("zoom:change", this.scheduleRecompute);
  }

  private onMouseDown = (opt: any): void => {
    const e = opt.e as MouseEvent;

    // 只响应 Ctrl/Cmd + 点击
    if (!(e.ctrlKey || e.metaKey)) return;

    const target = opt.target;
    console.log("target", target);
    if (!target || target.type !== "rect") return;

    const scenePt = this.canvas.getScenePoint(e as any);
    this.handleAddMarker(target, scenePt);

    e.preventDefault();
    e.stopPropagation();
  };

  /**
   * 添加标记点
   * @param target 目标矩形对象
   * @param scenePt 场景坐标（点击位置）
   */
  handleAddMarker(target: FabricObject, scenePt: { x: number; y: number }): MarkPoint | null {
    const rectId = this.ensureRectId(target);
    const w = target.width ?? 0;
    const h = target.height ?? 0;
    if (!w || !h) return null;

    // 1. 场景坐标 → 局部坐标（对象中心为原点）
    //    使用逆矩阵将场景坐标转回对象的局部坐标系
    const inv = util.invertTransform(target.calcTransformMatrix());
    const localPt = new Point(scenePt.x, scenePt.y).transform(inv);

    // 2. 局部坐标（中心原点）→ 左上角原点
    //    因为归一化需要相对于左上角计算
    const rx = localPt.x + w / 2;
    const ry = localPt.y + h / 2;

    // 3. 归一化：转换为 0~1 的比例值
    //    这样无论对象如何缩放，标记点始终在相对位置
    const nx = rx / w;
    const ny = ry / h;

    const point: MarkPoint = { id: genId("pt"), rectId, nx, ny };
    this.points.push(point);

    this.eventBus.emit("markers:change", [...this.points]);
    requestAnimationFrame(() => this.recomputeViews());

    return point;
  }

  /** 确保对象有唯一 ID，并缓存对象引用 */
  private ensureRectId(obj: FabricObject): string {
    if (!(obj as any).__rectId) {
      (obj as any).__rectId = genId("rect");
    }
    const id = (obj as any).__rectId as string;
    this.rectById.set(id, obj);
    return id;
  }

  /** 注册已有对象（供外部调用） */
  registerObject(obj: FabricObject): string {
    return this.ensureRectId(obj);
  }

  /** 使用 requestAnimationFrame 节流，避免频繁计算 */
  private scheduleRecompute = (): void => {
    requestAnimationFrame(() => this.recomputeViews());
  };

  /**
   * 重新计算所有标记点的屏幕坐标
   * 当对象移动/缩放/旋转或视口变化时调用
   */
  private recomputeViews(): void {
    const vpt = this.canvas.viewportTransform;
    const coordHelper = new CoordinateHelper(vpt);
    const views: Record<string, PointView> = {};

    for (const p of this.points) {
      const rect = this.rectById.get(p.rectId);
      if (!rect) continue;

      const w = rect.width ?? 0;
      const h = rect.height ?? 0;
      if (!w || !h) continue;

      // 1. 归一化坐标 → 局部坐标（中心为原点）
      //    nx * w 得到相对左上角的 x，再减 w/2 转为相对中心
      const local = {
        x: p.nx * w - w / 2,
        y: p.ny * h - h / 2,
      };

      // 2. 局部坐标 → 屏幕坐标（用于 DOM 定位）
      const vpPt = coordHelper.localToScreen(local, rect);
      views[p.id] = { x: vpPt.x, y: vpPt.y };
    }

    this.eventBus.emit("markers:viewUpdate", views);
  }

  /** 删除标记点 */
  removeMarker(id: string): void {
    this.points = this.points.filter((p) => p.id !== id);
    this.eventBus.emit("markers:change", [...this.points]);
    this.recomputeViews();
  }

  /** 清空所有标记点 */
  clearMarkers(): void {
    this.points = [];
    this.eventBus.emit("markers:change", []);
    this.eventBus.emit("markers:viewUpdate", {});
  }

  protected onDestroy(): void {
    this.canvas.off("mouse:down", this.onMouseDown);
    this.canvas.off("object:moving", this.scheduleRecompute);
    this.canvas.off("object:scaling", this.scheduleRecompute);
    this.canvas.off("object:rotating", this.scheduleRecompute);
    this.canvas.off("object:modified", this.scheduleRecompute);
    this.canvas.off("after:render", this.scheduleRecompute);
    this.rectById.clear();
  }
}
