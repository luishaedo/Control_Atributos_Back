# Render database migrations

This service uses Prisma migrations to create the required PostgreSQL tables in Render.

## When to run

Run a migration deploy whenever you provision a new production database or when new migrations land on the backend.

## How to run (Render)

1. Open the Render service dashboard.
2. Go to **Shell** for the backend service.
3. Run:

```bash
npm run prisma:generate
npx prisma migrate deploy
```

## Notes

- `prisma migrate deploy` applies the migrations in `prisma/migrations` in order.
- If tables are missing, Prisma will throw `P2021` errors ("table does not exist").
- This command does **not** reset data; it only applies pending migrations.
