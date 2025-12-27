export type MarkPoint = {
  ownerId: string;
  index: number;
  localX: number;
  localY: number;
  u: number;
  v: number;
};

export type MarkerMeta = {
  kind: "marker";
  id: string;
  ownerId: string;
  index: number;
};

export type MarkerBinding = {
  ownerId: string;
  // point in owner(local/object) plane; with owner origin at its origin (we default image origin to center)
  localX: number;
  localY: number;
};
