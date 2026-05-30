# Discord Support And Triage Design

## Overview

Create a PocketRealm Discord community that starts as a small beta support space and can open into a public launch community without changing its core workflow. Discord is the operator and notification surface; PocketRealm remains the source of truth for account links, support tickets, report status, and triage exports.

The first version avoids an always-on LLM integration. Reports are stored in PocketRealm, mirrored into a private Discord triage queue, and exported as compact JSONL for on-demand Codex triage runs. GitHub issues are created or updated only after owner approval.

## Goals

- Give players obvious in-game links to the Wiki, Discord, known issues, and bug reporting.
- Make in-game bug reporting the preferred path because it can attach useful context automatically.
- Support Discord account linking for richer reports and future self-service player commands.
- Keep sensitive account, payment, security, exploit, and personal data out of public Discord.
- Use Discord for staff notifications and workflow because it is easier to monitor than a separate admin screen.
- Let Codex triage batches of new reports from PocketRealm-side structured data without giving it broad Discord scraping access or an application LLM budget.
- Preserve GitHub as the engineering backlog, not the raw player intake queue.

## Non-Goals

- No automatic GitHub issue creation in v1.
- No always-on LLM worker or OpenAI API calls from the app in v1.
- No Discord message scraping as the support-ticket source of truth.
- No public exposure of raw bug reports before screening.
- No support-priority perks tied to Champion status in v1.
- No full admin dashboard unless Discord workflow later becomes painful.

## Discord Server Structure

### Public Community

These channels become public at launch. During beta, most can be limited to `Beta Player`.

| Channel | Purpose |
|---|---|
| `#announcements` | Owner-only major updates. |
| `#patch-notes` | Release notes from the in-game changelog or GitHub. |
| `#known-issues` | Confirmed broad bugs, sanitized and approved before posting. |
| `#wiki-and-guides` | Wiki links, FAQ, and bot wiki lookups. |
| `#rankings` | Optional weekly crown and leaderboard highlights. |
| `#general` | Normal community chat. |
| `#help` | Player-to-player help and basic support. |

### Player Feedback

| Channel | Purpose |
|---|---|
| `#bug-reports-public` | Public or forum-style posts for screened, non-sensitive gameplay/UI bugs. |
| `#suggestions` | Player ideas, tagged by area such as combat, crafting, exploration, UI, balance, social, and economy. |

### Private Support

| Channel | Purpose |
|---|---|
| `#security-reports` | Exploits, abuse, data leakage, payment/account issues. |
| `#account-help` | Private account-support threads where personal details might appear. |
| `#report-followups` | Private bot-created follow-up threads when a reporter needs to answer questions. |

### Staff And Triage

| Channel | Purpose |
|---|---|
| `#triage-queue` | Private structured ticket cards for all new reports. |
| `#triage-decisions` | Audit log of accepted, rejected, duplicate, linked, and escalated tickets. |
| `#mod-log` | Moderation events, deleted messages, AutoMod events. |
| `#bot-health` | Bot sync failures, Discord API errors, export failures, GitHub API errors. |

### Roles

- `Owner`
- `Developer`
- `Moderator`
- `Beta Player`
- `Player`
- `Linked Account`
- Optional later: `Champion` flair only, not support priority.

## In-Game Help Links

The `/game` experience should expose help without forcing players to leave the main flow.

### Header/User Menu

Add a `Help` or support menu entry near the existing account dropdown/settings affordances:

- `Wiki` opens `/wiki`.
- `Discord` opens the configured invite link.
- `Report Bug` opens the in-game report modal.
- `Known Issues` opens the approved known-issues surface, initially Discord `#known-issues`.

### Settings Screen

Add a `Help & Support` card with the same links. This gives mobile users and players looking for account/support controls a predictable place to find help.

### Later Screen-Specific Links

Complex screens can add small contextual help links to relevant Wiki pages, such as `/wiki/resources/turns` from turn-bank UI or `/wiki/crafting/gathering` from gathering.

## Account Linking

Discord linking enables richer support reports and future player tools without exposing internal identifiers.

### Flow

1. Player runs `/link` in Discord.
2. Bot creates a short-lived link code.
3. Player opens PocketRealm Settings and enters the code.
4. API validates the code and stores the Discord user ID against the PocketRealm account.
5. Bot assigns `Linked Account` and confirms success.

### Stored Link Data

