import { Point, util } from "fabric";
import type { FabricObject } from "fabric";

export type TransformBasics = {
  matrix: number[];
  scaleX: number;
  scaleY: number;
  angle: number;
};

/**
 * object(local) -> scene plane 的基础变换信息
 */
export function calcSceneTransformBasics(owner: FabricObject): TransformBasics {
  const m = owner.calcTransformMatrix(); // object -> scene
  const scaleX = Math.hypot(m[0], m[1]);
  const scaleY = Math.hypot(m[2], m[3]);
  const angle = (Math.atan2(m[1], m[0]) * 180) / Math.PI;
  return { matrix: m, scaleX, scaleY, angle };
}

export function localToScenePoint(owner: FabricObject, localX: number, localY: number) {
  const m = owner.calcTransformMatrix();
  return util.transformPoint(new Point(localX, localY), m);
}

export function sceneToLocalPoint(owner: FabricObject, sceneX: number, sceneY: number) {
  const inv = util.invertTransform(owner.calcTransformMatrix());
  return util.transformPoint(new Point(sceneX, sceneY), inv);
}
