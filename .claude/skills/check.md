Run full build check for all WordSwipe packages to verify there are no TypeScript errors.

Steps:
1. Build shared package: `pnpm --filter @wordswipe/shared build`
2. Build API (TypeScript check): `pnpm --filter api build`
3. Build web app: `pnpm --filter web build`
4. Build admin panel: `pnpm --filter admin build`
5. Report results — which passed, which failed, and show any errors