- Discord user ID.
- Discord guild ID.
- PocketRealm account/user ID internally.
- Link status and timestamps.

Tickets capture the active player and realm at report time. The Discord link itself is account-level so the player does not need to relink when switching seasonal characters.

Exports and Discord messages must not expose internal UUIDs, emails, session identifiers, refresh tokens, payment details, or raw auth data.

## Player Tools Commands

Create a dedicated `#bot-commands` or `#adventurer-tools` channel. Account-specific command responses should be ephemeral/private by default where Discord supports it. Public sharing should require an explicit option such as `public: true`.

### V1 Commands

- `/link`: link Discord to PocketRealm.
- `/wiki query`: search or link Wiki pages.
- `/known-issues`: show current confirmed issues.
- `/leaderboard category`: show public leaderboard data.
- `/report bug`: start a guided Discord report, but prefer in-game reporting when linked.

### Later Commands

- `/profile`: active character, realm, level, and title.
- `/skill tailoring`: skill level, XP, and next-level progress.
- `/skills`: compact skill summary.
- `/turns`: current turns, cap, and regeneration estimate.
- `/rank category`: the linked player's rank for a category.
- Crafting recipe helpers, boss reminders, expedition reminders, and build/loadout summaries.

## Support Ticket Architecture

PocketRealm owns canonical support-ticket data. Discord only mirrors workflow events.

```text
In-game report / Discord modal
  -> PocketRealm API
  -> SupportTicket DB rows
  -> Discord triage notification
  -> JSONL export for Codex
  -> Owner-approved action
  -> Discord status update and optional GitHub update
```

### Report Sources

**In-game report modal** is the preferred path. It can attach:

- current screen/tab
- active realm and character
- app/API version
- browser and device summary
- recent failed API request ID or Sentry event ID when available
- optional screenshot or attachment reference
- player-written title, expected behavior, actual behavior, and reproduction steps
- reporter privacy choice

**Discord report modal** remains available for players who are outside the game. If the reporter is linked, the bot can still attach account context. If not linked, the bot collects only manual report fields and encourages linking.

### Privacy Choice

Reporters can choose:

- `public_candidate`: appears safe to discuss publicly after screening.
- `private`: account, payment, security, personal data, harassment, or exploit concern.
- `not_sure`: defaults to private.

The player choice is advisory. The system and staff enforce privacy. Raw reports do not become public automatically.

### Ticket Statuses

- `new`
- `needs_info`
- `duplicate`
- `accepted`
- `rejected`
- `security`
- `known_issue`
- `closed`

### Ticket Fields

The first data model should support:

- short ticket ID such as `SUP-123`
- source: in-game or Discord
- status
- privacy choice
- sensitivity flags
- category: bug, suggestion, balance, account, security, abuse, other
- area: combat, exploration, crafting, inventory, social, guild, casino, payments, auth, mobile, performance, other
- title
- description
- expected behavior
- actual behavior
- reproduction steps
- reporter Discord ID if present
- linked player/account references internally
- public reporter display name for sanitized output
- realm label
- current screen
- app/API version
- browser and device summary
- request ID and Sentry event ID references
- attachment metadata
- duplicate ticket IDs
- GitHub issue link
- staff decision notes
- created, updated, and closed timestamps

## Discord Triage Notification

For every new ticket, the bot posts a private triage card in `#triage-queue`:

- ticket ID
- title and source
- status and privacy choice
- reporter display name and linked status
- screen, realm, version, browser/device summary
- sensitivity flags
- concise report body
- attachment links where safe
- action buttons for staff

Buttons/modals should support:

- `Ask Reporter`
- `Mark Duplicate`
- `Link GitHub Issue`
- `Create GitHub Draft`
- `Accept`
- `Reject`
- `Publish Known Issue`
- `Escalate Security`
- `Close`

Button actions call PocketRealm API endpoints and append audit events. The Discord message is a view of the ticket, not the canonical state.

## Codex Triage Workflow

Codex triage is manual and on-demand.

1. Reports accumulate in PocketRealm and `#triage-queue`.
2. Owner asks Codex to triage new reports.
3. Codex reads a PocketRealm-side JSONL export plus current GitHub issue context.
4. Codex proposes decisions and draft text.
5. Owner approves actions.
6. Approved actions update ticket state, Discord messages, and optionally GitHub.

Codex should not need a Discord token for v1. It should not scrape normal Discord message history.

### JSONL Export

