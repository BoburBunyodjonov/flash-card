Reset the WordSwipe database completely and re-seed it with initial data.

WARNING: This deletes all data. Confirm with the user before proceeding.

Steps:
1. Ask user to confirm: "Bu barcha ma'lumotlarni o'chiradi. Davom ettirishni xohlaysizmi?"
2. Run: `pnpm --filter api db:push --force-reset`
3. Run: `pnpm --filter api db:seed`
4. Report success: tables recreated + initial categories and plan_settings seeded
