import { describe, expect, it } from 'vitest';
import { msUntilNextWeeklyLeaderboardWindow } from './weeklyLeaderboardSchedule';

describe('weeklyLeaderboardSchedule', () => {
  it('runs immediately when the API starts inside the weekly window', () => {
    expect(msUntilNextWeeklyLeaderboardWindow(new Date('2026-04-27T00:00:30.000Z'))).toBe(0);
  });

  it('schedules the following Monday after a weekly job attempt inside the window', () => {
    const delay = msUntilNextWeeklyLeaderboardWindow(
      new Date('2026-04-27T00:00:30.000Z'),
      { includeCurrentWindow: false },
    );

    expect(delay).toBe(new Date('2026-05-04T00:00:00.000Z').getTime() - new Date('2026-04-27T00:00:30.000Z').getTime());
  });

  it('schedules the next Monday from outside the weekly window', () => {
    const delay = msUntilNextWeeklyLeaderboardWindow(new Date('2026-04-28T12:00:00.000Z'));

    expect(delay).toBe(new Date('2026-05-04T00:00:00.000Z').getTime() - new Date('2026-04-28T12:00:00.000Z').getTime());
  });
});
