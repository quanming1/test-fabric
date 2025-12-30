import { Point, util } from "fabric";
import type { Canvas, FabricObject } from "fabric";
import type { PersistMeta } from "../types";
import { ensureId } from "../utils/id";

export type FollowMode = "localPoint";

export type FollowBinding = {
  owner: FabricObject;
  follower: FabricObject;
  mode: FollowMode;
  local: Point;
};

function sceneToLocal(owner: FabricObject, scene: Point) {
  const m = owner.calcTransformMatrix();
  const inv = util.invertTransform(m as any);
  const p = util.transformPoint(scene, inv);
  return new Point(p.x, p.y);
}

function localToScene(owner: FabricObject, local: Point) {
  const m = owner.calcTransformMatrix();
  const p = util.transformPoint(local, m);
  return new Point(p.x, p.y);
}

export type FollowerManager = {
  /**
   * 把 follower 绑定在 owner 上：以 owner 的 local 坐标作为锚点。
   * owner 发生任意变换（含 activeSelection 多选变形）时，follower 自动跟随到对应 scene 坐标。
   */
  bindLocalPoint: (owner: FabricObject, follower: FabricObject, localPoint: Point) => void;
  /**
   * 便捷：用 scenePoint 计算 localPoint 后再绑定
   */
  bindScenePointAsLocal: (owner: FabricObject, follower: FabricObject, scenePoint: Point) => void;
  /**
   * 清理：解除某个 owner 的所有绑定（并可选择是否同时从 canvas 移除 followers）
   */
  unbindOwner: (owner: FabricObject, opts?: { removeFollowersFromCanvas?: boolean }) => void;
  /**
   * 释放 manager
   */
  dispose: () => void;
};

/**
 * 一个“跟随关系”管理器（更像 behavior/manager，而非 class）。
 * - 不把状态塞到 FabricObject 上（用 WeakMap/Set 管理）
 * - 用 before:render 做兜底，保证 activeSelection 多选变形时也能跟随
 */
export function createFollowerManager(canvas: Canvas): FollowerManager {
  const ownerToFollowers = new Map<FabricObject, Set<FollowBinding>>();
  const followerToOwner = new WeakMap<FabricObject, FabricObject>();
  let inSync = false;

  const syncOwner = (owner: FabricObject) => {
    const bindings = ownerToFollowers.get(owner);
    if (!bindings?.size) return;
    bindings.forEach((b) => {
      if (b.mode === "localPoint") {
        const p = localToScene(owner, b.local);
        b.follower.set({ left: p.x, top: p.y });
        b.follower.setCoords();
      }
    });
  };

  const syncAll = () => {
    ownerToFollowers.forEach((_, owner) => syncOwner(owner));
  };

  const bindLocalPoint = (owner: FabricObject, follower: FabricObject, localPoint: Point) => {
    // 保证可持久化：owner/follower 都有稳定 id
    const ownerId = ensureId(owner);
    ensureId(follower);

    // 写入可序列化元数据：反序列化后可重建绑定
    const meta = follower as any as PersistMeta;
    meta.__follow = { ownerId, mode: "localPoint", local: { x: localPoint.x, y: localPoint.y } };

    // 一个 follower 只允许绑定一个 owner（避免复杂关系）
    const prevOwner = followerToOwner.get(follower);
    if (prevOwner && prevOwner !== owner) {
      // 从旧 owner 上解绑
      const set = ownerToFollowers.get(prevOwner);
      if (set) {
        [...set].forEach((b) => {
          if (b.follower === follower) set.delete(b);
        });
        if (!set.size) ownerToFollowers.delete(prevOwner);
      }
    }

    followerToOwner.set(follower, owner);
    const binding: FollowBinding = { owner, follower, mode: "localPoint", local: localPoint };
    if (!ownerToFollowers.has(owner)) ownerToFollowers.set(owner, new Set());
    ownerToFollowers.get(owner)!.add(binding);
    // 绑定时立刻同步一次
    syncOwner(owner);
  };

  const bindScenePointAsLocal = (
    owner: FabricObject,
    follower: FabricObject,
    scenePoint: Point,
  ) => {
    bindLocalPoint(owner, follower, sceneToLocal(owner, scenePoint));
  };

  const unbindOwner = (owner: FabricObject, opts?: { removeFollowersFromCanvas?: boolean }) => {
    const bindings = ownerToFollowers.get(owner);
    if (!bindings?.size) return;
    if (opts?.removeFollowersFromCanvas) {
      bindings.forEach((b) => canvas.remove(b.follower));
    }
    bindings.forEach((b) => followerToOwner.delete(b.follower));
    ownerToFollowers.delete(owner);
  };

  const onBeforeRender = () => {
    if (inSync) return;
    if (!ownerToFollowers.size) return;
    inSync = true;
    try {
      syncAll();
    } finally {
      inSync = false;
    }
  };

  const onObjectRemoved = (opt: any) => {
    const o = opt?.target as FabricObject | undefined;
    if (!o) return;
    // owner 被删：清理它的 followers
    if (ownerToFollowers.has(o)) {
      unbindOwner(o, { removeFollowersFromCanvas: true });
      canvas.requestRenderAll();
    }
  };

  canvas.on("before:render", onBeforeRender);
  canvas.on("object:removed", onObjectRemoved);

  return {
    bindLocalPoint,
    bindScenePointAsLocal,
    unbindOwner,
    dispose: () => {
      canvas.off("before:render", onBeforeRender);
      canvas.off("object:removed", onObjectRemoved);
      ownerToFollowers.clear();
    },
  };
}
