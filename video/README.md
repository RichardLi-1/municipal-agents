# The demo video

A Remotion project, separate from the app (not in the root workspaces). 1920×1080 at
30 fps, exactly the length of the song, “Bass Brain” by Dresage x Hark Madley (2:26).
Kinetic type on the beat over footage of the real product, with a paper “return slip”
whose boxes tick as each hackathon challenge and judging criterion is shown working.

- `SCRIPT.md`: the script, scene by scene with sources (generated: `npm run script`).
- `storyboard.json`: the source of truth: every scene by bar, its words, shot, camera,
  tags, ticks and facts with their source pages.
- `music.json`: the song's grid (116 BPM, first downbeat 0.576 s, 70 bars) and sections.
  `src/timing.ts` turns bar.beat into frames, rounding each beat to its nearest frame.
- `footage.json`: the product clips and stills the video needs; `footage-marks.json`:
  when each recorded action happens.

## Commands

```sh
npm install
npm run studio      # Remotion Studio
npm run check       # storyboard rules: coverage, ticks, readable phrases, 2/3 footage
npm run preview     # half-res draft to $TMPDIR (or: npm run preview -- /path/out.mp4)
npm run render      # out/municipal-agents.mp4: h264 crf 16 + the song at 320 kb/s, in two halves with retries
npm run loop        # out/municipal-agents-loop.mp4: 60 s, silent, bars 5-34, for the showcase
npm run typecheck
npm run staff-server  # throwaway local app on :4199 for the staff clips (copies data/)
npm run record -- [https://municipal-agents.fly.dev] [--only=home,ask] [--shots]  # footage
npm run stills -- <dir> 12.3 27.3 f:4330                             # frames at cues
npm run sheet -- <video.mp4> <sheet.jpg>                             # one frame per bar
```

`npm run gen` (run by studio, preview, render and typecheck) collects what the video
shows from the repo into `src/generated/` and `public/docs/`: the budget book's pages
(pdftoppm), the UML PNGs, the readiness report's first page, real code excerpts, the
city config, CREDITS.md and the requirements. Missing inputs show as labelled stand-ins.

Clips are recorded at 2× device scale (3840×2160) so the camera can push in sharply; each
recorded action's time goes to `footage-marks.json`, and a scene can `align` a mark to a
beat, so re-recording never needs hand re-timing. `public/docs/tests.txt` holds the real
`npm test` output (results and summary lines) shown in the final drop.

Staff clips (draft, review, edit, reject, publish) are recorded only against the local
throwaway server, never the live site, so a fictional clerk never publishes anything real.
The recorder refuses a non-local staff URL.

## Not committed

The song (`public/music/bass-brain.mp3`), footage, generated images and renders are
gitignored. Put the song there yourself to render with music.

## Licences

- Remotion is free for individuals and for companies or teams of up to three people
  (Remotion License); this project qualifies. Larger teams need a company licence.
- Music: “Bass Brain”, Dresage x Hark Madley, credited on the end card.
- Inter, JetBrains Mono and Caveat: SIL Open Font License, via @remotion/google-fonts.
- The budget book pages are the Region of Waterloo's public 2026 Final Budget Book.
