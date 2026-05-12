API routes are mounted in `apps/api/src/app.ts`. Most routes are prefixed with `/api/v1/`. Health routes (`/health`, `/health/live`, `/health/ready`) are mounted at root, and the Stripe webhook is mounted before JSON parsing at `/api/v1/premium/webhook/stripe`.

### Auth (`/auth`)
```
POST   /auth/register
POST   /auth/login
POST   /auth/refresh
POST   /auth/logout
```

### Player (`/player`)
```
GET    /player
GET    /player/skills
GET    /player/attributes
POST   /player/attributes
PATCH  /player/settings
PATCH  /player/tutorial
GET    /player/equipment
```

### Turns (`/turns`)
```
GET    /turns
POST   /turns/spend
```

### HP (`/hp`)
```
GET    /hp
POST   /hp/rest
POST   /hp/recover
GET    /hp/rest/estimate
```

### Resources (`/resources`)
```
GET    /resources
POST   /resources/rest
GET    /resources/estimate
```

### Zones (`/zones`)
```
GET    /zones
POST   /zones/travel
```

### Exploration (`/exploration`)
```
POST   /exploration/start
GET    /exploration/estimate
```

### Combat (`/combat`)
```
GET    /combat/sites
POST   /combat/sites/abandon
POST   /combat/sites/:id/strategy
POST   /combat/start
GET    /combat/logs
GET    /combat/logs/:id
GET    /combat/logs/:id/fights
```

### Inventory (`/inventory`)
```
GET    /inventory
DELETE /inventory/:id
POST   /inventory/repair
POST   /inventory/repair-equipped
POST   /inventory/use
POST   /inventory/sell
POST   /inventory/sell/bulk
GET    /inventory/stash
POST   /inventory/stash/deposit
POST   /inventory/stash/deposit/batch
POST   /inventory/stash/withdraw
POST   /inventory/stash/withdraw/batch
GET    /inventory/loot/:sessionId
POST   /inventory/loot/claim
```

### Equipment (`/equipment`)
```
POST   /equipment/equip
POST   /equipment/unequip
POST   /equipment/init
```

### Gathering (`/gathering`)
```
GET    /gathering/nodes
POST   /gathering/mine
```

### Crafting (`/crafting`)
```
GET    /crafting/recipes
POST   /crafting/craft
POST   /crafting/forge/upgrade
POST   /crafting/forge/reroll
POST   /crafting/salvage
POST   /crafting/salvage/batch
```

### Bestiary (`/bestiary`)
```
GET    /bestiary
```

### Chat (`/chat`)
```
GET    /chat/history
GET    /chat/activity/npc-reaction
```

### PvP (`/pvp`)
```
GET    /pvp/ladder
GET    /pvp/rating
POST   /pvp/scout
POST   /pvp/challenge
GET    /pvp/history
GET    /pvp/history/:matchId
GET    /pvp/notifications/count
GET    /pvp/notifications
POST   /pvp/notifications/read
GET    /pvp/notifications/scouts/count
GET    /pvp/notifications/scouts
POST   /pvp/notifications/scouts/read
```

### Boss (`/boss`)
```
GET    /boss/active
GET    /boss/history
GET    /boss/:id
POST   /boss/:id/signup
GET    /boss/:id/round/:num
```

### World Events (`/events`)
```
GET    /events
GET    /events/zone/:zoneId
GET    /events/:id
```

### Achievements (`/achievements`)
```
GET    /achievements
GET    /achievements/unclaimed-count
POST   /achievements/:id/claim
GET    /achievements/title
PUT    /achievements/title
```

### Leaderboard (`/leaderboard`)
```
GET    /leaderboard/categories
GET    /leaderboard/:category
```

### Seasons (`/seasons`)
```
GET    /seasons/active
GET    /seasons/archives
GET    /seasons/:id/hall-of-fame
```

