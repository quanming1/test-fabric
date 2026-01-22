import { Rect, Circle, Text, Group, Path, type Canvas } from "fabric";
import { BaseRenderer } from "../../../../core/render";
import type { RegionData, RegionStyle, PointStyle, RenderConfig } from "../types";
import { DEFAULT_REGION_STYLE, DEFAULT_POINT_STYLE } from "../types";
import { Category, type ObjectMetadata } from "../../../../core";
import { TransformHelper } from "../../../../utils";

/** 边框小方块配置 */
const TARGET_BLOCK_SIZE = 4;  // 目标方块大小（屏幕像素）
const TARGET_GAP = 3;         // 目标间隙（屏幕像素）

/**
 * 区域渲染器
 * 职责：管理标记区域的创建、更新、删除、预览绘制
 */
export class RegionRenderer extends BaseRenderer<RegionData, RegionStyle, Group> {
    private pointStyle: PointStyle;
    private cornerMarkers = new Map<string, Group>();
    private previewGroup: Group | null = null;

    // 节流相关
    private throttleTimer: ReturnType<typeof setTimeout> | null = null;
    private pendingData: RegionData[] | null = null;
    private pendingConfig: RenderConfig | null = null;
    private static readonly THROTTLE_DELAY = 50; // ~60fps

    // 尺寸缓存（用于 positionOnly 优化）
    private sizeCache = new Map<string, { width: number; height: number; zoom: number }>();

    constructor(canvas: Canvas, metadata: ObjectMetadata, style: Partial<RegionStyle> = {}) {
        super(canvas, metadata, DEFAULT_REGION_STYLE, style);
        // 右下角标记点使用区域的颜色
        this.pointStyle = {
            ...DEFAULT_POINT_STYLE,
            fill: this.style.stroke,
            hoverFill: this.style.stroke,
        };
    }

    protected getDataId(data: RegionData): string {
        return data.id;
    }

    /** 
     * 同步渲染 - 支持配置控制行为
     * @param data 区域数据
     * @param config 渲染配置
     *   - positionOnly: 只更新位置，不重建边框（用于 moving）
     *   - throttle: 启用节流（用于 zoom 等高频场景）
     */
    override sync(data: RegionData[], config: RenderConfig = {}): void {
        const { throttle = false } = config;

        if (throttle) {
            // 节流模式：立即执行首次调用，后续调用在延迟后批量处理
            this.pendingData = data;
            this.pendingConfig = config;

            if (this.throttleTimer) return;

            this.doSync(data, config);

            this.throttleTimer = setTimeout(() => {
                this.throttleTimer = null;
                if (this.pendingData) {
                    this.doSync(this.pendingData, this.pendingConfig ?? {});
                    this.pendingData = null;
                    this.pendingConfig = null;
                }
            }, RegionRenderer.THROTTLE_DELAY);
        } else {
            this.doSync(data, config);
        }
    }

    /** 实际执行同步 */
    private doSync(data: RegionData[], config: RenderConfig): void {
        if (!this.isMounted) this.mount();

        const activeIds = new Set(data.map((d) => this.getDataId(d)));
        const inverseZoom = this.getInverseZoom();

        // 移除失效对象
        for (const [id, obj] of this.objects) {
            if (!activeIds.has(id)) {
                this.removeObject(id, obj);
                this.sizeCache.delete(id);
            }
        }

        // 创建或更新
        data.forEach((item, index) => {
            const id = this.getDataId(item);
            const existing = this.objects.get(id);

            if (existing) {
                this.updateObjectWithConfig(id, existing, item, index, inverseZoom, config);
            } else {
                this.createObject(id, item, index, inverseZoom);
            }
        });

        this.requestRender();
    }

