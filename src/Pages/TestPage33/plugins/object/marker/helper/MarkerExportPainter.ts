import type { PointStyle, RegionStyle } from "../types";
import { DEFAULT_POINT_STYLE, DEFAULT_REGION_STYLE } from "../types";

/** 边框小方块配置（需与 RegionRenderer 保持一致） */
const BLOCK_SIZE = 4;  // 方块大小（像素）
const BLOCK_GAP = 3;   // 方块间隙（像素）

/**
 * 标记导出绘制器 - 将点/区域标记绘制到原生 Canvas2D（用于图片导出）
 * 
 * ⚠️ 样式同步提醒：
 * - 点标记样式需与 PointRenderer.createObject() 保持一致
 * - 区域边框样式需与 RegionRenderer.createBorderBlocks() 保持一致
 * - 修改画布渲染样式时，必须同步修改此文件
 */
export class MarkerExportPainter {
    /**
     * 绘制点标记到 Canvas2D
     * 
     * ⚠️ 样式需与 PointRenderer.createObject() 保持一致
     * 
     * @param ctx Canvas2D 上下文
     * @param x 中心点 x 坐标（像素）
     * @param y 中心点 y 坐标（像素）
     * @param label 序号（从 1 开始）
     * @param style 样式配置
     * @param scale 缩放比例
     */
    static drawPoint(
        ctx: CanvasRenderingContext2D,
        x: number,
        y: number,
        label: number,
        style: PointStyle = DEFAULT_POINT_STYLE,
        scale: number = 1
    ): void {
        const { radius, fill, stroke, strokeWidth, textColor, fontSize } = style;
        const scaledRadius = radius * scale;
        const scaledStrokeWidth = strokeWidth * scale;
        const scaledFontSize = fontSize * scale;

        // 绘制圆形背景
        ctx.beginPath();
        ctx.arc(x, y, scaledRadius, 0, Math.PI * 2);
        ctx.fillStyle = fill;
        ctx.fill();

        // 绘制边框
        if (scaledStrokeWidth > 0) {
            ctx.strokeStyle = stroke;
            ctx.lineWidth = scaledStrokeWidth;
            ctx.stroke();
        }

        // 绘制序号文字
        ctx.fillStyle = textColor;
        ctx.font = `bold ${scaledFontSize}px Arial`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(label), x, y);
    }

    /**
     * 绘制区域标记到 Canvas2D（背景 + 边框 + 角标）
     * 
     * ⚠️ 样式需与 RegionRenderer.createObject() 保持一致
     * 
     * @param ctx Canvas2D 上下文
     * @param x 左上角 x 坐标（像素）
     * @param y 左上角 y 坐标（像素）
     * @param width 宽度（像素）
     * @param height 高度（像素）
     * @param label 序号（从 1 开始）
     * @param style 样式配置
     * @param scale 缩放比例
     */
    static drawRegion(
        ctx: CanvasRenderingContext2D,
        x: number,
        y: number,
        width: number,
        height: number,
        label: number,
        style: RegionStyle = DEFAULT_REGION_STYLE,
        scale: number = 1
    ): void {
        const { fill, stroke } = style;

        // 绘制背景填充
        ctx.fillStyle = fill;
        ctx.fillRect(x, y, width, height);

        // 绘制边框小方块
        MarkerExportPainter.drawRegionBorder(ctx, x, y, width, height, stroke, scale);

        // 绘制右下角序号标记
        MarkerExportPainter.drawCornerLabel(ctx, x + width, y + height, label, stroke, scale);
    }

    /**
     * 绘制区域边框小方块
     * 
     * ⚠️ 算法需与 RegionRenderer.createBorderBlocks() 保持一致
     * 
     * 算法：四角固定放 L 形缺角方块，中间根据剩余空间均匀填充
     */
    static drawRegionBorder(
        ctx: CanvasRenderingContext2D,
        x: number,
        y: number,
        width: number,
        height: number,
        color: string,
        scale: number
    ): void {
        const blockSize = BLOCK_SIZE * scale;
        const blockGap = BLOCK_GAP * scale;

        const hPositions = MarkerExportPainter.calcBlockPositions(width, blockSize, blockGap);
        const vPositions = MarkerExportPainter.calcBlockPositions(height, blockSize, blockGap);

        ctx.fillStyle = color;

        // 缺角尺寸
        const notchW = blockSize / 2;
        const notchH = blockSize / 2;

        // 四个角 - 缺角的 L 形
        MarkerExportPainter.drawCornerL(ctx, x, y, blockSize, notchW, notchH, "topLeft");
        MarkerExportPainter.drawCornerL(ctx, x + width, y, blockSize, notchW, notchH, "topRight");
        MarkerExportPainter.drawCornerL(ctx, x, y + height, blockSize, notchW, notchH, "bottomLeft");
        MarkerExportPainter.drawCornerL(ctx, x + width, y + height, blockSize, notchW, notchH, "bottomRight");

        // 上边和下边（跳过两端）
        for (let i = 1; i < hPositions.length - 1; i++) {
            ctx.fillRect(x + hPositions[i], y, blockSize, blockSize);
            ctx.fillRect(x + hPositions[i], y + height - blockSize, blockSize, blockSize);
        }

        // 左边和右边（跳过两端）
        for (let i = 1; i < vPositions.length - 1; i++) {
            ctx.fillRect(x, y + vPositions[i], blockSize, blockSize);
            ctx.fillRect(x + width - blockSize, y + vPositions[i], blockSize, blockSize);
        }
    }

    /**
     * 绘制右下角序号标记
     */
    static drawCornerLabel(
        ctx: CanvasRenderingContext2D,
        x: number,
        y: number,
        label: number,
        color: string,
        scale: number
    ): void {
        const radius = DEFAULT_POINT_STYLE.radius * scale;
        const fontSize = DEFAULT_POINT_STYLE.fontSize * scale;
        const strokeWidth = DEFAULT_POINT_STYLE.strokeWidth * scale;

        // 绘制圆形背景
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();

        // 绘制白色边框
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = strokeWidth;
        ctx.stroke();

        // 绘制序号
        ctx.fillStyle = "#ffffff";
        ctx.font = `bold ${fontSize}px Arial`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(label), x, y);
    }

    // ─── Private ─────────────────────────────────────────

    /** 计算一条边上的方块位置 */
    private static calcBlockPositions(length: number, size: number, gap: number): number[] {
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
    }

    /** 绘制 L 形缺角方块 */
    private static drawCornerL(
        ctx: CanvasRenderingContext2D,
        x: number,
        y: number,
        size: number,
        notchW: number,
        notchH: number,
        corner: "topLeft" | "topRight" | "bottomLeft" | "bottomRight"
    ): void {
        ctx.beginPath();

        switch (corner) {
            case "topLeft":
                // 缺右下角
                ctx.moveTo(x, y);
                ctx.lineTo(x + size, y);
                ctx.lineTo(x + size, y + notchH);
                ctx.lineTo(x + notchW, y + notchH);
                ctx.lineTo(x + notchW, y + size);
                ctx.lineTo(x, y + size);
                break;
            case "topRight":
                // 缺左下角
                ctx.moveTo(x - size, y);
                ctx.lineTo(x, y);
                ctx.lineTo(x, y + size);
                ctx.lineTo(x - notchW, y + size);
                ctx.lineTo(x - notchW, y + notchH);
                ctx.lineTo(x - size, y + notchH);
                break;
            case "bottomLeft":
                // 缺右上角
                ctx.moveTo(x, y - size);
                ctx.lineTo(x + notchW, y - size);
                ctx.lineTo(x + notchW, y - notchH);
                ctx.lineTo(x + size, y - notchH);
                ctx.lineTo(x + size, y);
                ctx.lineTo(x, y);
                break;
            case "bottomRight":
                // 缺左上角
                ctx.moveTo(x - notchW, y - size);
                ctx.lineTo(x, y - size);
                ctx.lineTo(x, y);
                ctx.lineTo(x - size, y);
                ctx.lineTo(x - size, y - notchH);
                ctx.lineTo(x - notchW, y - notchH);
                break;
        }

        ctx.closePath();
        ctx.fill();
    }
}
