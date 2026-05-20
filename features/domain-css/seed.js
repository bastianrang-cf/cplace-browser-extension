// Default rules shipped on first install. After install, users edit their rules
// via the Options page; this file is the on-install seed only.

export const seedRules = [
  {
    pattern: '*',
    css: 'body.cf-cplace-admin-access #cplace { border: 3px solid red !important; }',
  },
];
