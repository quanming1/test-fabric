import React, { CSSProperties, useLayoutEffect, useMemo, useCallback, useState } from "react";
import cx from "classnames";
import styles from "./index.module.scss";

export type RelativePoint = { x: number; y: number };

export interface ZoomOnPointImageProps {
  src: string; // 图片地址
  point: RelativePoint; // 相对坐标 (0~1)，例如来自 uv(u,v)
  start: boolean; // start=true 触发放大；start=false 回到原图（都有动画）

  width?: number | string; // 容器宽度（可选；不指定则使用图片原始宽度）
  height?: number | string; // 容器高度（可选；不指定则按图片宽高比自动计算）

  zoom?: number; // 放大倍数
  durationMs?: number; // 动画时长(ms)
  easing?: string; // CSS easing
  delayMs?: number; // start=true 后延迟多少 ms 才开始放大
  animateInitial?: boolean; // start 初始为 true 时，是否也要播放一次动画

  className?: string;
  style?: CSSProperties;
  imgClassName?: string;
  imgStyle?: CSSProperties;
  alt?: string;
  onLoad?: React.ReactEventHandler<HTMLImageElement>;
  onError?: React.ReactEventHandler<HTMLImageElement>;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

function toCssSize(v?: number | string) {
  if (v === undefined) return undefined;
  return typeof v === "number" ? `${v}px` : v;
}

type ContainerSize = { width?: number | string; height?: number | string; ratio?: number };

function computeContainerSize(
  imgW: number,
  imgH: number,
  width?: number | string,
  height?: number | string,
): ContainerSize {
  if (imgW <= 0 || imgH <= 0) return { width, height };

  const ratio = imgW / imgH;
  const isPercent = (v: unknown): v is string => typeof v === "string" && v.trim().endsWith("%");

  if (width !== undefined) {
    if (isPercent(width)) return { width, height: undefined, ratio };

    const wNum = typeof width === "number" ? width : parseFloat(width) || imgW;
    return { width: wNum, height: wNum / ratio, ratio };
  }

  if (height !== undefined) {
    if (isPercent(height)) return { width: undefined, height, ratio };

    const hNum = typeof height === "number" ? height : parseFloat(height) || imgH;
    return { width: hNum * ratio, height: hNum, ratio };
  }

  return { width: imgW, height: imgH, ratio };
}

export default function ZoomOnPointImage(props: ZoomOnPointImageProps) {
  const {
    src,
    point,
    start,
    width,
    height,
    zoom = 2,
    durationMs = 600,
    easing = "cubic-bezier(0.22, 1, 0.36, 1)", // easeOutCubic-ish
    delayMs = 0,
    animateInitial = true,
    className,
    style,
    imgClassName,
    imgStyle,
    alt = "",
    onLoad,
    onError,
  } = props;

  const [mounted, setMounted] = useState(!animateInitial);
  const [imgSize, setImgSize] = useState({ width: 0, height: 0 });
  const [delayedStart, setDelayedStart] = useState(() => (start && delayMs <= 0 ? true : false));

  useLayoutEffect(() => {
    if (!animateInitial) return;
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, [animateInitial]);

  useLayoutEffect(() => {
    if (!start) {
      setDelayedStart(false);
      return;
    }
    if (delayMs <= 0) {
      setDelayedStart(true);
      return;
    }
    setDelayedStart(false);
    const id = window.setTimeout(() => setDelayedStart(true), delayMs);
    return () => window.clearTimeout(id);
  }, [start, delayMs]);

  const handleImgLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      const img = e.currentTarget;
      setImgSize({ width: img.naturalWidth, height: img.naturalHeight });
      onLoad?.(e);
    },
    [onLoad],
  );

  const p = { x: clamp01(point.x), y: clamp01(point.y) };

  const containerSize: ContainerSize = useMemo(
    () => computeContainerSize(imgSize.width, imgSize.height, width, height),
    [imgSize.width, imgSize.height, width, height],
  );

  const transformOrigin = `${p.x * 100}% ${p.y * 100}%`; // transform-origin 必须始终固定，否则回缩会跳
  const transform = mounted && delayedStart ? `scale(${zoom})` : "scale(1)"; // start=true 后按 delayMs 延迟生效

  const wrapStyle: CSSProperties = {
    ...style,
    width: toCssSize(containerSize.width),
    height: toCssSize(containerSize.height),
    aspectRatio: containerSize.ratio ?? undefined, // width/height 为百分比时，用 aspect-ratio 保证外层形状=图片形状（无黑边）
    maxWidth: "100%",
    overflow: "hidden", // 强制裁剪，防止放大时溢出
  };

  const imageStyle: CSSProperties = {
    transform,
    transformOrigin,
    transition: `transform ${durationMs}ms ${easing}`,
    ...imgStyle,
  };

  return (
    <div className={cx(styles.root, className)} style={wrapStyle}>
      <img
        className={cx(styles.img, imgClassName)}
        style={imageStyle}
        src={src}
        alt={alt}
        draggable={false}
        onLoad={handleImgLoad}
        onError={onError}
      />
    </div>
  );
}
