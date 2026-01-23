import type { Canvas, FabricObject } from "fabric";

/** 包围盒 */
export interface BoundingBox {
    left: number;
    top: number;
    width: number;
    height: number;
}

/** 动画配置 */
export interface AnimationOptions {
    duration: number;
    easing: (t: number) => number;
}

/** 常用缓动函数 */
export const Easing = {
    /** 先慢后快 */
    easeInCubic: (t: number) => t * t * t,
    /** 先快后慢 */
    easeOutCubic: (t: number) => 1 - Math.pow(1 - t, 3),
    /** 先慢后快再慢 */
    easeInOutCubic: (t: number) =>
        t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
    /** 线性 */
    linear: (t: number) => t,
};

/**
 * 计算所有对象的包围盒（场景坐标）
 * 
 * 使用 getCoords() 获取对象四个角的场景坐标，
 * 这样计算出的边界不受 viewportTransform 影响。
 */
export function calculateBounds(objects: FabricObject[]): BoundingBox | null {
    if (objects.length === 0) return null;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    objects.forEach((obj) => {
        // getCoords() 返回四个角的场景坐标（不受 viewportTransform 影响）
        const coords = obj.getCoords();
        for (const pt of coords) {
            if (pt.x < minX) minX = pt.x;
            if (pt.x > maxX) maxX = pt.x;
            if (pt.y < minY) minY = pt.y;
            if (pt.y > maxY) maxY = pt.y;
        }
    });

    return {
        left: minX,
        top: minY,
        width: maxX - minX,
        height: maxY - minY,
    };
}

/**
 * 执行带缓动的动画
 */
export function animate(
    from: number,
    to: number,
    options: AnimationOptions,
    onUpdate: (value: number) => void,
    onComplete?: () => void
): void {
    const startTime = performance.now();

    const tick = (currentTime: number) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / options.duration, 1);
        const easedProgress = options.easing(progress);
        const currentValue = from + (to - from) * easedProgress;

        onUpdate(currentValue);

        if (progress < 1) {
            requestAnimationFrame(tick);
        } else {
            onComplete?.();
        }
    };

    requestAnimationFrame(tick);
}

/**
 * 执行多值动画（同时动画多个属性）
 */
export function animateMultiple<T extends Record<string, number>>(
    from: T,
    to: T,
    options: AnimationOptions,
    onUpdate: (values: T) => void,
    onComplete?: () => void
): void {
    const startTime = performance.now();
    const keys = Object.keys(from) as (keyof T)[];

    const tick = (currentTime: number) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / options.duration, 1);
        const easedProgress = options.easing(progress);

        const current = {} as T;
        for (const key of keys) {
            current[key] = (from[key] + (to[key] - from[key]) * easedProgress) as T[keyof T];
        }

        onUpdate(current);

        if (progress < 1) {
            requestAnimationFrame(tick);
        } else {
            onComplete?.();
        }
    };

    requestAnimationFrame(tick);
}
