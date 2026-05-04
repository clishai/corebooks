# Phase 1: Commit Existing Work Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Verify and commit the five unstaged files (import service, ImportModal, OnboardingWizard, featureFlags, paymentMethods) plus all modified files that are already wired together.

**Architecture:** All work is already done. This phase is purely verification + commit. Types check clean and 104 tests pass as of writing.

**Tech Stack:** TypeScript, Vitest, Fastify 5, Prisma 7, React 19

---

### Task 1: Verify and commit

**Files:**
- Commit: `src/api/services/importService.ts`
- Commit: `src/ui/components/ImportModal.tsx`
- Commit: `src/ui/components/OnboardingWizard.tsx`
- Commit: `src/ui/lib/featureFlags.ts`
- Commit: `src/ui/lib/paymentMethods.ts`
- Commit: all modified tracked files (settings.ts, client.ts, Layout.tsx, NewEntryModal.tsx, DraftsPage.tsx, EntriesPage.tsx, HomePage.tsx, SettingsPage.tsx)
- Remove: `src/ui/components/FirstLaunchModal.tsx` (already deleted in working tree)

- [ ] **Step 1: Confirm types pass**

```bash
npx tsc --noEmit && npx tsc --project src/ui/tsconfig.json --noEmit
```
Expected: no output (zero errors)

- [ ] **Step 2: Confirm tests pass**

```bash
npm test
```
Expected: `Tests 104 passed (104)`

- [ ] **Step 3: Stage and commit**

```bash
git add \
  src/api/services/importService.ts \
  src/ui/components/ImportModal.tsx \
  src/ui/components/OnboardingWizard.tsx \
  src/ui/lib/featureFlags.ts \
  src/ui/lib/paymentMethods.ts \
  src/api/routes/settings.ts \
  src/ui/api/client.ts \
  src/ui/components/Layout.tsx \
  src/ui/components/NewEntryModal.tsx \
  src/ui/pages/DraftsPage.tsx \
  src/ui/pages/EntriesPage.tsx \
  src/ui/pages/HomePage.tsx \
  src/ui/pages/SettingsPage.tsx
git rm src/ui/components/FirstLaunchModal.tsx 2>/dev/null || true
git commit -m "feat: add import service, onboarding wizard, feature flags, payment methods"
```
Expected: commit created on main branch
