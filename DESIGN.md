# DESIGN.md

## Theme

Black vinyl and bright plastic on a white table. The mood lives in shape, scale
and motion — round, huge, physical — not in a tinted surface.

**Light**, because the scene is a kitchen table in afternoon sun. Dark would put
us back in the pro-audio register we are leaving.

## Color

Strategy: **Restrained.** Chrome is achromatic; the album art supplies every
other colour on screen. One accent, reserved for the primary action.

| Token | OKLCH | Role |
| --- | --- | --- |
| `--bg` | `oklch(1 0 0)` | Page. Literal white, no hidden warmth. |
| `--ink` | `oklch(0.18 0 0)` | Type, vinyl. ~15:1 on bg. |
| `--ink-soft` | `oklch(0.46 0 0)` | Secondary type and placeholders. ~5.6:1 on bg. |
| `--line` | `oklch(0.90 0 0)` | Hairlines. |
| `--surface` | `oklch(0.965 0 0)` | Fader track, input wells. |
| `--go` | `oklch(0.72 0.16 170)` | The Mix button, Auto when on, focus ring. |
| `--go-deep` | `oklch(0.52 0.13 170)` | Pressed edge, focus ring. |

`--go` is a fill only, never text on white (2.4:1). Ink on `--go` is ~8:1.

## Typography

One family: the system sans stack. No novelty face — the toy register is carried
by scale and weight, which is more distinctive than reaching for a rounded kids
font.

Four sizes only: `0.8rem` (meta), `1rem` (body), `1.25rem` (song title),
`clamp(1.5rem, 6vw, 2.25rem)` (the Mix button). Two weights: 500 and 800.

## Shape and depth

- Radius is either `999px` (pills, discs) or `1.25rem` (wells). Nothing between.
- One depth device: a solid bottom edge on the Mix button that compresses 3px on
  press, and a cast shadow on the fader knob. No decorative shadows anywhere.
- No cards, no panels, no borders around groups. Whitespace does the grouping.

## Motion

- Discs rotate `8s linear infinite`, `animation-play-state` bound to playback.
- Volume is size: discs scale `0.72 → 1` and fade `0.5 → 1` with their gain.
- Transitions 180ms `cubic-bezier(0.22, 1, 0.36, 1)` (ease-out-quart).
- Reduced motion: no rotation, no scale transition. Playing state stays legible
  because a paused disc always carries a play triangle.

## Layout

Single centred column, max 44rem, vertical flow. Records sit in a 2-up row
because the fader beneath them depends on that spatial mapping; that row never
stacks, at any width.
