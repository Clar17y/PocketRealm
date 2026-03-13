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
