export { fetchApi, clearStoredTokens, getJwtExpMs, checkApiReady, ensureFreshAccessToken } from './core';
export type { ApiRequestOptions, ApiResponse, TaxInfo } from './core';

export { getDiscordLinkStatus, claimDiscordLinkCode } from './discord';
export type { DiscordLinkStatusResponse } from './discord';

export { createSupportTicket } from './support';
export type {
  CreateSupportTicketRequest,
  CreateSupportTicketResponse,
  SupportTicketArea,
  SupportTicketCategory,
  SupportTicketPrivacy,
} from './support';

export {
  register,
  login,
  refreshToken,
  verifyEmail,
  resendVerification,
  forgotPassword,
  resetPassword,
  changeEmail,
  changePassword,
  getCharacters,
  switchPlayer,
  joinSeason,
  getSeasonArchives,
} from './auth';
export type { CharacterSummary, SeasonArchiveSummary } from './auth';

export { getActiveSeason, getHallOfFame, getPublicSeasonArchives } from './seasons';
export type { ActiveSeasonResponse, HallOfFameEntryResponse, PublicSeasonArchiveSummary } from './seasons';

export {
  getPlayer,
  updatePlayerSettings,
  updateTutorialStep,
  getPlayerAttributes,
  allocatePlayerAttribute,
  getSkills,
  getEquipment,
  getBestiary,
  getExpeditionBestiary,
  getWorldBossBestiary,
  getTurns,
  getHpState,
  restEstimate,
  rest,
  recoverFromKnockout,
  claimStarterWeapon,
} from './player';
export type { PlayerSettings } from './player';

export {
  getZones,
  travelToZone,
  estimateExploration,
  startExploration,
  startCombat,
  getEncounterSites,
  selectSiteStrategy,
  abandonEncounterSites,
  getCombatLog,
  getCombatLogs,
  getEncounterSiteFights,
} from './combat';
export type {
  EventModifierBadge,
  CombatActiveEvent,
  CombatLogEntryResponse,
  SkillXpGrantResponse,
  CombatOutcomeResponse,
  CombatSourceResponse,
  CombatResultResponse,
  CombatFightResult,
  CombatResponse,
  CombatHistoryListItemResponse,
  CombatHistoryResponse,
  CombatHistoryQuery,
  EncounterSitesQuery,
  EncounterSitesResponse,
  EncounterSiteFightSummary,
  EncounterSiteFightsResponse,
  ProspectableResourceNodeResponse,
} from './combat';

export {
  getInventory,
  destroyInventoryItem,
  useItem,
  repairItem,
  repairAllEquipped,
  equip,
  unequip,
  getGatheringNodes,
  mine,
  getCraftingRecipes,
  craft,
  salvage,
  salvageBatch,
  forgeUpgrade,
  forgeReroll,
  sellItem,
  sellBulk,
  getStash,
  depositToStash,
  depositBatchToStash,
  withdrawFromStash,
  withdrawBatchFromStash,
  claimLoot,
  fetchPendingLoot,
} from './items';
export type {
  PendingLootItem,
  GatheringNodesQuery,
  GatheringNodesResponse,
  InventoryItem,
  InventoryItemTemplate,
} from './items';

export {
  getPvpRating,
  getPvpLadder,
  scoutPvpOpponent,
  challengePvpOpponent,
  getPvpMatchDetail,
  getPvpHistory,
  getPvpNotifications,
  getPvpNotificationCount,
  markPvpNotificationsRead,
  getChatHistory,
  getNpcActivityReaction,
  getActiveEvents,
  getZoneEvents,
  getActiveBossEncounters,
  getBossEncounter,
  signUpForBoss,
  getBossHistory,
  getAchievements,
  getAchievementUnclaimedCount,
  claimAchievementReward,
  getActiveTitle,
  setActiveTitle,
  getLeaderboardCategories,
  getLeaderboard,
  getCrownCollectors,
} from './social';
export type {
  PvpRatingResponse,
  PvpLadderEntry,
  PvpLadderResponse,
  PvpScoutData,
  PvpMatchResponse,
  PvpChallengeResponse,
  PvpMatchDetailResponse,
  PvpNotification,
  WorldEventResponse,
  BossPlayerReward,
  BossRoundSummary,
  BossEncounterResponse,
  BossParticipantResponse,
  BossHistoryEntry,
  AchievementRewardResponse,
  PlayerAchievementProgress,
  AchievementsResponse,
  LeaderboardPeriod,
  CrownCounts,
  CrownCollectorEntry,
  CrownCollectorsResponse,
  LeaderboardEntry,
  LeaderboardResponse,
  LeaderboardCategoryGroup,
  LeaderboardCategoriesResponse,
} from './social';

export { getNotificationStatus, subscribePush, unsubscribePush } from './notifications';
export { createPremiumCheckout, confirmPremiumCheckout, getPremiumStatus, getPremiumPurchases } from './premium';

export { getResources } from './resources';
export type { CombatResourceResponse } from './resources';

