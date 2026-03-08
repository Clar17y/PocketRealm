export { fetchApi, clearStoredTokens, getJwtExpMs } from './core';
export type { ApiResponse, TaxInfo } from './core';

export { register, login, refreshToken } from './auth';

export {
  getPlayer,
  updatePlayerSettings,
  updateTutorialStep,
  getPlayerAttributes,
  allocatePlayerAttribute,
  getSkills,
  getEquipment,
  getBestiary,
  getTurns,
  spendTurns,
  getHpState,
  restEstimate,
  rest,
  recoverFromKnockout,
} from './player';
export type { PlayerSettings } from './player';

export {
  getZones,
  travelToZone,
  estimateExploration,
  startExploration,
  startCombat,
  startCombatFromEncounterSite,
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
  LeaderboardEntry,
  LeaderboardResponse,
  LeaderboardCategoryGroup,
  LeaderboardCategoriesResponse,
} from './social';

export { getResources } from './resources';
export type { CombatResourceResponse } from './resources';

export {
  adminGrantTurns,
  adminSetLevel,
  adminGrantXp,
  adminSetAttributes,
  adminSetSkillLevel,
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
  adminSpawnResourceNode,
  adminGrantTokens,
  adminFillExpedition,
} from './admin';
export type {
  AdminItemTemplate,
  AdminZone,
  AdminMobTemplate,
  AdminMobFamily,
  AdminEventTemplate,
  AdminActiveEvent,
  AdminResourceNode,
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
  recoverFromExpeditionKO,
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
