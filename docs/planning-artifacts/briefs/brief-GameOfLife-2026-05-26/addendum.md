# Addendum: Game of Life Studio Brief

## Technical Context

**Existing Work:**
- Proof of concept exists at: `/Users/arielsidi/projects/Playground/fort-pienc-game-of-life`
- Extensive technical documentation at: `/Users/arielsidi/projects/NewJob/GoL-CustomSDD/docs/`
  - `project-context.md` - Business context and technical requirements
  - `tech-stack.md` - Technology choices and rationale
  - `architecture.md` - System design, SOLID principles, design patterns
  - `mission.md` - Original vision statement (source material for this brief)

**Performance Targets (Not in Brief):**
- 60 FPS simulation performance at 100x100 grid minimum
- Page load time: < 2 seconds
- Time to interactive: < 3 seconds
- Storage operations:
  - localStorage: < 10ms (p95)
  - API calls: < 500ms (p95, excluding cold start)
  - Backend cold start: ~30s (Render free tier)

**Browser Support:**
- Chrome, Firefox, Safari, Edge (last 2 versions only)
- No IE11 support (uses modern JavaScript features)
- Canvas API support required
- localStorage support required (for standalone mode)
- Minimum screen width: 1024px (desktop/tablet)

**Deployment Architecture Details:**
- **Standalone Mode:** Static Next.js export, localStorage persistence, works offline, $0/month hosting (Vercel/GitHub Pages)
- **Connected Mode (Phase 2):** FastAPI (Python 3.11+) backend, PostgreSQL database, Render/Railway hosting, $0/month with cold starts

**Design Patterns Demonstrated:**
- Repository Pattern (storage abstraction)
- Strategy Pattern (runtime storage selection)
- Adapter Pattern (unified interface for diverse backends)
- Dependency Injection (React Context provides storage)
- Factory Pattern (storage instantiation)

**SOLID Principles:**
- Single Responsibility: Each adapter handles one backend type
- Open/Closed: Add new storage backends without changing existing code
- Liskov Substitution: Any adapter can replace another transparently
- Interface Segregation: Clean, focused storage interface
- Dependency Inversion: Components depend on abstractions, not implementations

**Testing Strategy:**
- Target: 90%+ test coverage for core simulation logic
- Frontend: Jest + React Testing Library
- Backend (Phase 2): pytest
- Linting: ESLint + Prettier (frontend), pylint + black (backend)
- CI/CD: GitHub Actions

**Development Dependencies:**
- Frontend: Next.js 14+, React 18+, TypeScript 5+, Tailwind CSS 3+
- Backend (Phase 2): FastAPI, Pydantic, SQLAlchemy, PostgreSQL

## Scope Clarifications

**MVP Organism Builder:**
The custom organism builder allows users to define survival rules using birth/survival notation (e.g., B3/S23 for Conway's classic rules). This is critical for experimentation and making the tool "considerably more fun." Users won't need to code—the builder provides an intuitive interface for specifying rule conditions.

**Phase 2 Connected Mode:**
While the architecture supports dual deployment modes, MVP will focus on standalone mode only. Connected mode (cloud sync, multi-device access) is deferred to Phase 2 to maintain focus on core user experience and SDD methodology demonstration.

**"The Unexpected" Audience:**
This catch-all category recognizes that interesting tools find uses beyond their original intent. The project deliberately leaves room for educators, researchers, game designers, and artists to repurpose it. No specific features target this audience in MVP—it's about keeping the design flexible enough to accommodate unforeseen uses.

## Decision Context

**Dual Focus (Kids + Portfolio):**
Both focuses are core and non-negotiable. They reinforce each other: building something magical for kids makes the portfolio piece more compelling (shows genuine problem-solving, not checkbox exercises). The authenticity of "building for my kids" differentiates this from typical portfolio projects.

**SDD as Primary Technical Story:**
The documented journey—specs before code, RFCs for decisions, patterns applied deliberately—is more important than any single technology choice. Tech companies should see this as a demonstration of disciplined AI-assisted development that produces maintainable systems.

**Flexibility on Implementation:**
While the vision, problem, and users are stable, technical implementation details (tech stack, architecture patterns, deployment modes) may evolve as learning progresses. The brief anchors what matters (the "what" and "why") while staying flexible on the "how."
