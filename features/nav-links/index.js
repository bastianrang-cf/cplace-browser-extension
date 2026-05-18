export default {
  id: 'nav-links',
  name: 'Navigation Links',
  description: 'Adds a Navigation button to the popup with quick links to common cplace pages.',
  defaultEnabled: true,
  navLinks: [
    { label: 'All Workspaces',     path: '/space/allSpaces' },
    { label: 'All Packages',       path: '/solutionmanagement/viewAll' },
    { label: 'Batch Jobs',         path: '/batchJob/jobs' },
    { label: 'Low-Code Dashboard', path: '/cplacejsAdmin/cplaceJSDashboard' },
    { label: 'Deleted Items',      path: '/restorable/trashCanPages' },
    { label: 'Activity Stream',    path: '/awareness/recentChanges' },
    { label: 'My Drafts',          path: '/draft/myDrafts' },
  ],
};
