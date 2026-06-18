/**
 * Maps duel emoji name -> Discord application emoji id.
 *
 * GENERATED / MAINTAINED by `npm run upload-duel-emojis` (see
 * src/scripts/uploadDuelEmojis.ts). It is empty until the upload script runs;
 * while empty, the renderer falls back to the Unicode placeholders defined in
 * duelEmoji.ts, so the bot works with or without the custom art uploaded.
 *
 * After running the upload script, commit the populated map so production uses
 * the custom emoji.
 */
export const DUEL_CUSTOM_EMOJI: Record<string, string> = {
  bar_empty: '1517089386817257472',
  cleanse: '1517089390386741458',
  counter: '1517089391170814015',
  crit: '1517089391712010311',
  defend: '1517089393024958544',
  draw: '1517089394056499310',
  heal_hp: '1517089394798891088',
  heal_mp: '1517089395658985622',
  heal_sta: '1517089396535459891',
  hp_full: '1517089387853254787',
  ko: '1517089397126729760',
  loss: '1517089397936361573',
  magic: '1517089399207100488',
  miss: '1517089400196960317',
  mp_full: '1517089388780060763',
  physical: '1517089401153519636',
  potion: '1517089408480841729',
  sta_full: '1517089389182717954',
  victory: '1517089409353252904',
  ward: '1517089409995112501',
};
