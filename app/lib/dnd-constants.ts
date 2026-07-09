// Canonical hit dice for all 12 core SRD classes.
// Used as a fallback when the external SRD API is unavailable.
export const CLASS_HIT_DIE: Record<string, number> = {
  barbarian: 12,
  fighter:   10,
  paladin:   10,
  ranger:    10,
  bard:       8,
  cleric:     8,
  druid:      8,
  monk:       8,
  rogue:      8,
  warlock:    8,
  sorcerer:   6,
  wizard:     6,
  artificer:  8,
};

export function hitDieForClass(className: string): number | undefined {
  return CLASS_HIT_DIE[className.trim().toLowerCase()];
}
