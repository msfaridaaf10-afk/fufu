# The Year We Build Together

An interactive campus by Farida Ibrahim — a small browser game for a school president campaign.

Explore a night-time campus, find the four hidden student ideas, and switch the whole campus back on.

## Play

Open `index.html` in any modern browser (desktop or phone). No build step and no image files: every visual is drawn with canvas, CSS and SVG code.

To host it, upload `index.html`, `style.css` and `game.js` to any static host (GitHub Pages, Netlify, school web space).

## Controls

- **Desktop:** WASD or arrow keys to walk, or click anywhere to walk there. `M` mutes sound.
- **Phone/tablet:** tap anywhere to walk there; hold and drag to keep moving.
- Walk up to a glowing fragment to discover it, then collect it.
- Top-right buttons: how to play, sound on/off, restart.

## The four ideas

| Location | Idea |
| --- | --- |
| The Courtyard | Events people actually want |
| The Auditorium (stage door) | More shared traditions and memories |
| The Sports Field | Ideas from every grade |
| The Commons | Listening, speaking up, and working with the school |

To change the wording, edit the `FRAGS` list near the top of `game.js`. The closing note lives in `index.html` (`.fin-note`).
