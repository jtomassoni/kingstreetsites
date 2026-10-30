export const MEAL_TYPES = [
  { value: "breakfast", label: "Breakfast" },
  { value: "lunch", label: "Lunch" },
  { value: "dinner", label: "Dinner" },
  { value: "snack_prep", label: "Snacks" },
  { value: "other", label: "Other" },
] as const;

export const PLAN_STATUSES = [
  { value: "draft", label: "Draft" },
  { value: "approved", label: "Approved" },
  { value: "grocery_generated", label: "Grocery list ready" },
  { value: "completed", label: "Completed" },
  { value: "archived", label: "Archived" },
] as const;

export const DAY_PROFILES = [
  { value: "normal", label: "Normal" },
  { value: "workday", label: "Workday" },
  { value: "long_day", label: "Long day" },
  { value: "quick_cook", label: "Quick-cook" },
  { value: "reheat_only", label: "Reheat only" },
  { value: "eating_out", label: "Eating out" },
  { value: "custom", label: "Custom" },
] as const;

export const SOURCE_TYPES = [
  { value: "household", label: "Household" },
  { value: "family", label: "Family" },
  { value: "ai", label: "AI generated" },
  { value: "imported", label: "Imported" },
  { value: "transcribed", label: "Transcribed" },
] as const;

export const DIFFICULTIES = [
  { value: "easy", label: "Easy" },
  { value: "medium", label: "Medium" },
  { value: "hard", label: "Hard" },
] as const;

export const WOULD_MAKE_AGAIN = [
  { value: "yes", label: "Yes" },
  { value: "maybe", label: "Maybe" },
  { value: "no", label: "No" },
] as const;

export const ASSIGNMENT_OPTIONS = [
  { value: "both", label: "Both" },
  { value: "specific", label: "One person" },
] as const;
