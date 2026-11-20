// Pacing: decides how many deaths each phase should aim for so games end in the chosen
// number of days (7-10 by default). The targets adapt as the game goes: if a phase kills
// more or fewer than planned, later phases make up the difference.

export const LENGTH_PRESETS = {
  short: { label: 'Short (4–6 days)', min: 4, max: 6 },
  standard: { label: 'Standard (7–10 days)', min: 7, max: 10 },
  long: { label: 'Long (11–14 days)', min: 11, max: 14 },
};

/** Called when a new day begins (before its Feast or Day phase). */
export function startDay(G, day) {
  const s = G.state;
  const alive = G.aliveCount;
  const L = s.targetDays;
  const daysLeft = Math.max(1, L - day + 1);
  s.day = day;
  s.dayQuota = day >= L ? alive - 1 : (alive - 1) / daysLeft;
  s.deathsToday = 0;
  const freq = { off: 0, normal: 0.3, often: 0.55 }[s.settings.arenaFrequency] ?? 0.3;
  s.arenaToday = day >= 2 && !s.arenaYesterday && G.events.arena.length > 0 && G.rng.chance(freq);
  s.arenaYesterday = s.arenaToday;
}

/** Expected deaths for a phase, then rounded randomly to a whole number. */
export function phaseTarget(G, kind, participants, opts = {}) {
  const s = G.state;
  const alive = G.aliveCount;
  let expected;
  if (kind === 'bloodbath') {
    expected = alive * s.bloodbathRate;
  } else {
    const remaining = Math.max(0, s.dayQuota - s.deathsToday);
    const finalDay = s.day >= s.targetDays;
    const share = {
      feast: 0.3,
      day: s.arenaToday ? 0.45 : 0.6,
      arena: 0.5,
      night: 1,
    }[kind] ?? 0.5;
    expected = finalDay && kind === 'night' ? remaining : remaining * share;
    // Gamemaker-triggered disasters and feasts always claim at least some lives when the field is big.
    if ((kind === 'arena' || kind === 'feast') && expected < 1 && alive > 4) expected = Math.min(1.5, alive * 0.1);
    // Disasters the host triggers are always dangerous, whatever the day's plan says.
    if (opts.gamemaker) expected = Math.max(expected, 1, alive * 0.15);
  }
  expected = Math.min(expected, alive - 1, participants);
  if (expected <= 0) return 0;
  let t = Math.floor(expected);
  if (G.rng.chance(expected - t)) t += 1;
  if (t > 0 && G.rng.chance(0.12)) t += G.rng.chance(0.5) ? 1 : -1;
  return Math.max(0, Math.min(t, alive - 1, participants));
}
