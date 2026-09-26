import { z } from "zod";

/** Hard ceiling for any list (CLAUDE.md: max 50 per page). */
export const MAX_PAGE_SIZE = 50;

export type PageRequest = { page: number; pageSize: number };
export type Page<T> = { items: T[]; page: number; hasMore: boolean };

const pageNumber = z.coerce.number().int().min(1).max(10_000).catch(1);

/** Reads `?page=` leniently: anything invalid falls back to page 1. */
export function parsePage(value: unknown, pageSize = 20): PageRequest {
  const raw = Array.isArray(value) ? value[0] : value;
  return { page: pageNumber.parse(raw ?? 1), pageSize: Math.min(pageSize, MAX_PAGE_SIZE) };
}

/** Limit/offset for a query that fetches one extra row to learn whether a next page exists. */
export function pageWindow({ page, pageSize }: PageRequest) {
  return { limit: pageSize + 1, offset: (page - 1) * pageSize };
}

export function toPage<T>(rows: T[], { page, pageSize }: PageRequest): Page<T> {
  return { items: rows.slice(0, pageSize), page, hasMore: rows.length > pageSize };
}
