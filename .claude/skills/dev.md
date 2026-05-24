Start all WordSwipe development servers.

Steps:
1. Check if Docker is running and start it if needed: `docker compose up -d`
2. Run `pnpm --filter api dev` in background (API on port 3000)
3. Run `pnpm --filter web dev` in background (Web app on port 5173)
4. Run `pnpm --filter admin dev` in background (Admin on port 5174)
5. Wait a few seconds and check that all three ports respond
6. Report the URLs to the user:
   - API: http://localhost:3000/health
   - Web app: http://localhost:5173
   - Admin panel: http://localhost:5174
