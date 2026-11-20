// Balance numbers in one place, so the game's difficulty can be tuned without hunting through code.

/** Self-inflicted deaths (and begging to be killed) only happen below this health. */
export const DESPAIR_HEALTH = 35;

/** Damage from events (injuries, fear, grief) is multiplied by this. */
export const DAMAGE_SCALE = 1.25;

// End-of-night upkeep
/** Everyone loses this much each night from exposure and exhaustion (camping gear reduces it to 1). */
export const DAILY_WEAR = 3;
/** Fed, watered and unhurt tributes recover this much each night (+3 with camping gear). */
export const NIGHTLY_REGEN = 5;
/** Hunger starts to hurt after this many days without food... */
export const HUNGER_START = 2;
/** ...and costs this much per day beyond that (2 days: 6, 3 days: 12, 4 days: 18). */
export const HUNGER_DAMAGE = 6;
/** Thirst costs this much per day after the first (2 days: 12, 3 days: 24). */
export const THIRST_DAMAGE = 12;
export const INFECTION_DAMAGE = 12;
export const INJURY_DAMAGE = 4;
