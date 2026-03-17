# TonnetzViz: Complete Guide

A comprehensive reference for the TonnetzViz music visualizer — covering the app's features, the music theory behind the Tonnetz, and the mathematics that make it work.

---

## Table of Contents

1. [Overview](#overview)
2. [Quick Start](#quick-start)
3. [The Tonnetz: History & Theory](#the-tonnetz-history--theory)
4. [The 12-Tone Chromatic System](#the-12-tone-chromatic-system)
5. [Intervals](#intervals)
6. [The Standard Tonnetz \[3, 4, 5\]](#the-standard-tonnetz-3-4-5)
7. [Trichord Types](#trichord-types)
8. [The Grid Formula](#the-grid-formula)
9. [How Numbers Map to the Lattice](#how-numbers-map-to-the-lattice)
10. [Neo-Riemannian Transformations](#neo-riemannian-transformations)
11. [Features Reference](#features-reference)
12. [Tuning Systems](#tuning-systems)
13. [Input Methods](#input-methods)
14. [Architecture](#architecture)

---

## Overview

**TonnetzViz** is a web-based music visualizer that receives musical input and displays it in real time on a *Tonnetz* — a hexagonal lattice where each node is one of the 12 pitch classes and every edge represents a musical interval.

The project exists in two versions:

| Version | URL | Description |
|---------|-----|-------------|
| **Original** | `http://localhost:8083` | The core Tonnetz visualizer with MIDI, keyboard, and microphone input |
| **TonnetzMic** | `http://localhost:8084` | Extended version with Chicken Wire (dual) toggle, Trace Trajectory button, and trichord tooltips |

Both versions share the same JavaScript codebase (`js/` directory). The TonnetzMic version has its own `tonnetzmic/` folder that symlinks or copies the shared assets and provides a modified `index.html` with additional UI controls.

---

## Quick Start

### Requirements
- A modern web browser (Chrome, Firefox, Edge)
- Python 3 (for the local HTTP servers)
- Optional: a MIDI controller connected to your computer

### Running

Double-click **`start-servers.bat`** (Windows) to launch both servers:

```
Original:   http://localhost:8083
TonnetzMic: http://localhost:8084
```

Or manually:
```bash
python -m http.server 8083 --bind localhost --directory .
python -m http.server 8084 --bind localhost --directory tonnetzmic
```

Open either URL in your browser. The Tonnetz grid appears immediately. Play notes via MIDI, your computer keyboard, or the microphone to see them light up on the lattice.

---

## The Tonnetz: History & Theory

### Origins

The **Tonnetz** (German: "tone network") is a conceptual lattice that maps the relationships between musical pitches.

- **1739** — Leonhard Euler first described a spatial arrangement of pitches related by perfect fifths and major thirds in his *Tentamen novae theoriae musicae*.
- **1866–1880** — Hugo Riemann formalized the Tonnetz as a central tool in his theory of harmonic function, arranging tones in a two-dimensional grid where the axes represent consonant intervals (thirds and fifths).
- **1990s–present** — The **neo-Riemannian** revival (David Lewin, Richard Cohn, and others) re-examined the Tonnetz as a way to model chromatic harmony that does not rely on traditional key-based analysis. In this modern view, the Tonnetz is a torus — its edges wrap around because we work modulo 12 pitch classes.

### Core Idea

Every node is one of the 12 pitch classes. Every edge connects two pitches separated by a fixed interval. Because there are exactly 12 pitch classes and the intervals tile evenly, the lattice wraps around on itself in both directions, forming a **torus** (like the surface of a doughnut).

The crucial visual property: **any chord or collection of notes always produces the same geometric shape, regardless of transposition.** A C major triad and an F# major triad are both downward-pointing triangles on the standard Tonnetz. This makes harmonic relationships visible at a glance.

---

## The 12-Tone Chromatic System

Western music divides the octave into 12 equally spaced semitones. Because octaves are treated as equivalent (a C in any octave is "the same note"), we work with **pitch classes** numbered 0 through 11:

| Pitch class | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 |
|-------------|---|---|---|---|---|---|---|---|---|---|----|----|
| Note name   | C | C# | D | D# | E | F | F# | G | G# | A | A# | B |

All arithmetic on pitch classes is done **modulo 12**. Moving up by 3 semitones from pitch 10 (A#) gives `(10 + 3) % 12 = 1` (C#). This is the fundamental operation behind the Tonnetz: every interval is an addition mod 12.

In the code (`tonnetz.js`):
```javascript
var TONE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
```

---

## Intervals

An **interval** is the distance between two pitches, measured in semitones. Because we work mod 12, going up by `n` semitones is the same as going down by `12 - n` semitones. This gives us the concept of **interval class** — the smaller of the two complementary distances.

Here are all 12 directed intervals (0 through 11 semitones up):

| Semitones | Interval name | Abbreviation | Just ratio | Cents (ET) | Notes (from C) |
|-----------|--------------|--------------|------------|------------|-----------------|
| 0 | Unison | P1 | 1:1 | 0 | C → C |
| 1 | Minor 2nd (semitone) | m2 | 25:24 | 100 | C → C# |
| 2 | Major 2nd (whole tone) | M2 | 9:8 | 200 | C → D |
| 3 | Minor 3rd | m3 | 6:5 | 300 | C → D# |
| 4 | Major 3rd | M3 | 5:4 | 400 | C → E |
| 5 | Perfect 4th | P4 | 4:3 | 500 | C → F |
| 6 | Tritone | TT | 45:32 | 600 | C → F# |
| 7 | Perfect 5th | P5 | 3:2 | 700 | C → G |
| 8 | Minor 6th | m6 | 8:5 | 800 | C → G# |
| 9 | Major 6th | M6 | 5:3 | 900 | C → A |
| 10 | Minor 7th | m7 | 9:5 | 1000 | C → A# |
| 11 | Major 7th | M7 | 15:8 | 1100 | C → B |

Note that intervals 7–11 are the inversions (complements) of intervals 5–1 respectively. For example, a perfect 5th up (7 semitones) is the same pitch class as a perfect 4th down (5 semitones), since 7 + 5 = 12.

---

## The Standard Tonnetz [3, 4, 5]

The default Tonnetz uses the trichord type **[3, 4, 5]** — meaning the three edge directions of the hexagonal grid represent:

- **3 semitones** — minor 3rd
- **4 semitones** — major 3rd
- **5 semitones** — perfect 5th (since 3 + 4 = 7, and 12 - 7 = 5... but in the Tonnetz the third direction is the complement: going the "other way" around the triangle yields 12 - 3 - 4 = 5)

This is the canonical choice because:

1. **Triadic harmony**: the intervals 3 and 4 are exactly the minor and major third — the two intervals that build major and minor triads. Any three mutually-adjacent nodes form a triad.
2. **Visual clarity**: major triads appear as one orientation of triangle (downward-pointing in Riemannian layout), minor triads as the other (upward-pointing). Every triangular face of the lattice is a triad.
3. **Historical precedent**: this is the arrangement Euler and Riemann used — fifths along one axis, thirds along the other.
4. **Neo-Riemannian operations**: the P, L, and R transformations (see below) correspond to simple geometric moves — flipping a triangle across one of its three edges.

---

## Trichord Types

The Tonnetz is not limited to [3, 4, 5]. The app supports all **12 partitions** of the number 12 into an ordered triple [a, b, c] where `a + b + c = 12` and `a <= b <= c`. Each partition produces a different lattice where the edge directions represent different intervals.

The trichord selector (the table at the bottom of the screen) lets you choose any of these:

### Row 1

| Trichord | Intervals | Musical meaning | Grid character |
|----------|-----------|-----------------|----------------|
| **[1, 1, 10]** | semitone + semitone + minor 7th | Chromatic cluster — two adjacent semitones. Extremely compact; the lattice is dominated by the large 10-semitone gap. | Very uneven; most connections jump nearly an octave |
| **[1, 2, 9]** | semitone + whole tone + major 6th | Three notes from a chromatic scale fragment. The 9-semitone edge spans a major 6th. | Asymmetric; one very long and two very short intervals |
| **[1, 3, 8]** | semitone + minor 3rd + minor 6th | The Phrygian trichord — evokes the distinctive flat-2nd sound of the Phrygian mode. | Moderately uneven |
| **[1, 4, 7]** | semitone + major 3rd + perfect 5th | A major 7th chord fragment (root, 3rd, 7th with the 5th missing, or seen as 7th, root, 3rd). | One very small step beside two large ones |
| **[1, 5, 6]** | semitone + perfect 4th + tritone | A semitone paired with a 4th and a tritone. Found in Lydian-influenced harmonies. | The tritone creates symmetry-breaking |
| **[2, 2, 8]** | whole tone + whole tone + minor 6th | Whole-tone cluster — two consecutive whole tones. Subset of the whole-tone scale. | Very uneven; resembles [1,1,10] but wider |

### Row 2

| Trichord | Intervals | Musical meaning | Grid character |
|----------|-----------|-----------------|----------------|
| **[2, 3, 7]** | whole tone + minor 3rd + perfect 5th | The sus2 chord (e.g., C–D–G). Common in modern pop and modal music. | Fairly open; the P5 edge dominates |
| **[2, 4, 6]** | whole tone + major 3rd + tritone | A dominant 7th chord fragment (e.g., the 3rd, 5th, and b7th of a dom7). The tritone gives it tension. | Moderate asymmetry |
| **[2, 5, 5]** | whole tone + perfect 4th + perfect 4th | Quartal harmony — stacked 4ths (e.g., C–F–Bb or D–G–C). Two of the three intervals are equal, creating a more symmetric lattice. | Semi-regular; two equal edges |
| **[3, 4, 5]** | minor 3rd + major 3rd + perfect 5th | **The standard Tonnetz.** Major and minor triads. Every face is a triad. This is the default and the most musically rich choice. | Highly regular and balanced |
| **[3, 3, 6]** | minor 3rd + minor 3rd + tritone | The diminished triad (e.g., C–Eb–Gb). Contains two equal minor 3rds and a tritone. The diminished 7th chord occupies exactly 4 adjacent nodes. | Regular pairs; tritone axis of symmetry |
| **[4, 4, 4]** | major 3rd + major 3rd + major 3rd | The augmented triad (e.g., C–E–G#). All three intervals are equal, making the lattice perfectly symmetric. Only 4 distinct augmented triads exist, so the lattice has high redundancy. | Perfectly regular; 3-fold symmetric |

---

## The Grid Formula

The heart of the Tonnetz is a formula that assigns a pitch class to every position in the hexagonal grid. In `tonnetz.js` (line 632), the code computes:

```javascript
var da = this.intervalB - this.intervalA;
var dv = this.intervalA + this.intervalB;

// For each grid position (i, j):
((da * i - dv * j) % 12 + 144) % 12
```

### What `da` and `dv` mean

Given intervals `a` (intervalA) and `b` (intervalB):
- **`da = b - a`** — the *difference* between the two intervals. This is the pitch change when moving one step along the vertical axis (in Sonome layout) or horizontal axis (in Riemannian layout).
- **`dv = a + b`** — the *sum* of the two intervals, which equals `12 - c` where `c` is the third interval. This is the pitch change when moving along the other axis.

### Why `+ 144`?

JavaScript's `%` operator can return negative values for negative inputs. Adding 144 (= 12 x 12) before taking mod 12 guarantees a positive result. Since `i` and `j` range over at most a few dozen values, 144 is more than enough to offset any negative intermediate value.

### The two sub-lattices

The hexagonal grid is built from **two interleaved rectangular sub-lattices**. The code generates nodes in pairs:

```javascript
// Sub-lattice A: at grid positions (i, j)
addNode(((da*i - dv*j) % 12 + 144) % 12,
        W/2 - j*u,
        H/2 + i*yUnit);

// Sub-lattice B: offset by half a cell, shifted by intervalB
addNode(((da*i - dv*j + this.intervalB) % 12 + 144) % 12,
        W/2 - (j - 0.5)*u,
        H/2 + (i + 0.5)*yUnit);
```

Sub-lattice B is displaced by half a unit in both directions and has its pitch class shifted by `intervalB`. Together, the two sub-lattices produce the honeycomb pattern.

### Worked Example: Standard Tonnetz [3, 4, 5]

With `intervalA = 3`, `intervalB = 4`:
- `da = 4 - 3 = 1`
- `dv = 3 + 4 = 7`

At the center of the grid `(i=0, j=0)`:
- Sub-lattice A: `((1*0 - 7*0) % 12 + 144) % 12 = 0` → **C**
- Sub-lattice B: `((1*0 - 7*0 + 4) % 12 + 144) % 12 = 4` → **E**

Move one step in the vertical direction `(i=1, j=0)`:
- Sub-lattice A: `((1*1 - 7*0) % 12 + 144) % 12 = 1` → **C#**

Move one step in the horizontal direction `(i=0, j=1)`:
- Sub-lattice A: `((1*0 - 7*1) % 12 + 144) % 12 = ((-7) % 12 + 144) % 12 = 5` → **F**

You can verify: from C, moving to the right neighbor (along the `dv` direction) changes pitch by 7 semitones, which is a perfect 5th — exactly what the Tonnetz should show.

---

## How Numbers Map to the Lattice

### Hexagonal Geometry

Each node has exactly **6 neighbors**, connected by three pairs of opposing directions. In the **Sonome** layout, the hex directions relative to a node at the origin are:

| Direction | Displacement (x, y) | Interval |
|-----------|---------------------|----------|
| Upper-left | `(-0.5*sqrt(3)*u, -0.5*u)` | +a semitones |
| Upper-right | `(+0.5*sqrt(3)*u, -0.5*u)` | +b semitones |
| Up | `(0, -u)` | +(a+b) semitones |
| Lower-right | `(+0.5*sqrt(3)*u, +0.5*u)` | -a semitones (= +12-a) |
| Lower-left | `(-0.5*sqrt(3)*u, +0.5*u)` | -b semitones (= +12-b) |
| Down | `(0, +u)` | -(a+b) semitones (= +c) |

In the **Riemannian** layout, the coordinate system is rotated 90 degrees clockwise: `(x, y) → (-y, x)`. This makes the third interval (a+b) run horizontally instead of vertically.

### Unit distance

The unit distance `u` (the distance between adjacent nodes) is calculated from the window size:
```javascript
u = (W + H) / density;
```
where `density` defaults to 22. Larger density values produce a finer (more zoomed-out) grid. The user can adjust density with the mouse wheel or the `+`/`-` keys.

### Neighbor Relationships

From the code in `getNeighborXYDiff()` (line 523), given two pitch classes `t1` and `t2`, the function determines which direction the edge goes by checking `(t2 - t1 + 12) % 12` against the known intervals `a`, `b`, `a+b`, and their complements.

---

## Neo-Riemannian Transformations

The standard Tonnetz [3, 4, 5] supports three fundamental transformations from neo-Riemannian theory. Each one takes a triad (a triangular face) and produces a new triad by moving exactly one note by one or two semitones:

### P (Parallel)

Changes the quality of a triad without changing its root (in the classical sense):
- C major (C–E–G) → C minor (C–Eb–G): the 3rd moves down by 1 semitone
- C minor (C–Eb–G) → C major (C–E–G): the 3rd moves up by 1 semitone

**On the Tonnetz:** the triangle flips across its longest edge (the perfect 5th edge).

### L (Leading-tone exchange)

Moves the note *opposite* the minor 3rd edge:
- C major (C–E–G) → E minor (E–G–B): C moves up to B
- E minor (E–G–B) → C major (C–E–G): B moves down to C

**On the Tonnetz:** the triangle flips across its minor 3rd edge.

### R (Relative)

Moves the note opposite the major 3rd edge:
- C major (C–E–G) → A minor (A–C–E): G moves down to A (not actually — correction: A minor is A–C–E)
- A minor (A–C–E) → C major (C–E–G): A moves up to G...

More precisely:
- C major (C–E–G) → A minor (A–C–E): G drops to A? No. The relative transformation: C major → A minor. The shared notes are C and E; G moves to A.

**On the Tonnetz:** the triangle flips across its major 3rd edge.

### Compound Transformations

Sequences of P, L, R generate a rich set of harmonic progressions. For example:
- **PL** (P then L): C major → C minor → Ab major — a chromatic mediant relationship
- **PR** (P then R): C major → C minor → Eb major — relative major of the parallel minor
- **LR** repeated: generates a cycle through all 24 major/minor triads

These are visible on the Tonnetz as paths through adjacent triangles, making complex harmonic motion geometrically intuitive.

---

## Features Reference

### Trichord Selector

The table at the bottom of the screen lets you choose any of the 12 trichord types. Click a cell to reconfigure the lattice. The active selection is highlighted. In the TonnetzMic version, each cell has a tooltip describing the musical meaning.

### Layout

Two layout options are available under Appearance:

- **Riemannian** (default): the a+b interval (perfect 5th in standard) runs horizontally. The Euler/Riemann historical convention.
- **Sonome**: the a+b interval runs vertically. Matches the layout of the Sonome/AXiS-49 hexagonal MIDI controllers.

### Dual / Chicken Wire

Available in the **TonnetzMic** version. Clicking the **Chicken Wire** button swaps `intervalA` and `intervalB`:

```javascript
module.toggleDual = function() {
    var tmp = this.intervalA;
    this.intervalA = this.intervalB;
    this.intervalB = tmp;
    // ...
};
```

This produces the **dual graph** of the Tonnetz, sometimes called the "chicken wire" Tonnetz. In the standard case, swapping [3,4] to [4,3] means:
- **Normal [3,4,5]**: nodes are *pitch classes*, triangular faces are *triads*
- **Dual [4,3,5]**: the geometric roles reverse — what were triads become more prominent

### Trace Trajectory

When enabled (checkbox in original, button in TonnetzMic), the app draws a persistent path connecting the notes as you play them. Each new note is connected to the nearest instance of its pitch class on the grid. The trajectory is drawn as an orange line with dot markers.

- **Orange dots**: visited notes (most recent is brighter red)
- **Faded orange highlights**: pitch classes that have been visited remain subtly marked even when no longer sounding
- The trajectory resets when the trichord type changes or when trace is toggled off

### Unit Cell

Under Appearance > Show/hide, the **Unit cell** checkbox draws a parallelogram outlining the fundamental domain — the smallest region that tiles to produce the entire infinite Tonnetz. This is only drawn for the standard [3,4,5] trichord.

The unit cell contains all 12 pitch classes exactly once. Because the Tonnetz wraps around (it's a torus), tiling this parallelogram in both directions reproduces the full lattice.

### Ghost Tones

When a note is released, it enters a **ghost** state — drawn with a dimmer color for a configurable duration (default: 500ms). This provides visual persistence so you can see recently played notes fading away. Set to 0 to disable.

### Sustain

The sustain pedal (MIDI CC 64) keeps notes visually active after they are released, shown in a distinct "sustain" color. Sustain can be disabled via the Controls panel checkbox.

### Tone Names & Triad Names

Under Appearance, toggle visibility of:
- **Tone names**: note labels (C, C#, D, ...) at each node
- **Triad names**: labels on each triangular face showing the triad name (uppercase for major, lowercase for minor)

### Colour Schemes

Three built-in schemes: Default, Green on Black, and Apollo. You can clone any scheme to create a custom one. The colour scheme editor lets you configure background, node colors (for each state: OFF, GHOST, SUSTAIN, ON), and face colors (major/minor triads).

### Zoom

Use the mouse wheel or `+`/`-` keys to zoom in and out. This changes the `density` parameter (range 5–50, default 22).

### Panic & Restart

- **Panic**: immediately turns off all notes in all channels (MIDI + keyboard + microphone)
- **Restart**: reloads the page

---

## Tuning Systems

The built-in synthesizer supports three tuning systems, selectable under the Sound panel. All tunings reference **A4 = 440 Hz** and calculate frequencies relative to a configurable base note.

### Equal Temperament (ET)

The standard modern tuning. The octave is divided into 12 exactly equal semitones, each with a frequency ratio of `2^(1/12)`.

**Formula** (from `audio.js`):
```javascript
frequency = Math.pow(2, (pitch - 69) / 12) * 440;
```

where `pitch` is the MIDI note number (A4 = 69).

| Semitones from A4 | Ratio | Cents |
|--------------------|-------|-------|
| 0 | 1.0000 | 0 |
| 1 | 1.0595 | 100 |
| 2 | 1.1225 | 200 |
| 3 | 1.1892 | 300 |
| 4 | 1.2599 | 400 |
| 5 | 1.3348 | 500 |
| 6 | 1.4142 | 600 |
| 7 | 1.4983 | 700 |
| 8 | 1.5874 | 800 |
| 9 | 1.6818 | 900 |
| 10 | 1.7818 | 1000 |
| 11 | 1.8877 | 1100 |

### Pythagorean Tuning

All intervals are derived from stacking **pure perfect fifths** (3:2 ratio). This produces very pure fifths and fourths but relatively harsh thirds.

**Formula** (from `audio.js`):
```javascript
var tuned_freq = Math.pow(2, (base_tuning - 69) / 12) * 440;
var ratios = [1, 256/243, 9/8, 32/27, 81/64, 4/3, 729/512, 3/2, 128/81, 27/16, 16/9, 243/128];
var i = (pitch - base_tuning) % 12;
var oct = Math.floor((pitch - base_tuning) / 12);
frequency = Math.pow(2, oct) * ratios[i] * tuned_freq;
```

| Degree | Ratio | Decimal | Cents |
|--------|-------|---------|-------|
| Unison | 1/1 | 1.0000 | 0.0 |
| m2 | 256/243 | 1.0535 | 90.2 |
| M2 | 9/8 | 1.1250 | 203.9 |
| m3 | 32/27 | 1.1852 | 294.1 |
| M3 | 81/64 | 1.2656 | 407.8 |
| P4 | 4/3 | 1.3333 | 498.0 |
| TT | 729/512 | 1.4238 | 611.7 |
| P5 | 3/2 | 1.5000 | 702.0 |
| m6 | 128/81 | 1.5802 | 792.2 |
| M6 | 27/16 | 1.6875 | 905.9 |
| m7 | 16/9 | 1.7778 | 996.1 |
| M7 | 243/128 | 1.8984 | 1109.8 |

Notice the Pythagorean major 3rd (81/64 = 407.8 cents) is sharper than the ET major 3rd (400 cents), contributing to its characteristic brightness.

### Just Intonation

Intervals are tuned to **simple whole-number ratios**, producing the purest-sounding harmonies when playing in the base key but introducing problems when modulating to distant keys.

**Formula** (from `audio.js`):
```javascript
var tuned_freq = Math.pow(2, (base_tuning - 69) / 12) * 440;
var ratios = [1, 25/24, 9/8, 6/5, 5/4, 4/3, 45/32, 3/2, 8/5, 5/3, 9/5, 15/8];
var i = (pitch - base_tuning) % 12;
var oct = Math.floor((pitch - base_tuning) / 12);
frequency = Math.pow(2, oct) * ratios[i] * tuned_freq;
```

| Degree | Ratio | Decimal | Cents |
|--------|-------|---------|-------|
| Unison | 1/1 | 1.0000 | 0.0 |
| m2 | 25/24 | 1.0417 | 70.7 |
| M2 | 9/8 | 1.1250 | 203.9 |
| m3 | 6/5 | 1.2000 | 315.6 |
| M3 | 5/4 | 1.2500 | 386.3 |
| P4 | 4/3 | 1.3333 | 498.0 |
| TT | 45/32 | 1.4063 | 590.2 |
| P5 | 3/2 | 1.5000 | 702.0 |
| m6 | 8/5 | 1.6000 | 813.7 |
| M6 | 5/3 | 1.6667 | 884.4 |
| m7 | 9/5 | 1.8000 | 1017.6 |
| M7 | 15/8 | 1.8750 | 1088.3 |

The just major 3rd (5/4 = 386.3 cents) is flatter and more consonant than either the ET or Pythagorean versions.

### Base Note

The **base note** selector (under Sound) sets the reference pitch from which Pythagorean and Just Intonation ratios are calculated. It has no effect in Equal Temperament. MIDI note values 36–47 (C2–B2) are used, but the choice of octave only affects the internal calculation reference — the ratios apply to all octaves.

---

## Input Methods

### MIDI

TonnetzViz uses the **Web MIDI API** to receive input from any connected MIDI device. Under Controls:

- **MIDI port**: select from detected input devices
- **MIDI channel**: filter to a specific channel (1–16), all channels, or all except drums (channel 10)

Supported MIDI messages:
- **Note On** (0x90): lights up the note on the Tonnetz. Velocity 0 is treated as Note Off.
- **Note Off** (0x80): releases the note
- **Control Change** (0xB0):
  - CC 64 (Sustain pedal): values >= 64 activate sustain, < 64 release
  - CC 121 (All Controllers Off): releases sustain
  - CC 123 (All Notes Off): turns off all notes for that channel

MIDI input uses channels 0–15 directly. The keyboard uses channel 16 and the microphone uses channel 17 (internally numbered from 0).

### Computer Keyboard

Two layouts are available:

#### Piano Layout (default)

Maps the middle two rows of a QWERTY keyboard to a piano-style chromatic scale starting from middle C (MIDI 60):

```
  W  E     T  Y  U     O
 C# D#    F# G# A#    C#
A  S  D  F  G  H  J  K  L
C  D  E  F  G  A  B  C  D
```

The `Z` key also plays G# (as an alternate mapping).

#### Tonnetz-like (Riemann) Layout

Maps the entire keyboard to a hexagonal grid pattern mimicking the Tonnetz itself. The layout uses base pitch 72 (C5) and offsets are arranged so adjacent keys on the keyboard correspond to small intervals. Four rows of keys cover approximately 4 octaves:

```
Row 1 (numbers):  1   2   3   4   5   6   7   8   9   0
Row 2 (QWERTY):    Q   W   E   R   T   Y   U   I   O   P
Row 3 (home):        A   S   D   F   G   H   J   K   L
Row 4 (bottom):        Z   X   C   V   B   N   M
```

Each row is offset by 4 semitones from the previous, and each column step is 7 semitones. The `G` key at position (0,0) plays C5 (MIDI 72).

### Microphone

The microphone input uses **autocorrelation-based pitch detection** to identify the note being played/sung and light it up on the Tonnetz.

**How it works:**

1. Audio is captured via `getUserMedia()` with echo cancellation, noise suppression, and auto gain control all disabled for accuracy
2. A `ScriptProcessorNode` (buffer size 2048) captures raw audio samples
3. The autocorrelation algorithm finds the fundamental frequency:
   - Computes the autocorrelation function of the audio buffer
   - Finds the first dip (where correlation goes negative), then the highest peak after that dip
   - Uses parabolic interpolation for sub-sample accuracy
   - Reports both frequency and clarity (correlation peak / correlation at lag 0)
4. If clarity exceeds 0.7 and frequency is between 60 Hz (~B1) and 1500 Hz (~F#6), the detected pitch is converted to a MIDI note number and sent to the Tonnetz

**Controls:**
- **Input device**: select from available microphone inputs
- **Start/Stop microphone**: toggle audio capture
- **Test: play A4 into detector**: generates an internal 440 Hz sine wave to verify the detection pipeline works (runs for 3 seconds)

The status display shows the detected note name, frequency, and clarity value.

---

## Architecture

### File Structure

```
TonnetzViz/
├── index.html              # Main app HTML (original version)
├── start-servers.bat       # Launches both HTTP servers (ports 8083, 8084)
├── INSTRUCTIONS.md         # This file
├── css/
│   ├── bootstrap.min.css   # Bootstrap 3 framework
│   ├── font-awesome.min.css # Icon font
│   └── style.css           # App-specific styles
├── js/
│   ├── main.js             # App initialization, UI event wiring
│   ├── tonnetz.js          # Core Tonnetz module: grid computation, rendering
│   ├── audio.js            # Web Audio synthesizer, tuning systems
│   ├── midi.js             # Web MIDI API input handling
│   ├── keyboard.js         # Computer keyboard input mapping
│   ├── mic.js              # Microphone pitch detection
│   ├── colorscheme.js      # Colour scheme management, editor
│   ├── storage.js          # localStorage wrapper
│   ├── jquery.min.js       # jQuery library
│   ├── jquery.mousewheel.min.js # Mouse wheel plugin
│   └── bootstrap.min.js    # Bootstrap JS
├── color-schemes/
│   ├── default.js          # Default colour scheme
│   ├── greenonblack.js     # Green-on-black scheme
│   └── apollo.js           # Apollo scheme
├── images/
│   └── keyboard-layout.svg # Riemann keyboard layout diagram
├── tonnetzmic/             # TonnetzMic version
│   ├── index.html          # Modified HTML with Chicken Wire, Trace buttons, tooltips
│   ├── css/                # Shared CSS (symlinked or copied)
│   ├── js/                 # Shared JS (symlinked or copied)
│   ├── color-schemes/      # Shared colour schemes
│   └── images/             # Shared images
└── tests/                  # Test files
```

### Module Descriptions

| Module | Purpose |
|--------|---------|
| `tonnetz.js` | The core engine. Manages the pitch class grid, note states (OFF/GHOST/SUSTAIN/ON), rendering via Canvas 2D, and the hexagonal geometry. Exposes `noteOn()`, `noteOff()`, `sustainOn()`, `sustainOff()`, and `panic()`. |
| `audio.js` | Web Audio API synthesizer. Creates oscillator notes with configurable waveform (sine/square/sawtooth/triangle), implements three tuning systems, handles attack/release envelopes. |
| `midi.js` | Web MIDI API integration. Listens for MIDI messages on a selected port/channel and forwards note/sustain events to `tonnetz`. |
| `keyboard.js` | Maps computer keyboard events to MIDI-like note on/off messages. Supports piano and Riemann-style layouts. Uses channel 16. |
| `mic.js` | Microphone pitch detection via autocorrelation. Converts detected frequencies to MIDI note numbers and sends them to `tonnetz` on channel 17. |
| `colorscheme.js` | Manages colour schemes with a JSON-based editor. Handles dynamic stylesheet creation, custom scheme persistence via localStorage. |
| `storage.js` | Thin wrapper around `localStorage` with graceful fallback. |
| `main.js` | Initialization glue. Sets up all modules, wires UI controls to module methods, handles window events. |

### Data Flow

```
Input Sources                Processing              Rendering
─────────────              ──────────              ─────────
MIDI device ──→ midi.js ──→
Keyboard ────→ keyboard.js ─→  tonnetz.noteOn/Off()  ──→  tonnetz.draw()  ──→  Canvas 2D
Microphone ──→ mic.js ─────→      │                         │
                                  │                         ├─→ colorscheme.update()
                                  ↓                         ├─→ Fill triangular faces
                              audio.noteOn/Off()            ├─→ Draw edges
                                  │                         ├─→ Draw vertices
                                  ↓                         ├─→ Draw trajectory (if enabled)
                              Web Audio API                 └─→ Update CSS labels
                              (oscillators)
```

1. **Input** arrives from MIDI, keyboard, or microphone
2. Each input module calls `tonnetz.noteOn(channel, pitch)` or `tonnetz.noteOff(channel, pitch)`
3. `tonnetz` updates its internal tone state array (12 pitch classes, each tracking state per channel)
4. `tonnetz` also forwards to `audio.noteOn/Off()` for sound generation
5. `tonnetz.draw()` renders the current state to the canvas, throttled to at most once per 30ms
6. The colour scheme module provides colors for each state; dynamic CSS stylesheets control label colors

---

*TonnetzViz was created by Ondrej Cifka in 2016, with contributions by Achille Aknin and Jesus Martinez-Blanco. Source code: [GitHub](https://github.com/cifkao/tonnetz-viz)*
