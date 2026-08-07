import { withCampaignAttribution } from './leadAttribution';

export const FIELD_SCOUT_ATTRIBUTION = {
  utm_source: 'field_scout',
  utm_medium: 'product',
  utm_campaign: 'water_lane',
  utm_content: 'walkthrough',
} as const;

export const FIELD_SCOUT_EARLY_ADOPTER_URL = withCampaignAttribution(
  '/early-adopter',
  FIELD_SCOUT_ATTRIBUTION,
);

export const FIELD_SCOUT_DEMO_ASSETS = [
  {
    id: 'WATER-DEMO-001',
    name: 'Portable turbidity meter',
    location: 'Treatment plant intake',
    status: 'Calibration review due',
  },
  {
    id: 'WATER-DEMO-002',
    name: 'Field pH meter',
    location: 'Distribution route',
    status: 'Ready for approved use',
  },
  {
    id: 'WATER-DEMO-003',
    name: 'Sample cooler',
    location: 'Vehicle 2',
    status: 'Temperature log attached',
  },
] as const;
