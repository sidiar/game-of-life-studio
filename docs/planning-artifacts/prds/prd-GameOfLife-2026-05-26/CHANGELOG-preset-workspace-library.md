# PRD Changelog: Preset Workspace Library

**Date:** 2026-09-28
**Phase:** Implementation (Epics 1–4 done, Epic 5 one story from close)
**Change Type:** Feature Addition (Scope Expansion)

---

## Summary

Added the Preset Workspace Library: curated, ready-to-run workspaces bundled with the deployed
app as static export-envelope JSONs plus a manifest. Three consumption paths — automatic
first-visit load of the default preset (the headline: a visitor at the root URL lands in a
populated, runnable gallery with zero clicks), a Settings loader, and a shareable preset link.

**Motivation (Sidiar):** first-time visitors — hiring managers, engineering managers, quick
passers-by — must taste the essence of the game within seconds, without building anything first.

---

## Changes Made

### 1. New Functional Requirement: FR-9 (Preset Workspace Library)

**Location:** After FR-8 in Functional Requirements section

- FR-9.1: Repo-Bundled Preset Workspaces (folder + manifest + CI lockstep gate)
- FR-9.2: First-Visit Default Preset (auto-load on fresh workspace, Conway fallback)
- FR-9.3: Load Preset from Settings
- FR-9.4: Preset Link (shareable URL by manifest id)
- FR-9.5: Descriptions at Every Level (Battle, Organism, workspace; added 2026-09-28 in the same
  session — the complement that lets preset content explain what the user is observing.
  **Owner ruling:** optional fields ride `formatVersion: 1`, no backward-compat obligation;
  older builds strip them silently)

### 2. Design constraints inherited, not invented

Every preset is an FR-8.3 export envelope and every load runs through the FR-8.4 import
pipeline (validation, format migration, atomic destructive replace, warning with pristine
suppression). FR-9 adds **no new format and no new parser** — that inheritance is the
requirement, not an implementation choice.

### 3. Story breakdown (epics.md, Epic 7)

Seven stories deliver the five FRs — two stories carry no FR of their own by design:

1. 7.1 Preset Workspace Foundations (FR-9.1)
2. 7.2 Descriptions at Every Level (FR-9.5)
3. 7.3 Showcase Preset Content (FR-9.2 rationale + FR-9.5 — content, gates 7.4)
4. 7.4 First-Visit Default Preset Auto-Load (FR-9.2)
5. 7.5 Load Preset from Settings (FR-9.3)
6. 7.6 Preset Link (FR-9.4)
7. 7.7 Preset Catalog (more of FR-9.1/9.5 — additional curated presets; deliberately last,
   candidate list in the story)

### 4. Prioritization

Delivered as **Epic 7, executed before Epic 6** (owner decision, 2026-09-28). Epic numbers are
identities, not order — Epic 6's ~50 deferred-work references and story ids stay untouched.

---

## Reference

A proof-of-concept of FR-9.1 lives on branch `poc/preset-workspace-library` (folder, manifest,
first generated preset, lockstep test). Story 7.1 lands it properly through the story flow.
