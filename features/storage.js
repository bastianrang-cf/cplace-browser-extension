import { storage } from '#imports';

export const enabledModulesItem = storage.defineItem('local:enabledModules', { fallback: {} });
export const moduleOptionsItem = storage.defineItem('local:moduleOptions', { fallback: {} });
export const batchJobsCacheItem = storage.defineItem('local:batchJobsCache', { fallback: {} });
export const lowCodeLogsCacheItem = storage.defineItem('local:lowCodeLogsCache', { fallback: {} });
export const lowCodeLogsSeenItem = storage.defineItem('local:lowCodeLogsSeen', { fallback: {} });
export const lowCodeLogsFiltersItem = storage.defineItem('local:lowCodeLogsFilters', { fallback: {} });
export const domainCssByTabItem = storage.defineItem('session:domainCssByTab', { fallback: {} });
