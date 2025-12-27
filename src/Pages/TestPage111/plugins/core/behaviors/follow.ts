import type { FabricObject } from "fabric";
import type { Behavior } from "../behavior";
import type { Element } from "../element";
import { Bag } from "../bag";
import { calcSceneTransformBasics, localToScenePoint } from "../fabric/transform";
import { syncFollowersZOrder } from "../fabric/zOrder";

export const FOLLOW_BINDING_KEY = "__followBinding";

export type FollowBinding = {
  ownerId: string; // owner Element.id
  localX: number;
  localY: number;
};

export type FollowOptions = {
  /**
   * 把 follower 的哪个点贴到 owner 的 local 点上
   */
  originX?: FabricObject["originX"];
  originY?: FabricObject["originY"];
  inheritAngle?: boolean;

  /**
   * 返回一个“相对 owner scale 的倍率”，用于做反比缩放、限幅等
   */
  scalePolicy?: (canvasZoom: number) => number;
  extraScale?: number;

  /**
   * 可选：自动保持 follower 紧贴 owner 的上方/下方
   */
  zOrder?: {
    place?: "above" | "below";
    sortKey?: (el: Element) => number;
  };

  /**
   * binding 存放位置（默认写到 follower.obj[__followBinding]）
   */
  bindingKey?: string;
};

/**
 * FollowBehavior：让任意元素跟随另一个元素（owner）
 * - binding 使用 owner 的 local plane 坐标（localX/localY）
 * - 在 owner 变换 / canvas zoom 变化时自动重算 follower 的场景变换
 */
export class FollowBehavior implements Behavior {
  id = "follow";
  private opts: FollowOptions;

  constructor(opts?: FollowOptions) {
    this.opts = opts ?? {};
  }

  static getBinding(el: Element, bindingKey = FOLLOW_BINDING_KEY): FollowBinding | undefined {
    return Bag.get<FollowBinding>(el.obj, bindingKey);
  }

  static setBinding(el: Element, binding: FollowBinding, bindingKey = FOLLOW_BINDING_KEY) {
    Bag.set(el.obj, bindingKey, binding);
  }

  onAttach(el: Element) {
    const scene = el.scene;
    if (!scene) return;
    const key = this.opts.bindingKey ?? FOLLOW_BINDING_KEY;
    const b = FollowBehavior.getBinding(el, key);
    if (!b) return;
    scene._registerFollower(b.ownerId, el);
    this.update(el);
  }

  onDetach(el: Element) {
    const scene = el.scene;
    if (!scene) return;
    const key = this.opts.bindingKey ?? FOLLOW_BINDING_KEY;
    const b = FollowBehavior.getBinding(el, key);
    if (!b) return;
    scene._unregisterFollower(b.ownerId, el);
  }

  onOwnerTransformed(el: Element, owner: Element) {
    const key = this.opts.bindingKey ?? FOLLOW_BINDING_KEY;
    const b = FollowBehavior.getBinding(el, key);
    if (!b) return;
    if (owner.id !== b.ownerId) return;
    this.update(el, owner);
  }

  onZoomChanged(el: Element) {
    this.update(el);
  }

  /**
   * 主动刷新（例如：你刚刚 setBinding 之后）
   */
  update(el: Element, ownerMaybe?: Element | null) {
    const scene = el.scene;
    if (!scene) return;
    const key = this.opts.bindingKey ?? FOLLOW_BINDING_KEY;
    const b = FollowBehavior.getBinding(el, key);
    if (!b) return;

    const owner = ownerMaybe ?? scene.findById(b.ownerId);
    if (!owner) return;

    const { scaleX, scaleY, angle } = calcSceneTransformBasics(owner.obj);
    const scenePt = localToScenePoint(owner.obj, b.localX, b.localY);

    const z = Math.max(0.001, scene.getZoom() || 1);
    const base = this.opts.scalePolicy ? this.opts.scalePolicy(z) : 1;
    const extra = this.opts.extraScale ?? 1;
    const mul = base * extra;

    const patch: any = {
      left: scenePt.x,
      top: scenePt.y,
      scaleX: scaleX * mul,
      scaleY: scaleY * mul,
    };
    if (this.opts.originX != null) patch.originX = this.opts.originX;
    if (this.opts.originY != null) patch.originY = this.opts.originY;
    if (this.opts.inheritAngle !== false) patch.angle = angle;

    el.obj.set(patch);
    el.obj.setCoords();

    if (this.opts.zOrder) {
      const followers = scene._getFollowers(owner.id);
      syncFollowersZOrder(
        scene.ctx,
        owner.obj,
        followers.map((x) => x.obj),
        {
          place: this.opts.zOrder.place ?? "above",
          sortKey: (obj) => {
            const el2 = scene.findByObject(obj);
            return el2 ? this.opts.zOrder!.sortKey?.(el2) ?? 0 : 0;
          },
        },
      );
    }
  }
}