### Guild (`/guild`)
```
POST   /guild
GET    /guild
GET    /guild/search
GET    /guild/:id
PATCH  /guild/:id
DELETE /guild/:id
POST   /guild/:id/join
POST   /guild/:id/leave
POST   /guild/:id/request
GET    /guild/:id/requests
POST   /guild/:id/requests/:requestId/accept
POST   /guild/:id/requests/:requestId/reject
POST   /guild/:id/kick
POST   /guild/:id/promote
POST   /guild/:id/demote
POST   /guild/:id/transfer
GET    /guild/:id/log
GET    /guild/:id/upgrades
POST   /guild/:id/upgrades/activate
GET    /guild/:id/contracts
GET    /guild/:id/projects
POST   /guild/:id/projects/start
POST   /guild/:id/projects/:projectId/contribute/turns
POST   /guild/:id/projects/:projectId/contribute/materials
GET    /guild/:id/specialization
POST   /guild/:id/specialization/select
POST   /guild/:id/specialization/respec
```

### Templates (`/templates`)
```
GET    /templates
POST   /templates
GET    /templates/active
PATCH  /templates/:id
DELETE /templates/:id
POST   /templates/:id/activate
```

### Skill Points (`/skillpoints`)
```
GET    /skillpoints
POST   /skillpoints/allocate
POST   /skillpoints/respec
```

### Casino (`/casino`)
```
POST   /casino/exchange
GET    /casino/roulette/round
POST   /casino/roulette/bet
GET    /casino/roulette/history
GET    /casino/roulette/stats
```

### Training (`/training`)
```
POST   /training/fight
GET    /training/cooldown
```

### Quests (`/quests`)
```
GET    /quests
POST   /quests/bonus
POST   /quests/:id/reroll
POST   /quests/:id/claim
```

### Expedition (`/expedition`)
```
GET    /expedition/cooldowns
GET    /expedition/active
GET    /expedition/history
GET    /expedition/shop
POST   /expedition/shop/purchase
GET    /expedition/:id
POST   /expedition/launch
POST   /expedition/:id/signup
POST   /expedition/:id/force-start
POST   /expedition/:id/force-round
POST   /expedition/:id/auto-resolve
POST   /expedition/:id/abandon
PATCH  /expedition/:id/target
PATCH  /expedition/:id/heal-target
POST   /expedition/:id/recover
```

### Shop (`/shop`)
```
GET    /shop
POST   /shop/purchase/:itemId
```

### Friends (`/friends`)
```
POST   /friends/request
POST   /friends/request/search
GET    /friends/requests/incoming
GET    /friends/requests/outgoing
POST   /friends/requests/:id/accept
POST   /friends/requests/:id/decline
GET    /friends
DELETE /friends/:id
GET    /friends/:id/profile
POST   /friends/:id/spar
POST   /friends/block
DELETE /friends/block/:id
GET    /friends/block
POST   /friends/mail
GET    /friends/mail/inbox
GET    /friends/mail/sent
GET    /friends/mail/unread-count
GET    /friends/mail/:id
DELETE /friends/mail/:id
```

### Notifications (`/notifications`)
```
POST   /notifications/subscribe
DELETE /notifications/unsubscribe
GET    /notifications/status
```

### Premium (`/premium`)
```
POST   /premium/checkout
POST   /premium/confirm
GET    /premium/status
GET    /premium/purchases
POST   /premium/webhook/stripe
```

### Admin (`/admin`) — requires admin role
```
POST   /admin/turns/grant
POST   /admin/player/level
POST   /admin/player/xp
POST   /admin/player/attributes
GET    /admin/items/templates
POST   /admin/items/grant
GET    /admin/events/templates
GET    /admin/events/active
POST   /admin/events/spawn
POST   /admin/events/:id/cancel
GET    /admin/mobs
POST   /admin/boss/spawn
GET    /admin/zones
POST   /admin/zones/discover-all
POST   /admin/zones/teleport
GET    /admin/mob-families
POST   /admin/encounter/spawn
GET    /admin/resource-nodes
POST   /admin/resource-nodes/spawn
```
