// Lifted from LocalMode-AI/LocalMode @ 3ef8bc4 — apps/ui/registry/localmode/lib/utils.ts (MIT, Copyright (c) 2025 LocalMode).
// Changes: none besides this header.
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merges Tailwind CSS classes with proper precedence. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
