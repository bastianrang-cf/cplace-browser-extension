import { storage } from '#imports';

export const enabledModulesItem = storage.defineItem('local:enabledModules', { fallback: {} });
export const moduleOptionsItem = storage.defineItem('local:moduleOptions', { fallback: {} });
// User-configured keyboard shortcuts for module commands, keyed by module then
// command id. Commands are either an action id (non-snoozable modules) or the
// reserved 'snooze' id (snoozable modules). Combos are stored in the logical,
// platform-independent form produced by features/shortcuts.js:
//   { [moduleId]: { [commandId]: { mod, alt, shift, code } } }
export const moduleShortcutsItem = storage.defineItem('local:moduleShortcuts', { fallback: {} });
// Per-tenant snooze / soft-deactivate of snoozable modules, keyed by context.baseUrl.
//   { [baseUrl]: { [moduleId]: { until: number | null } } }
//   until = epoch-ms → snoozed (auto-clears once passed); until = null → soft-deactivated
//   (manual only); module key absent → off (active).
export const moduleSnoozeItem = storage.defineItem('local:moduleSnooze', { fallback: {} });
export const batchJobsCacheItem = storage.defineItem('local:batchJobsCache', { fallback: {} });
export const lowCodeLogsCacheItem = storage.defineItem('local:lowCodeLogsCache', { fallback: {} });
export const lowCodeLogsSeenItem = storage.defineItem('local:lowCodeLogsSeen', { fallback: {} });
export const lowCodeLogsFiltersItem = storage.defineItem('local:lowCodeLogsFilters', { fallback: {} });
export const domainCssByTabItem = storage.defineItem('session:domainCssByTab', { fallback: {} });
// Detected cplace baseUrl per tab id, written by the background on cplace:context and read
// by the popup. Kept in session storage (not the popup URL) so the value never flows from
// location.search into a navigation target. { [tabId]: baseUrl }
export const tabBaseUrlItem = storage.defineItem('session:tabBaseUrl', { fallback: {} });
