-- Shift tutorial steps >= 4 by +1 to make room for TUTORIAL_STEP_SAVE_TEMPLATE (4).
-- Old mapping: ATTRIBUTE_POINTS=4, EXPLORE=5, ..., DONE=11, COMPLETED=12
-- New mapping: SAVE_TEMPLATE=4, ATTRIBUTE_POINTS=5, ..., DONE=12, COMPLETED=13
-- Process in descending order to avoid unique constraint conflicts.
-- Players at step -1 (SKIPPED) or 0-3 are unaffected.

UPDATE "Player" SET "tutorialStep" = "tutorialStep" + 1 WHERE "tutorialStep" >= 4 AND "tutorialStep" != -1;
