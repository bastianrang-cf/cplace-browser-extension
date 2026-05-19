import { storage } from '#imports';

export const enabledModulesItem = storage.defineItem('local:enabledModules', { fallback: {} });
export const moduleOptionsItem = storage.defineItem('local:moduleOptions', { fallback: {} });
export const batchJobsCacheItem = storage.defineItem('local:batchJobsCache', { fallback: {} });
