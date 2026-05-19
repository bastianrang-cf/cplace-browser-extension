export const REQUIRED_ORIGINS = ['<all_urls>'];

export function hasUniversalHostAccess() {
  return browser.permissions.contains({ origins: REQUIRED_ORIGINS });
}

export function requestUniversalHostAccess() {
  return browser.permissions.request({ origins: REQUIRED_ORIGINS });
}

export function revokeUniversalHostAccess() {
  return browser.permissions.remove({ origins: REQUIRED_ORIGINS });
}
