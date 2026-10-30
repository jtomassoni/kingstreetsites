/**
 * Packaging / reusable ware that recipes and snack-prep sometimes list.
 * Strip these from *generated* grocery lists; users may still add them manually
 * (trash bags, tupperware, etc.).
 */
export function isExcludedFromGeneratedGrocery(name: string): boolean {
  const n = name.trim().toLowerCase();
  if (!n) return false;
  return (
    /\b(portion\s+)?containers?\b/.test(n) ||
    /\b(tupperware|meal[\s-]*prep\s*containers?|food\s*storage\s*containers?|plastic\s*containers?)\b/.test(
      n,
    ) ||
    /\b(storage\s*ware|food\s*storage)\b/.test(n)
  );
}
