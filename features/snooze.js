// Shared helpers for the per-tenant module snooze / soft-deactivate feature.
// State for a (tenant, module) pair is stored in `moduleSnoozeItem` as
//   { [baseUrl]: { [moduleId]: { until: number | null } } }
// where until = epoch-ms (snoozed, auto-clears once passed) or null (soft-deactivated).

export const SNOOZE_DURATION_MS = 24 * 60 * 60 * 1000; // 1 day

// Returns a new map with expired snooze entries removed and empty tenants dropped.
export function pruneSnooze(map, now = Date.now()) {
  const out = {};
  for (const [baseUrl, mods] of Object.entries(map || {})) {
    const keep = {};
    for (const [id, entry] of Object.entries(mods || {})) {
      if (!entry) continue;
      if (entry.until == null || entry.until > now) keep[id] = entry;
    }
    if (Object.keys(keep).length) out[baseUrl] = keep;
  }
  return out;
}

// 'off' | 'snooze' | 'deactivate' for a single module entry.
export function snoozeState(entry, now = Date.now()) {
  if (!entry) return 'off';
  if (entry.until == null) return 'deactivate';
  return entry.until > now ? 'snooze' : 'off';
}

// Builds the stored entry for a target state (or null to clear → off).
export function snoozeEntryFor(state, now = Date.now()) {
  if (state === 'snooze') return { until: now + SNOOZE_DURATION_MS };
  if (state === 'deactivate') return { until: null };
  return null;
}