export {
  adminGrantTurns,
  adminSetLevel,
  adminGrantXp,
  adminSetAttributes,
  adminSetSkillLevel,
  adminSetSkillLevels,
  adminGetItemTemplates,
  adminGrantItem,
  adminGetEventTemplates,
  adminGetActiveEvents,
  adminSpawnEvent,
  adminCancelEvent,
  adminGetMobs,
  adminGetMobFamilies,
  adminSpawnBoss,
  adminGetZones,
  adminDiscoverAllZones,
  adminTeleport,
  adminSpawnEncounter,
  adminGetResourceNodes,
  adminGetSeasons,
  adminListSupportTickets,
  adminUpdateSupportTicket,
  adminCreateSeason,
  adminBootstrapSeason,
  adminActivateSeason,
  adminEndSeason,
  adminEvaluateSeasonRewards,
  adminMergeSeason,
  adminSpawnResourceNode,
  adminGrantTokens,
  adminGrantGuildTreasury,
  adminResetExpeditionCooldowns,
  adminFillExpedition,
  adminGetBalanceReport,
  adminGetLatencyActions,
  adminGetLatencyReport,
} from './admin';
export type {
  AdminItemTemplate,
  AdminZone,
  AdminMobTemplate,
  AdminMobFamily,
  AdminEventTemplate,
  AdminActiveEvent,
  AdminResourceNode,
  AdminSeason,
  AdminSupportTicket,
  AdminSupportTicketStatus,
  AdminSupportTicketUpdateInput,
  AdminSupportSensitivityFlag,
  BalanceReport,
  BalancePeriod,
  LatencyActionSummary,
  LatencyMetric,
  LatencyPeriod,
  LatencyReport,
  LatencySeriesPoint,
} from './admin';

export {
  getTemplates,
  getActiveTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  activateTemplate,
} from './templates';

export {
  getPlayerGuild,
  createGuild,
  searchGuilds,
  joinGuild,
  leaveGuild,
  kickGuildMember,
  promoteGuildMember,
  demoteGuildMember,
  transferGuildLeadership,
  disbandGuild,
  updateGuildSettings,
  getGuildLog,
  getGuildUpgrades,
  activateGuildUpgrade,
  getGuildContracts,
  getGuildProjects,
  startGuildProject,
  contributeProjectTurns,
  contributeProjectMaterials,
  getGuildSpecialization,
  selectGuildSpecialization,
  respecGuildSpecialization,
  requestJoinGuild,
  getGuildJoinRequests,
  acceptJoinRequest,
  rejectJoinRequest,
} from './guild';
export type {
  GuildResponse,
  GuildMemberResponse,
  PlayerGuildResponse,
  GuildSearchResponse,
  GuildLogResponse,
  GuildUpgradeResponse,
  GuildUpgradeTierResponse,
  GuildAvailableUpgradeResponse,
  GuildUpgradesResponse,
  GuildContractResponse,
  GuildContractsResponse,
  GuildProjectResponse,
  GuildProjectContributeResponse,
  GuildProjectAvailableResponse,
  GuildProjectsListResponse,
  GuildProjectContributionResponse,
  SpecializationStatusResponse,
  SpecializationTierBonusResponse,
  GuildJoinRequestResponse,
  GuildJoinRequestsResponse,
} from './guild';

export { getQuests, claimQuestReward, claimDailyBonus, rerollQuest } from './quests';
export type { QuestsResponse, ClaimRewardResponse, ClaimBonusResponse, RerollQuestResponse } from './quests';

export { getShopItems, purchaseShopItem, getPlayerBuffs } from './shop';
export type { ShopListResponse, BuffsResponse } from './shop';

export { getSkillPointState, allocateSkillPoint, respecSkillPoints } from './skillPoints';
export type { SkillPointState } from './skillPoints';
export { exchangeGold, getRouletteRound, placeRouletteBet, getRouletteHistory, getRouletteStats } from './casino';
export type { GoldExchangeResponse, PlaceBetResponse, RouletteNumberStat } from './casino';
export { startTrainingFight, getTrainingCooldown } from './training';
export type { TrainingFightResponse, TrainingCooldownResponse } from './training';

export {
  getActiveExpedition,
  getExpeditionStatus,
  getExpeditionHistory,
  launchExpedition,
  signUpForExpedition,
  forceStartExpedition,
  forceNextRound,
  recoverFromExpeditionKO,
  getExpeditionCooldowns,
  getExpeditionShop,
  purchaseExpeditionItem,
} from './expedition';
export type {
  ExpeditionStatusResponse,
  ExpeditionDetailResponse,
  ExpeditionHistoryResponse,
  ExpeditionShopResponse,
  ExpeditionPurchaseResponse,
} from './expedition';

export {
  getFriendsList,
  sendFriendRequest,
  searchPlayerByUsername,
  getIncomingFriendRequests,
  getOutgoingFriendRequests,
  acceptFriendRequest,
  declineFriendRequest,
  unfriend,
  getFriendProfile,
  sparFriend,
  blockPlayer,
  unblockPlayer,
  getBlockList,
  sendFriendMail,
  getFriendMailInbox,
  getFriendMailSent,
  getFriendMailUnreadCount,
  readFriendMail,
  deleteFriendMail,
} from './friends';
export type { SparResponse } from './friends';
