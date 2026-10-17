"use client";

import { Direction } from "radix-ui";

/** Radix portals/controls need their own direction in addition to html[dir]. */
export function DirectionProvider({ children }: { children: React.ReactNode }) {
  return <Direction.Provider dir="rtl">{children}</Direction.Provider>;
}