    protected createObject(id: string, data: RegionData, index: number, inverseZoom: number): void {
        const pos = this.getTransformedRect(data);
        if (!pos) return;

        const { fill, stroke } = this.style;

        // 创建边框小方块
        const blocks = this.createBorderBlocks(pos.width, pos.height, stroke, inverseZoom);

        // 创建背景填充矩形
        const bgRect = new Rect({
            left: 0, top: 0,
            width: pos.width, height: pos.height,
            fill, stroke: "transparent",
            originX: "left", originY: "top",
        });

        const group = new Group([bgRect, ...blocks], {
            left: pos.left, top: pos.top,
            angle: pos.angle,
            originX: "left", originY: "top",
            selectable: false, evented: false,
            excludeFromExport: true, hoverCursor: "move",
        });

        this.metadata.set(group, { category: Category.Region, id });
        this.addObject(id, group);

        // 创建右下角标记点
        const cornerPos = this.getCornerPosition(pos);
        this.createCornerMarker(id, cornerPos, index + 1, inverseZoom);
    }

    protected updateObject(id: string, group: Group, data: RegionData, index: number, inverseZoom: number): void {
        this.updateObjectWithConfig(id, group, data, index, inverseZoom, {});
    }

    /** 更新对象 - 支持 positionOnly 优化 */
    private updateObjectWithConfig(
        id: string,
        group: Group,
        data: RegionData,
        index: number,
        inverseZoom: number,
        config: RenderConfig
    ): void {
        const pos = this.getTransformedRect(data);
        if (!pos) return;

        const { positionOnly = false } = config;
        const cached = this.sizeCache.get(id);
        const currentZoom = this.getZoom();

        // 判断是否需要重建边框
        // 1. 没有缓存（首次）
        // 2. 尺寸变化（scaling）
        // 3. zoom 变化（需要重新计算方块大小和间距）
        const sizeChanged = !cached ||
            Math.abs(cached.width - pos.width) > 0.5 ||
            Math.abs(cached.height - pos.height) > 0.5;
        const zoomChanged = !cached || Math.abs(cached.zoom - currentZoom) > 0.001;

        // positionOnly 模式下只在尺寸或 zoom 变化时重建，否则总是重建
        const needRebuild = positionOnly ? (sizeChanged || zoomChanged) : (sizeChanged || zoomChanged || !cached);

        if (needRebuild) {
            // 完整重建
            this.canvas.remove(group);
            this.objects.delete(id);

            const { fill, stroke } = this.style;
            const blocks = this.createBorderBlocks(pos.width, pos.height, stroke, inverseZoom);

            const bgRect = new Rect({
                left: 0, top: 0,
                width: pos.width, height: pos.height,
                fill, stroke: "transparent",
                originX: "left", originY: "top",
            });

            const newGroup = new Group([bgRect, ...blocks], {
                left: pos.left, top: pos.top,
                angle: pos.angle,
                originX: "left", originY: "top",
                selectable: false, evented: false,
                excludeFromExport: true, hoverCursor: "move",
            });

            this.metadata.set(newGroup, { category: Category.Region, id });
            this.addObject(id, newGroup);

            // 更新缓存
            this.sizeCache.set(id, { width: pos.width, height: pos.height, zoom: currentZoom });

            // 确保角标记点在区域上方
            const marker = this.cornerMarkers.get(id);
            if (marker) {
                this.canvas.bringObjectToFront(marker);
            }
        } else {
            // 只更新位置和角度
            group.set({ left: pos.left, top: pos.top, angle: pos.angle });
            group.setCoords();
        }

        // 更新右下角标记点（始终需要）
        const marker = this.cornerMarkers.get(id);
        if (marker) {
            const cornerPos = this.getCornerPosition(pos);
            marker.set({ ...cornerPos, scaleX: inverseZoom, scaleY: inverseZoom });
            marker.setCoords();
            this.setMarkerLabel(marker, index + 1);
        }
    }

    protected override removeObject(id: string, group: Group): void {
        super.removeObject(id, group);
        const marker = this.cornerMarkers.get(id);
        if (marker) {
            this.canvas.remove(marker);
            this.cornerMarkers.delete(id);
        }
    }

    /** 清空所有区域 */
    clear(): void {
        for (const group of this.objects.values()) {
            this.canvas.remove(group);
        }
        this.objects.clear();
        for (const marker of this.cornerMarkers.values()) {
            this.canvas.remove(marker);
        }
        this.cornerMarkers.clear();
    }

