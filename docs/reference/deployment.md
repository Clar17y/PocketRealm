### Frontend (Vercel)
- Auto-deploys from `main` branch
- Environment: `NEXT_PUBLIC_API_URL`

### Backend (Render)
- Web Service, Node environment
- Build: `npm install && npm run build:api`
- Start: `npm run start:api`
- Environment: `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`
- Background timers: boss round resolution (60s), persisted mob cleanup (5min), leaderboard refresh (15min)

### Database (Neon)
- Run migrations: `npm run db:migrate`
- Connection pooling enabled

## Database Connection Pool

Prisma defaults to `num_cpus * 2 + 1` connections. On a 2-core VPS this is only 5,
which can exhaust under moderate load with 145 API endpoints + background schedulers.

Add connection pool parameters to `DATABASE_URL`:

```
DATABASE_URL="postgresql://user:pass@host:5433/pocketrealm?connection_limit=20&pool_timeout=15"
```

- `connection_limit=20`: Tune to stay under PostgreSQL's `max_connections` (default 100)
- `pool_timeout=15`: Seconds to wait for a connection before erroring (default 10)
