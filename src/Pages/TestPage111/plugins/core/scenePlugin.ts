import type { FabricPlugin, FabricPluginContext } from "./types";
import { Scene, type SceneOptions } from "./scene";

export const CANVAS_SCENE_KEY = "__fxScene";

export function getSceneFromCanvas(canvas: any): Scene | null {
  return (canvas as any)?.[CANVAS_SCENE_KEY] ?? null;
}

/**
 * 把 Scene 作为一个“基础插件”挂进现有 plugins 体系里。
 * 其他插件如果想复用框架层能力，可以通过 getSceneFromCanvas(ctx.canvas) 拿到 Scene。
 */
export function createScenePlugin(opts?: SceneOptions): FabricPlugin {
  return {
    id: "fx-scene",
    init: (ctx: FabricPluginContext) => {
      const scene = new Scene(ctx, opts);
      (ctx.canvas as any)[CANVAS_SCENE_KEY] = scene;
      return () => {
        scene.dispose();
        delete (ctx.canvas as any)[CANVAS_SCENE_KEY];
      };
    },
  };
}


