import { EARLY_ACCESS_VOLUME_OPTIONS } from './earlyAccessApplication';

type MessagingTier = 'starter' | 'growth' | 'enterprise' | 'unknown';
type VolumeValue = (typeof EARLY_ACCESS_VOLUME_OPTIONS)[number]['value'];

// Internal sales-messaging triage only; these are not public plans or pricing.
const VOLUME_TIERS: Record<VolumeValue, Exclude<MessagingTier, 'unknown'>> = {
  'under-100': 'starter',
  '100-500': 'starter',
  '500-1000': 'growth',
  '1000-5000': 'growth',
  'over-5000': 'enterprise',
};

const TIER_LABELS: Record<MessagingTier, string> = {
  starter: 'Lower-volume internal sales triage',
  growth: 'Mid-volume internal sales triage',
  enterprise: 'Higher-volume internal sales triage',
  unknown: 'Volume value was not recognized; internal sales triage is unknown',
};

export function recommendMessagingTier(
  volumeValue: string,
): { tier: MessagingTier; label: string } {
  const option = EARLY_ACCESS_VOLUME_OPTIONS.find(({ value }) => value === volumeValue);
  const tier = option ? VOLUME_TIERS[option.value] : 'unknown';
  return { tier, label: TIER_LABELS[tier] };
}

export function describeAllTiers(): Array<{ value: string; tier: string; label: string }> {
  return EARLY_ACCESS_VOLUME_OPTIONS.map(({ value }) => ({
    value,
    ...recommendMessagingTier(value),
  }));
}
