import type { Element } from "../element";
import {
  FollowBehavior,
  type FollowBinding,
  FOLLOW_BINDING_KEY,
  type FollowOptions,
} from "../behaviors/follow";

/**
 * 一行代码把“跟随关系”绑起来（业务无关的配方）。
 */
export function bindFollow(
  follower: Element,
  owner: Element,
  localX: number,
  localY: number,
  opts?: Omit<FollowOptions, "bindingKey"> & { bindingKey?: string },
) {
  const bindingKey = opts?.bindingKey ?? FOLLOW_BINDING_KEY;
  const binding: FollowBinding = { ownerId: owner.id, localX, localY };
  FollowBehavior.setBinding(follower, binding, bindingKey);

  // 若已有 FollowBehavior，就复用；否则挂一个新的
  const existing = follower.getBehaviors().find((b) => b instanceof FollowBehavior) as
    | FollowBehavior
    | undefined;
  const fb = existing ?? new FollowBehavior({ ...opts, bindingKey });
  if (!existing) follower.addBehavior(fb);

  fb.update(follower, owner);
  return fb;
}