    /** 更新样式 */
    setStyle(style: Partial<RegionStyle>): void {
        this.style = { ...this.style, ...style };
        this.pointStyle = {
            ...this.pointStyle,
            fill: this.style.stroke,
            hoverFill: this.style.stroke,
        };
    }

    /** 置顶所有区域 */
    bringToFront(): void {
        for (const group of this.objects.values()) {
            this.canvas.bringObjectToFront(group);
        }
        for (const marker of this.cornerMarkers.values()) {
            this.canvas.bringObjectToFront(marker);
        }
    }

    /** 设置所有区域的 evented 状态 */
    setEvented(evented: boolean): void {
        this.metadata.filter("category", Category.Region).forEach((obj) => {
            obj.evented = evented;
        });
    }

    // ─── 预览框相关 ─────────────────────────────────────────

    /** 创建预览框 */
    createPreview(scenePt: { x: number; y: number }): void {
        const { fill, stroke } = this.style;
        this.previewGroup = new Group([], {
            left: scenePt.x, top: scenePt.y,
            originX: "left", originY: "top",
            selectable: false, evented: false,
        });
        this.canvas.add(this.previewGroup);
    }

    /** 更新预览框 - 实时计算 */
    updatePreview(startPt: { x: number; y: number }, currentPt: { x: number; y: number }): void {
        if (!this.previewGroup) return;

        const left = Math.min(startPt.x, currentPt.x);
        const top = Math.min(startPt.y, currentPt.y);
        const width = Math.abs(currentPt.x - startPt.x);
        const height = Math.abs(currentPt.y - startPt.y);

        // 移除旧的预览，重新创建
        this.canvas.remove(this.previewGroup);

        const { fill, stroke } = this.style;
        const inverseZoom = 1 / this.canvas.getZoom();

        const blocks = this.createBorderBlocks(width, height, stroke, inverseZoom);
        const bgRect = new Rect({
            left: 0, top: 0, width, height,
            fill, stroke: "transparent",
            originX: "left", originY: "top",
        });

        this.previewGroup = new Group([bgRect, ...blocks], {
            left, top,
            originX: "left", originY: "top",
            selectable: false, evented: false,
        });
        this.canvas.add(this.previewGroup);
        this.requestRender();
    }

    /** 移除预览框 */
    removePreview(): void {
        if (this.previewGroup) {
            this.canvas.remove(this.previewGroup);
            this.previewGroup = null;
        }
    }

    // ─── Private ─────────────────────────────────────────

