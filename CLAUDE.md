# Claude Code Configuration — STR Ops Portal

## Behavioral Rules

- Do what has been asked; nothing more, nothing less
- NEVER create files unless absolutely necessary
- ALWAYS prefer editing an existing file to creating a new one
- ALWAYS read a file before editing it
- NEVER commit secrets, credentials, or .env files
- NEVER save working files or markdown to the root folder unless it's a project-level doc

## File Organization

- `/src` — source code
- `/tests` — test files
- `/supabase/migrations` — database migrations

## Build & Test

```bash
npm run typecheck   # must pass before committing
npm test            # 108 tests must stay green
npm run build       # use Node 20+
```

---

## Design Context

> Reference this before making any UI change. Full detail in `.impeccable.md`.

### Users
- **Owner/Admin**: Desktop, morning planning, needs to see everything at a glance
- **Supervisor**: Tablet/desktop, review and approve completed jobs
- **Cleaner**: Mobile on-site, large-target job execution with photo proof

### Brand Personality
**Three words: Calm. Trustworthy. Warm.**

### Aesthetic Direction
- **References**: Airbnb.com (warmth, rounded, approachable) + Stripe Dashboard (data density, typographic hierarchy, trust)
- **Anti-reference**: Cold gray enterprise SaaS. Startup-playful clutter.
- **Theme**: Light mode only. Earthy warm cream palette is a brand differentiator — never neutralize it.
- **Typography**: System fonts (SF Pro / Segoe UI). No custom fonts.

### Design Principles
1. **Calm clarity first** — whitespace is not waste. Every screen should feel "things are under control."
2. **Numbers read in under a second** — KPIs and status chips are always prominent and color-coded.
3. **Warm but precise** — earthy palette (`#16423c` green, `#f4f1ea` cream) is intentional brand, not decoration.
4. **Speed over decoration** — max 200ms transitions, skeleton states, no gratuitous animation.
5. **Mobile-first execution, desktop-first management** — admin = information-dense desktop; cleaner = large-target mobile.

### Token Quick Reference
```
Primary:    #16423c   Card:    #fffdf8   Background: #f4f1ea
Muted:      #ebe4d7   Secondary:#d9c3a1  Destructive: #b43f33
Text:       #1d1b18   Muted text:#61594f Border: rgba(29,27,24,0.12)
Radius: 1rem base | 1.5–1.75rem cards | full for pills/buttons
```

### Component Conventions
- Cards: `rounded-2xl border border-border/70 bg-card shadow-sm`
- Buttons: `rounded-full` pill shape throughout
- Inputs: `h-12 rounded-xl border border-input bg-background px-4 text-sm`
- Status chips: `rounded-full border px-3 py-1 text-xs font-medium` + semantic color pair
- Page max-width: `max-w-4xl` (forms) · `max-w-5xl` (dashboard/lists)
- Sidebar: `w-60 bg-card fixed border-r border-border/60`
