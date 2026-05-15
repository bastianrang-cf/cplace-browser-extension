const STYLE_ID = 'cplace-admin-access-highlight-style';
const CSS = `
  body.cf-cplace-admin-access #cplace {
    border: 3px solid red !important;
  }
`;

export default {
  id: 'admin-access-highlight',
  name: 'Admin access highlight',
  description:
    'Show a red page border when the user is logged has cplace admin access.',
  defaultEnabled: false,
  apply() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    (document.head || document.documentElement).appendChild(style);
  },
  revert() {
    const el = document.getElementById(STYLE_ID);
    if (el) el.remove();
  },
};
