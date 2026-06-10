/**
 * Discord snowflake ids are 64-bit integers with a 2015 epoch: real ids are
 * 17-20 decimal digits. Single source of truth for the API and the bot so the
 * two sides of the internal HTTP boundary never disagree on validity.
 */
export const DISCORD_SNOWFLAKE_REGEX = /^\d{17,20}$/;
