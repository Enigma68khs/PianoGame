# songs-private — local-only songs

Charts you put here (`*.json`) are **never committed and never deployed**: they are git-ignored, they are only
copied by `npm run dev`, and the production build / GitHub Pages export neither contain nor load them.
They show up on the song menu with a **PRIVATE** badge — on this computer only.

Use this for songs you transcribed yourself and are not allowed (or do not want) to publish. If a song is
protected by copyright, do not publish it (public repo / Pages) without the rights holders' permission.

## How
1. Copy `_example.json.template` to `my-song.json` (names starting with `_` are ignored) and edit it.
2. `npm run dev` (it syncs the folder on start; run `npm run songs:sync` and reload to pick up edits later).
3. The card appears at the end of the song list. A chart with an empty `melody` shows as a disabled card, and
   anything wrong in a chart is listed in a yellow box under the song description.

## File format
```jsonc
{
  "id": "my-song",            // letters/digits/hyphens; becomes "private-my-song"
  "title": "My Song",
  "composer": "me",
  "bpm": 100,                 // quarter-note tempo
  "unit": 0.5,                // beats per token length unit (0.5 = an eighth note)
  "level": 2,                 // optional, 1-3 stars on the card
  "theme": "stars",           // optional background: moon | dawn | lake | stars | snow
  "holdMinBeats": 1.5,        // notes this long (in beats) or longer become Hold tiles. Default 0.75, which makes
                              // every quarter note a Hold — raise it (e.g. 1.5) if you want mostly taps
  "melody": ["E4:2", "G4:2", "R:2", "C5+E5:4"],
  "accompaniment": []         // optional auto-played notes: "C3@0:8" = pitch@startUnit:lengthUnits
}
```
### Melody tokens (in playing order)
| Token | Meaning |
|---|---|
| `E4:2` | note E4 for 2 units — **lane is chosen automatically** from the pitch |
| `E4:2:3` | the same, forced onto lane 3 (0=A, 1=S, 2=K, 3=L) |
| `C4+E4+G4:4` | a chord (2–4 notes at once, each on its own lane) |
| `R:2` | a rest of 2 units |

Pitch names: `C4` is middle C, sharps `F#4`, flats `Bb3`. Automatic lanes spread the song's distinct pitches
evenly over the four keys (lowest pitch → A, highest → L), so a pitch always sits on the same key.
Aim for 30–60 seconds at Normal tempo.
