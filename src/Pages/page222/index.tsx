/**
 * Fabric.js 视频播放实现 - 核心要点总结
 *
 * 【实现原理】
 * 1. 用 fabric.FabricImage(videoElement) 把 video 元素包装成 fabric 对象
 * 2. fabric 会把视频当前帧作为图像渲染到 canvas 上
 * 3. 通过 requestAnimationFrame 循环调用 renderAll 实现视频播放效果
 *
 * 【关键坑点】
 * 1. 尺寸问题：创建 FabricImage 之前，必须把 video 元素的 width/height 属性
 *    设置为视频的实际尺寸 videoWidth/videoHeight，否则画面会被裁切
 *
 * 2. React DOM 冲突：fabric.Canvas 会修改 DOM 结构（在 canvas 外包一层），
 *    会和 React 虚拟 DOM 冲突导致 insertBefore 报错。
 *    解决方案：用空 div 容器，动态创建 canvas 元素插入
 *
 * 3. fabric v7 导入方式：import * as fabric from "fabric"
 *    不是 import { fabric } from "fabric"
 *
 * 4. fabric v7 类名变化：fabric.Image -> fabric.FabricImage
 *
 * 【性能优化】
 * 1. objectCaching: false - 关闭视频对象缓存，确保每帧重绘时读取最新画面
 * 2. 只在播放时启动渲染循环，暂停时停止 requestAnimationFrame
 * 3. 用 requestRenderAll 替代 renderAll，会合并同一帧内的多次渲染请求
 *
 * 【局限性】
 * fabric 的设计是整个画布统一渲染，没有局部更新 API。
 * 如需极致性能，可考虑视频单独用 canvas 渲染叠在 fabric canvas 上，但会失去交互能力。
 */

import React, { useRef, useEffect, useState } from "react";
import * as fabric from "fabric";
import styles from "./index.module.scss";

const Page222: React.FC = () => {
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fabricCanvasRef = useRef<fabric.Canvas | null>(null);
  const fabricVideoRef = useRef<fabric.FabricImage | null>(null);
  const [videoUrl, setVideoUrl] = useState<string>("");
  const [isPlaying, setIsPlaying] = useState(false);
  const animationIdRef = useRef<number | null>(null);

  // 初始化 fabric canvas
  // 注意：动态创建 canvas 元素，避免 React DOM 冲突
  useEffect(() => {
    if (canvasContainerRef.current && !fabricCanvasRef.current) {
      const canvasEl = document.createElement("canvas");
      canvasEl.width = 800;
      canvasEl.height = 600;
      canvasContainerRef.current.appendChild(canvasEl);

      fabricCanvasRef.current = new fabric.Canvas(canvasEl, {
        width: 800,
        height: 600,
        backgroundColor: "#1a1a2e",
      });
    }

    return () => {
      fabricCanvasRef.current?.dispose();
      fabricCanvasRef.current = null;
    };
  }, []);

  // 视频加载后添加到画布
  useEffect(() => {
    if (!videoUrl || !videoRef.current || !fabricCanvasRef.current) return;

    const video = videoRef.current;
    const canvas = fabricCanvasRef.current;

    const handleLoadedData = () => {
      canvas.clear();
      canvas.backgroundColor = "#1a1a2e";

      // 【关键】获取视频实际尺寸，并设置到 video 元素上
      // 不这样做的话，fabric 读取的尺寸会不对，导致画面被裁切
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      video.width = vw;
      video.height = vh;

      const fabricVideo = new fabric.FabricImage(video, {
        left: 50,
        top: 50,
        objectCaching: false, // 【性能】关闭缓存，确保每帧都重新绘制视频画面
      });

      // 缩放适应画布
      const scale = Math.min(700 / vw, 500 / vh);
      fabricVideo.scaleX = scale;
      fabricVideo.scaleY = scale;

      fabricVideoRef.current = fabricVideo;
      canvas.add(fabricVideo);
      canvas.renderAll();
    };

    video.addEventListener("loadeddata", handleLoadedData);

    return () => {
      video.removeEventListener("loadeddata", handleLoadedData);
    };
  }, [videoUrl]);

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setVideoUrl(url);
      setIsPlaying(false);
    }
  };

  // 【性能】只在播放时启动渲染循环
  const startRenderLoop = () => {
    if (animationIdRef.current) return;

    const render = () => {
      fabricCanvasRef.current?.requestRenderAll();
      animationIdRef.current = requestAnimationFrame(render);
    };
    animationIdRef.current = requestAnimationFrame(render);
  };

  // 【性能】暂停时停止渲染循环，节省 CPU
  const stopRenderLoop = () => {
    if (animationIdRef.current) {
      cancelAnimationFrame(animationIdRef.current);
      animationIdRef.current = null;
    }
  };

  const togglePlay = () => {
    if (!videoRef.current) return;

    if (isPlaying) {
      videoRef.current.pause();
      stopRenderLoop();
    } else {
      videoRef.current.play();
      startRenderLoop();
    }
    setIsPlaying(!isPlaying);
  };

  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        <label className={styles.uploadBtn}>
          上传视频
          <input type="file" accept="video/*" onChange={handleUpload} hidden />
        </label>
        {videoUrl && (
          <button className={styles.playBtn} onClick={togglePlay}>
            {isPlaying ? "暂停" : "播放"}
          </button>
        )}
      </div>

      {/* video 元素：隐藏但必须存在，作为 fabric 的图像源 */}
      {videoUrl && (
        <video
          ref={videoRef}
          src={videoUrl}
          width={480}
          height={360}
          style={{ display: "none" }}
          loop
          muted
          crossOrigin="anonymous"
        />
      )}

      {/* fabric canvas 容器 */}
      <div ref={canvasContainerRef} />
    </div>
  );
};

export default Page222;
