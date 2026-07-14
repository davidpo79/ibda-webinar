// Core-series lessons (1-9, matching core_single's core_single_lesson_indexes)
// that are free despite the core_single package otherwise being paid —
// currently just lesson 8, "פינוי מושכר". Single source of truth shared
// between the landing page (pricing/display) and the payment-creation
// server functions (so a free lesson is never actually charged), so the
// two can't drift apart.
export const FREE_CORE_LESSON_INDEXES: ReadonlySet<number> = new Set([8]);

export function isFreeCoreLesson(index: number): boolean {
  return FREE_CORE_LESSON_INDEXES.has(index);
}
