// Visual Check gate config (TombStoneDash/visual-check action.yml).
// Threshold comes from visual-check thresholds.json key "lims" (0.5%).
// Targets the public lims.bot site, not the London SENAITE server.
export default {
  projectId: 'lims',
  baseUrl: 'https://lims.bot',
  routes: [{ id: 'home', path: '/' }],
  viewports: [
    { name: 'mobile', width: 390, height: 844 },
    { name: 'desktop', width: 1280, height: 800 },
  ],
};
