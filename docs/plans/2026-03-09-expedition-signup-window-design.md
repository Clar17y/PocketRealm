# Expedition Signup Window Design

## Goal

Start the expedition recruiting countdown only after the first participant signs up, so a newly launched expedition cannot auto-start or auto-fail with zero participants.

## Current State

`launchExpedition()` creates a recruiting expedition and immediately sets `nextRoundAt` to `now + SIGNUP_WINDOW_MS`. The recruiting UI renders that timer right away, and `checkAndResolveExpeditionRounds()` later processes any recruiting expedition whose `nextRoundAt` has passed.

That means a guild can launch an expedition, fail to get any signups, and still hit the recruiting deadline. The system then resolves the expedition lifecycle even though nobody ever committed to the run. This is avoidable friction because an active recruiting expedition already blocks launching another expedition, and expedition cooldowns only begin after the run ends.

## Design

Represent "waiting for the first signup" by keeping the expedition in `recruiting` with `nextRoundAt: null`.

Behavior changes:

- `launchExpedition()` creates the expedition with `nextRoundAt: null`
- the first successful `signUpForExpedition()` starts the signup window by setting `nextRoundAt = now + SIGNUP_WINDOW_MS`
- later signups leave the existing timer unchanged
- `checkAndResolveExpeditionRounds()` continues to look only at expeditions whose `nextRoundAt` is due, so expeditions with no participants stay idle indefinitely
- the recruiting UI shows `Starts after first signup` when `nextRoundAt` is `null`

This keeps the lifecycle model simple. No new status is required because `recruiting + null timer` already expresses "open, but countdown not started."

## Retry Behavior

The wipe-reset path should follow the same rule. When an expedition resets back to `recruiting`, it should clear `nextRoundAt` instead of starting a fresh signup countdown immediately. The next signup then begins the new window.

## Data Flow

The API remains the source of truth:

1. Officer launches expedition.
2. API creates recruiting expedition with no timer.
3. Recruiting UI renders placeholder text instead of a countdown.
4. First member signup succeeds.
5. API creates the member record and, if the expedition still has no timer, sets `nextRoundAt`.
6. UI reloads and begins showing the countdown.
7. Background scheduler only processes the expedition once that timer exists and expires.

The first-signup timer update should be conditional, so concurrent signups cannot keep pushing the window back.

## Testing

Add focused regression coverage for:

- launch creating a recruiting expedition with `nextRoundAt: null`
- first signup starting the timer
- later signups not overwriting an existing timer
- wipe reset clearing the timer when returning to `recruiting`
- recruiting UI showing `Starts after first signup` when the timer is absent
