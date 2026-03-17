# Feature Ideas

Brainstormed with the live-vocal-songwriting use case in mind. None of these are commitments.

---

## Harmonic Analysis

### Chord Detection & Display
Show the detected chord name (e.g., "Am7", "Cmaj") in a persistent overlay as you sing intervals or arpeggiate. The geometry is already there in the triangular faces — this would just surface it as text. Could include a confidence meter since vocal pitch is messy.

### Scale/Key Estimation
After ~10–20 seconds of singing, estimate the most likely key and display it (e.g., "Probably D minor"). Highlight the 7 diatonic scale tones on the lattice with a subtle ring or glow so you can see which notes you haven't explored yet.

### Harmonic Gravity Map
Heat-map overlay showing which pitch classes you've spent the most time on. Over a session, this reveals your tonal center and tendencies. Could fade over a configurable window (last 30s, last 2min, entire session).

---

## Session & Recording

### Session Timeline
A horizontal strip at the top or bottom showing a scrolling timeline of detected notes as colored blocks (piano-roll style but compressed). Lets you see the shape of your melody over time, not just the current moment.

### Loop Markers
Mark a section of your session as a loop. The Tonnetz could replay the highlighted path on the lattice while you sing new material over it, helping you find harmonies against your own earlier phrase.

### Export Session Data
Save the session as a MIDI file or a CSV of (timestamp, pitch, duration, clarity). You could import this into a DAW to build on what you improvised. Even a simple copy-to-clipboard of the note sequence would be useful.

### Audio Recording
Record the raw microphone audio alongside the pitch data. Export as WAV so you have both the performance and the analysis together.

---

## Visual Aids for Composition

### Interval Ruler
When two or more notes are active, show the interval names along the edges connecting them (e.g., "P5", "m3"). Useful for ear training and understanding what you're singing relative to the last note.

### Suggested Next Notes
Given the current active notes, highlight nodes that would form common chord completions. If you're holding C and E, gently pulse G (major), G# (augmented), and Eb area to suggest where you might go. Toggle-able so it's not distracting.

### Path Replay
After trace trajectory captures a melodic path, let you replay it visually (animated dot traversing the path) at adjustable speed. No audio, just the visual — so you can study the geometry of what you just sang.

### Tonnetz Regions
Shade background regions to show "harmonic neighborhoods" — e.g., all triads reachable by 1–2 neo-Riemannian moves from the current chord. Shows you what's harmonically "close" vs. "far" from where you are.

---

## Mic & Detection Improvements

### Polyphonic Detection (FFT Peaks)
The current autocorrelation detects one pitch. A parallel FFT peak-picker could detect sung harmonics or two-note intervals (humming a drone while whistling a melody). Hard problem but even rough results would be interesting.

### Adaptive Clarity Threshold
The fixed 0.7 clarity threshold works for clean vocals but fails for breathy or raspy singing. An auto-calibration mode that samples your voice for 5 seconds and sets the threshold accordingly.

### Pitch Stability Indicator
Show whether your pitch is sharp, flat, or centered on the detected note (a small +/- cents readout near the note). Doubles as a vocal tuning aid.

### Onset Detection
Distinguish between sustained notes and new attacks. Currently a held note just stays lit — onset detection could trigger a brief flash or pulse on re-articulation, making rhythmic patterns visible.

---

## Collaboration & Sharing

### Shareable Snapshots
Capture the current Tonnetz state (active notes, trichord, color scheme, trajectory) as a PNG or SVG with a click. Useful for sharing "look at this chord voicing" moments.

### Split-Screen Dual Input
Two Tonnetz grids side by side, each receiving from a different MIDI channel or input source. One for your voice, one for a keyboard/guitar. See how two parts relate geometrically.

### WebRTC Jam Mode
Connect two browsers over WebRTC. Each person's detected pitch appears in a different color on a shared Tonnetz. Remote vocal duet visualization.

---

## Quality of Life

### Fullscreen Mode
Hide all UI except the Tonnetz canvas. Press `F` or `Escape` to toggle. The trichord selector and nav bar disappear, giving you a clean visual for performance or projection.

### Dark/Light Toggle
One-click swap between a dark background scheme and a light one without going through the color scheme editor.

### Preset Scenes
Save the full app state (trichord, color scheme, layout, zoom, trace on/off, tuning) as a named preset. Quick-switch between "practice", "performance", "teaching" configurations.

### Mobile Touch Input
Tap nodes on the Tonnetz directly to play them on mobile. The canvas is already there — just needs touch event handlers mapped to the nearest node's pitch.
