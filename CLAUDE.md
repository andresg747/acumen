# halketon

Next.js 16 + React 19 app that wraps Google Drive (OAuth + file ops), scoped to a root-level `ACUMEN` folder. Plain CSS with CSS variables — no Tailwind, no component library. Single-user / hackathon-scope by design.

## Design Context

### Users
A small group of operators dropping operational artefacts — receipts, invoices, statements, photos, spreadsheets — into a shared `ACUMEN` folder on Google Drive. They want the file in Drive and they want to move on; the app is a fast conduit, not a destination. The upload flow is in Spanish, so design and copy should treat Spanish as a first-class language (mind string lengths — Spanish runs ~20–30% longer than English; ensure buttons, hints, and labels don't truncate or wrap awkwardly).

### Brand Personality
Sleek, minimalistic, simple, modern. Three words: **calm, precise, modern**. The interface should feel like a well-made tool — confident, unfussy, and quiet. It should evoke trust and competence, never excitement or playfulness. No emoji, no exclamation points, no marketing voice.

### Aesthetic Direction
- **Visual tone**: minimalist, neutral, system-native. The eye should land on content, not chrome.
- **Reference points**: Linear, Vercel dashboard, Apple system UI, Stripe Dashboard, Raycast — restrained typography, generous whitespace, monochrome palettes with a single accent, hairline borders, subtle radii.
- **Anti-references**: skeuomorphism, heavy gradients, glassmorphism, AI-generic "dashboard with neon accents", busy illustrations, marketing-landing-page hero treatments. Nothing should look like a template.
- **Theme**: both light and dark mode are first-class, driven by `prefers-color-scheme` via the existing CSS variables in `app/globals.css`. Never hardcode colours — always go through the tokens (`--bg`, `--fg`, `--muted`, `--border`, `--accent`, `--card`, `--danger`).
- **Typography**: system font stack (already in place). One typeface, two or three sizes, two weights (regular and semibold). Avoid introducing webfonts unless there's a real reason.
- **Colour**: neutral greys do almost all the work. The blue accent (`--accent`) is used sparingly — primary CTAs, focus rings, the active state of a dropzone — never as decoration. Success green and `--danger` red appear only on the relevant state.
- **Spacing & radii**: 8px-rhythm spacing, small radii (6–8px on controls, 8–12px on cards), 1px hairline borders. No drop shadows unless they communicate elevation that actually matters.
- **Motion**: short (≤150ms), purposeful, ease-out. Hover/focus transitions, not entrance choreography. Respect `prefers-reduced-motion`.

### Design Principles
1. **Restraint over ornament.** If an element doesn't earn its place by helping the user finish their task, remove it. The best change is often a deletion.
2. **Quiet by default, expressive on interaction.** Colour, motion, and emphasis appear at the moment of user intent (focus, hover, drag-over, success, error) — not as ambient decoration.
3. **System-native first.** Lean on system fonts, `color-scheme`, native form controls, and the existing CSS tokens. Don't reinvent what the platform gives you for free.
4. **One accent, sparingly used.** A single blue does primary actions and focus. If you reach for a second accent colour, reconsider.
5. **Both themes are first-class.** Every change must look intentional in light and dark mode. Never hardcode hex values in component styles — read from the tokens in `app/globals.css`.
6. **Spanish-aware layout.** Buttons and labels must hold longer Spanish copy without truncation, wrap, or layout shift. Test the Spanish string, not just the English one.
