import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Resolve conditional classes and Tailwind conflicts for shadcn primitives. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