Use newline-delimited JSON for triage exports. Each ticket is one compact JSON object per line.

Example:

```jsonl
{"id":"T-123","status":"new","privacy":"private","category":"bug","area":"crafting","title":"Forge result did not update","body":"...","reporter":{"discordId":"123","displayName":"Mira","realm":"Preseason"},"context":{"screen":"forge","appVersion":"0.1.0","browser":"Chrome"},"githubIssueUrl":null,"createdAt":"2026-05-30T12:00:00Z"}
{"id":"T-124","status":"new","privacy":"public_candidate","category":"bug","area":"mobile","title":"Inventory buttons overlap","body":"...","context":{"screen":"inventory","browser":"Mobile Safari"}}
```

Recommended command:

```powershell
npm run support:export-new -- --format jsonl
```

The export should:

- include only triage-relevant fields
- redact email, auth/session, payment, and internal UUID details
- include attachment references, not raw binaries
- include duplicate and GitHub links if already known
- support filtering by status, created date, and limit

Optional later exports:

- open GitHub issues as JSONL
- recent closed/rejected tickets as JSONL for better duplicate detection
- known issues as JSONL for public status matching

### Codex Output

Codex should produce a concise proposed action list:

- ticket ID
- recommended status
- duplicate candidate or GitHub issue target
- severity
- privacy recommendation
- missing information questions
- draft reporter reply
- draft GitHub issue/comment when applicable
- confidence and rationale

No GitHub mutation or public Discord update should happen without explicit approval.

## GitHub Backlog Boundary

GitHub is the engineering backlog, not raw player intake.

Approved GitHub actions:

- Link ticket to an existing issue.
- Add a concise confirmation comment to an existing issue.
- Create a new issue after staff approval.
- Draft an issue body for owner review.

Avoid:

- one GitHub issue per player report
- raw transcript dumps
- exposing Discord IDs, emails, internal IDs, payment data, or security details

## Known Issues Publishing

Raw reports stay private until screened. Confirmed broad issues may create or update sanitized Discord `#known-issues` posts in v1. A later in-game known-issues page can read the same approved records.

A known-issue entry should include:

- clear player-facing title
- affected area
- current status
- workaround if known
- last updated timestamp
- link to public GitHub issue only when safe and useful

Security, exploit, payment, account, harassment, and personal-data tickets must not be posted publicly.

## Implementation Phases

### Phase 1: Community And Links

- Create Discord server structure and roles.
- Add environment-configured Discord invite link.
- Add `/game` help links in header/user menu and Settings.
- Add `Help & Support` card.

### Phase 2: Support Tickets

- Add `SupportTicket` and audit/history storage.
- Add in-game report modal.
- Add authenticated report API.
- Capture screen, version, browser/device, request/Sentry references when available.
- Add status update endpoints for staff/admin use.

### Phase 3: Discord Bridge

- Add Discord bot configuration.
- Add `/link` account-link flow.
- Post private triage cards from new tickets.
- Add staff action buttons that update PocketRealm ticket state.
- Add `#known-issues` posting only through approved actions.

### Phase 4: Codex Export

- Add `support:export-new --format jsonl`.
- Redact sensitive fields at export boundary.
- Add optional exports for open GitHub issues and recent ticket outcomes.
- Document the manual Codex triage runbook.

### Phase 5: Player Tools

- Add `/wiki`, `/known-issues`, and `/leaderboard`.
- Add linked-account commands later: `/profile`, `/skill`, `/skills`, `/turns`, and `/rank`.

## Testing And Verification

- Unit-test support-ticket validation and redaction.
- Unit-test account-link code generation, expiry, and one-time use.
- Unit-test JSONL export shape and redaction.
- Unit-test Discord webhook/bot payload generation separately from live Discord API calls.
- Integration-test in-game report submission creates a ticket and audit entry.
- Integration-test staff status updates append audit events and update Discord mirror state.
- Manual-test Discord role permissions before beta launch.
- Manual-test that public known-issue publishing never exposes raw private report fields.

## Open Follow-Ups

- Attachment handling: v1 stores attachment metadata and safe URLs only. A later phase can move uploads to dedicated object storage if Discord-hosted URLs are not reliable enough.
- Known issues: v1 publishes to Discord only. A later in-game/public page can read approved known-issue records.
- Automation: v1 keeps Codex triage manual. A later worker can reuse the same JSONL/export contract if report volume justifies it.
