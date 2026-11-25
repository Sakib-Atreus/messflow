// Fixed-cost categories (shared by server pages and the client form, so it must not live in a "use client" file).
export const COST_CATEGORIES = [
  "rent", "service", "electricity", "gas", "water", "internet", "cook", "cleaner", "extra", "personal", "previous_due", "other",
] as const;
export type CostCategory = (typeof COST_CATEGORIES)[number];

/** charges that usually belong to one person, so the form switches to "custom per member" */
export const PER_PERSON_CATEGORIES: readonly string[] = ["personal", "previous_due"];

export const isCostCategory = (c: string): c is CostCategory => (COST_CATEGORIES as readonly string[]).includes(c);
