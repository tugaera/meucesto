const palette = ["#047857", "#c2413b", "#2563eb", "#7c3aed", "#b45309", "#0e7490", "#be185d", "#4d7c0f", "#6b7280", "#9f1239"] as const;
const assignments = new Map<string, string>();

export function colorForUser(userId: string): string {
  const assigned = assignments.get(userId);
  if (assigned) return assigned;
  const color = palette[assignments.size % palette.length] ?? palette[0];
  assignments.set(userId, color);
  return color;
}

export function clearUserColors(): void {
  assignments.clear();
}
