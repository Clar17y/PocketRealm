import { KnockoutBanner } from '@/components/KnockoutBanner';

interface ActivityLockBannerProps {
  activityLockReason: 'encounter' | 'expedition' | null;
  action: string;
}

export function ActivityLockBanner({ activityLockReason, action }: ActivityLockBannerProps) {
  return (
    <KnockoutBanner
      title={activityLockReason === 'encounter' ? 'Active Encounter Site' : 'Active Expedition'}
      action={action}
      message={activityLockReason === 'encounter'
        ? `You have an active encounter site. Complete or abandon it before ${action}.`
        : `You are on an active expedition. Complete it before ${action}.`}
    />
  );
}