    /** 
     * 创建边框小方块
     * 算法：四角固定放方块，中间根据剩余空间均匀填充
     * 优化：使用单个 Path 绘制所有方块，减少对象数量
     * 
     * ⚠️ 修改此方法时，需同步修改 MarkerExportPainter.drawRegionBorder()
     * 
     * @param width 区域宽度（场景坐标）
     * @param height 区域高度（场景坐标）
     * @param color 方块颜色
     * @param inverseZoom 缩放倒数，用于保持方块在屏幕上的固定大小
     */
    private createBorderBlocks(width: number, height: number, color: string, inverseZoom: number): Path[] {
        // 方块大小和间距在屏幕上保持固定（乘以 inverseZoom 转换到场景坐标）
        const blockSize = TARGET_BLOCK_SIZE * inverseZoom;
        const blockGap = TARGET_GAP * inverseZoom;

        // 计算一条边上的方块位置（两端固定在 0 和 length-size，中间均匀分布）
        const calcPositions = (length: number, size: number, gap: number): number[] => {
            const endPos = length - size;
            if (endPos <= 0) return [0];

            const positions = [0];
            const innerSpace = endPos;
            const minSpacing = size + gap;
            const innerCount = Math.max(0, Math.floor((innerSpace - minSpacing) / minSpacing));

            if (innerCount > 0) {
                const spacing = innerSpace / (innerCount + 1);
                for (let i = 1; i <= innerCount; i++) {
                    positions.push(i * spacing);
                }
            }

            positions.push(endPos);
            return positions;
        };

        const hPositions = calcPositions(width, blockSize, blockGap);
        const vPositions = calcPositions(height, blockSize, blockGap);

        // 收集所有方块的 path
        const paths: string[] = [];

        // 缺角尺寸（矩形的一半）
        const notchW = blockSize / 2;
        const notchH = blockSize / 2;

        // 四个角 - 缺角的 L 形
        // 左上角：缺右下角
        paths.push(`M 0 0 h ${blockSize} v ${notchH} h ${-notchW} v ${notchH} h ${-notchW} Z`);
        // 右上角：缺左下角
        paths.push(`M ${width - blockSize} 0 h ${blockSize} v ${blockSize} h ${-notchW} v ${-notchH} h ${-notchW} Z`);
        // 左下角：缺右上角
        paths.push(`M 0 ${height - blockSize} h ${notchW} v ${notchH} h ${notchW} v ${notchH} h ${-blockSize} Z`);
        // 右下角：缺左上角
        paths.push(`M ${width - notchW} ${height - blockSize} h ${notchW} v ${blockSize} h ${-blockSize} v ${-notchH} h ${notchW} Z`);

        // 上边和下边（跳过两端）
        for (let i = 1; i < hPositions.length - 1; i++) {
            paths.push(`M ${hPositions[i]} 0 h ${blockSize} v ${blockSize} h ${-blockSize} Z`);
            paths.push(`M ${hPositions[i]} ${height - blockSize} h ${blockSize} v ${blockSize} h ${-blockSize} Z`);
        }

        // 左边和右边（跳过两端）
        for (let i = 1; i < vPositions.length - 1; i++) {
            paths.push(`M 0 ${vPositions[i]} h ${blockSize} v ${blockSize} h ${-blockSize} Z`);
            paths.push(`M ${width - blockSize} ${vPositions[i]} h ${blockSize} v ${blockSize} h ${-blockSize} Z`);
        }

        // 合成一个 Path
        const pathData = paths.join(' ');

        const path = new Path(pathData, {
            fill: color,
            stroke: 'transparent',
            originX: 'left',
            originY: 'top',
        });

        return [path];
    }

    private createCornerMarker(id: string, pos: { left: number; top: number }, label: number, scale: number): void {
        const { radius, fill, stroke, strokeWidth, textColor, fontSize } = this.pointStyle;

        const circle = new Circle({
            radius, fill, stroke, strokeWidth,
            originX: "center", originY: "center",
        });

        const text = new Text(String(label), {
            fontSize, fill: textColor, fontWeight: "bold", fontFamily: "Arial",
            originX: "center", originY: "center",
        });

        const group = new Group([circle, text], {
            ...pos, scaleX: scale, scaleY: scale,
            originX: "center", originY: "center",
            selectable: false, evented: false,
            excludeFromExport: true,
        });

        this.metadata.set(group, { category: Category.Region, id: `${id}-corner` });
        this.canvas.add(group);
        this.cornerMarkers.set(id, group);
    }

    private getCornerPosition(rect: { left: number; top: number; width: number; height: number; angle: number }): { left: number; top: number } {
        const { left, top, width, height, angle } = rect;
        const rad = (angle * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);

        return {
            left: left + width * cos - height * sin,
            top: top + width * sin + height * cos,
        };
    }

    private setMarkerLabel(group: Group, label: number): void {
        const text = group.item(1) as Text;
        if (text.text !== String(label)) {
            text.set("text", String(label));
        }
    }

    private getTransformedRect(region: RegionData): { left: number; top: number; width: number; height: number; angle: number } | null {
        const { targetId, nx, ny, nw, nh } = region;
        const target = this.metadata.getById(targetId);
        if (!target?.width || !target?.height) return null;

        const tw = target.width;
        const th = target.height;

        const localX = nx * tw - tw / 2;
        const localY = ny * th - th / 2;
        const localW = nw * tw;
        const localH = nh * th;

        const matrix = TransformHelper.getAbsoluteMatrix(this.canvas, target);
        const [a, b, c, d, tx, ty] = matrix;
        const { scaleX, scaleY, angle } = TransformHelper.extractScaleAndAngle(matrix);

        return {
            left: a * localX + c * localY + tx,
            top: b * localX + d * localY + ty,
            width: localW * scaleX,
            height: localH * scaleY,
            angle,
        };
    }
}
