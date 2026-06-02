import { storage } from '#imports';

export const enabledModulesItem = storage.defineItem('local:enabledModules', { fallback: {} });
export const moduleOptionsItem = storage.defineItem('local:moduleOptions', { fallback: {} });
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
