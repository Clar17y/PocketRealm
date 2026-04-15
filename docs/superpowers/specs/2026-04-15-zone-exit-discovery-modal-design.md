# Zone Exit Discovery Modal Design

## Summary

Add a dedicated discovery modal that appears during exploration playback when a player discovers a new zone exit.

The modal should feel like a meaningful reveal, not a routine activity-log entry:

- it appears at the exact moment the `zone_exit` playback event is revealed
- it pauses playback until dismissed
- it shows the newly discovered zone art and zone name
- it tells the player the zone is now available for travel
- dismissing it resumes the remaining exploration playback

This is a playback presentation feature, not a new exploration system.

## Product Goals

- Make new zone discoveries readable and hard to miss
- Give zone discovery the same celebratory weight as other high-importance modal moments
- Keep the reveal tied to the exact discovery turn in playback
- Preserve the rest of the exploration run after the reveal

## Non-Goals

- This does not add a travel shortcut button inside the modal
- This does not change how zone exits are rolled or discovered
- This does not add a modal for already known exits
- This does not interrupt skipped playback with retroactive modals

## Player Experience

### 1. Discovery happens at the exact playback moment

When exploration playback reaches a `zone_exit` event that represents a newly discovered zone, the normal event banner is replaced by a dedicated modal moment.

The intended feeling is:

1. exploration is playing
2. the exit is found
3. the discovery modal appears immediately
4. the player dismisses it
5. the run continues from the next playback step

### 2. The modal pauses exploration playback

The modal is blocking for playback purposes.

While it is visible:

- exploration playback does not advance
- no later events are revealed
- the run is not finalized

After dismissal:

- the modal closes
- playback resumes from the next event
- the rest of the exploration run continues normally

### 3. The modal is informational only

The modal should not offer a direct travel action.

The message should make one thing clear:

- the player discovered a new zone
- that zone is now available for travel

This keeps the modal celebratory without hijacking the rest of the exploration replay.

### 4. Multiple discoveries are handled one at a time

If one exploration run reveals more than one newly discovered exit, each discovery should pause playback when its own `zone_exit` event is revealed.

The player dismisses each modal in sequence as the run continues.

## UI Design

### Visual weight

The modal should feel close in importance to the existing changelog modal:

- full overlay
- strong visual framing
- large zone name
- zone art as the focal content
- a short discovery message
- one clear dismiss button

This should feel celebratory, not like a generic confirmation dialog.

### Content

Recommended content:

- Title: `New Zone Discovered`
- Hero image: zone art for the discovered zone
- Zone name: prominent, centered
- Body copy: short confirmation such as `You discovered a path to <Zone Name>. This zone is now available for travel.`
- Primary button: `Continue`

### Asset strategy

The frontend should derive the image from the discovered zone name using the existing `zoneImageSrc(zoneName)` helper.

If the image asset is missing, the modal should still render cleanly with text-first content rather than breaking layout or hiding the discovery.

## Frontend Design

### Ownership

The new behavior should live in the existing playback layer rather than the exploration action hook.

- `useExplorationActions.ts` continues to fetch and store playback data
- `ExplorationPlayback.tsx` continues to reveal ordered events
- `TurnPlayback.tsx` becomes responsible for pausing on discovery events and coordinating the modal lifecycle
- a new focused modal component renders the discovery UI

This keeps the concern local to the playback surface that already manages pause/resume behavior for ambushes.

### Playback behavior

`TurnPlayback.tsx` already distinguishes between normal event reveals and combat interruptions.

Extend that control flow with a second interruption type:

- normal event: push log entry and continue
- ambush event: pause for combat playback
- discovery `zone_exit` event: pause for discovery modal

The discovery modal should use the same high-level principle as combat playback:

- preserve playback state
- block advancement while the interruption is active
- resume cleanly after dismissal

### Event qualification

Not every `zone_exit`-typed event should automatically be treated as a discovery modal.

The frontend should only open the modal when the event details clearly identify a discovered zone payload:

- `discoveredZoneId`
- `discoveredZoneName`

This avoids coupling the modal to any older or inconsistent event shape.

### Skip behavior

Skip should remain terminal and summary-oriented.

If the player presses `Skip` during exploration playback:

- playback should finalize immediately
- events should be logged through the existing summary path
- discovery modals should not be shown retroactively

This preserves the current meaning of skip: collapse presentation, keep results.

## Backend Design

### Keep the discovery pipeline unchanged

The backend already discovers zones at the correct time during exploration outcome processing.

That logic should remain unchanged.

The only backend adjustment needed for this feature is payload consistency.

### Normalize `zone_exit` event details

Current exploration code emits two shapes for newly discovered exits:

- live exit discovery: `discoveredZoneId`, `discoveredZoneName`
- auto-discovery when a zone reaches 100% exploration: `zoneId`, `zoneName`

That inconsistency will create special-case frontend logic and missed modals.

Standardize all newly discovered zone-exit events onto one payload shape:

```ts
details: {
  discoveredZoneId: string;
  discoveredZoneName: string;
}
```

That includes:

- direct zone-exit discoveries during exploration outcome processing
- auto-discovered neighbors awarded when the zone becomes fully explored

## Component Design

Add a dedicated modal component under `apps/web/src/components/common/`.

Suggested props:

```ts
interface ZoneDiscoveryModalProps {
  zoneName: string;
  imageSrc?: string;
  onDismiss: () => void;
}
```

The component should stay presentation-only:

- no data fetching
- no navigation
- no state mutation beyond `onDismiss`

## Testing Strategy

### Backend

Add or update tests around exploration event generation to verify that newly discovered `zone_exit` events use the normalized detail shape in both paths:

- direct zone-exit discovery
- auto-discovery on full exploration

### Frontend playback

Add playback-level tests to verify:

- a discovery `zone_exit` pauses playback when revealed
- the modal renders the discovered zone name
- dismissing the modal resumes playback
- skip finalizes playback without surfacing the modal

### Component

Add a focused modal test to verify:

- zone name is shown prominently
- discovery copy renders
- the component remains stable when `imageSrc` is absent

## Risks And Guardrails

### Payload drift

If the backend keeps multiple zone-exit detail shapes, the frontend will become brittle and discovery modals will behave inconsistently.

Normalize the payload first.

### Over-coupling modal logic to hooks

If modal state is placed in `useExplorationActions.ts`, playback timing becomes harder to reason about because the hook does not control event reveal timing.

Keep the modal tied to `TurnPlayback.tsx`, where reveal order and interruption state already exist.

### Broken assets

Zone art may be missing for some zones.

Treat art as enhancement, not a requirement. The modal must still communicate the discovery clearly without an image.
