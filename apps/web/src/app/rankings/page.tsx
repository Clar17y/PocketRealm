import { PublicRankings } from '@/components/rankings/PublicRankings';
import type { PublicRankingsTab } from '@/components/rankings/RankingsTabs';

const VALID_TABS = new Set<PublicRankingsTab>(['leaderboards', 'weekly', 'crowns', 'hallOfFame']);

function tabFromSearchParam(tab: string | string[] | undefined): PublicRankingsTab {
  const value = Array.isArray(tab) ? tab[0] : tab;
  return value && VALID_TABS.has(value as PublicRankingsTab) ? (value as PublicRankingsTab) : 'leaderboards';
}

interface RankingsPageProps {
  searchParams?: Promise<{ tab?: string | string[] }>;
}

export default async function RankingsPage({ searchParams }: RankingsPageProps) {
  const params = searchParams ? await searchParams : undefined;
  return <PublicRankings initialTab={tabFromSearchParam(params?.tab)} />;
}
