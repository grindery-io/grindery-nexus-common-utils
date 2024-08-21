// From: https://stackoverflow.com/a/50375286/62076
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (k: infer I) => void ? I : never;
// If T is `any` a union of both side of the condition is returned.
type UnionForAny<T> = T extends never ? "A" : "B";
export type ForbidAny<T> = UnionToIntersection<UnionForAny<T>> extends never ? never : T;
