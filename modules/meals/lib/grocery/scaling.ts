export function scaleIngredient(
  quantity: number | null,
  fromServings: number,
  toServings: number,
): number | null {
  if (quantity === null) {
    return null;
  }

  if (fromServings <= 0 || toServings <= 0) {
    return null;
  }

  if (fromServings === toServings) {
    return quantity;
  }

  const scaled = (quantity * toServings) / fromServings;
  return Math.round(scaled * 1000) / 1000;
}
