# Plan: Add Playback Timestamp & Progress Bar

## Context
During audio file playback there's no visual indication of where you are in the song. You can't tell if you're 30 seconds in or 3 minutes in. We need a timestamp display (e.g. "1:23 / 3:45") and a progress bar that updates in real-time during playback and replay.

## Files to Modify

### 1. `js/mic.js` — Track playback time

**Add state variable:**
- `var fileStartTime = 0;` — captures `audioCtx.currentTime` when playback begins

**In `startFile()`** (after `fileSourceNode.start()`):
- Record `fileStartTime = audioCtx.currentTime`
- Initialize the progress bar and timestamp display

**In `detect()` loop** (runs every animation frame, already active during playback):
- When `fileActive`, calculate `elapsed = audioCtx.currentTime - fileStartTime`
- Update `#audiofile-time` text to `formatTime(elapsed) + ' / ' + formatTime(fileAudioBuffer.duration)`
- Update `#audiofile-progress-fill` width to `(elapsed / fileAudioBuffer.duration) * 100 + '%'`

**Add helper:**
- `formatTime(seconds)` — returns "m:ss" string (e.g. "1:23")

**In `stopFile()`:**
- If playback completed naturally (`fileSourceNode.onended`), freeze the display at final time
- If stopped manually, reset the display

### 2. `index.html` — Add UI elements

After the `#audiofile-play` button (line 206) and before the speaker checkbox, add:

```html
<div id="audiofile-progress" style="display:none; margin-top:8px;">
  <div style="display:flex; align-items:center; gap:8px;">
    <span id="audiofile-time" style="font-family:monospace; font-size:13px; white-space:nowrap;">0:00 / 0:00</span>
    <div id="audiofile-progress-bar" style="flex:1; height:6px; background:#444; border-radius:3px; overflow:hidden;">
      <div id="audiofile-progress-fill" style="height:100%; width:0%; background:#5bc0de; transition:width 0.3s;"></div>
    </div>
  </div>
</div>
```

### 3. `js/mic.js` — Show/hide progress bar

- `startFile()`: `$('#audiofile-progress').show()`
- `stopFile()`: `$('#audiofile-progress').hide()` (or leave visible after natural end)

## Behavior

- **During playback:** Progress bar fills left-to-right, timestamp counts up: "0:45 / 3:21"
- **On natural end:** Progress stays at 100%, showing full duration
- **On manual stop:** Progress hides, resets for next play
- **On replay:** Resets to 0 and starts again
- **When no file loaded:** Progress bar is hidden (`display:none`)

## Verification
1. Load an audio file → progress bar hidden
2. Hit Play → progress bar appears, timestamp counts up smoothly
3. Let it finish → shows full duration at 100%
4. Hit Replay → resets and counts from 0 again
5. Hit Stop mid-song → progress hides cleanly

---

# Bug: Key Detection Shows Minor Instead of Major

## Problem
Even with a 1.05 major bias, the key display shows "A minor" for Whitney Houston's "I Will Always Love You" (key of A major) and "G minor" for Bohemian Rhapsody (key of Bb major). Both are relative-minor misidentifications.

## Mystery: The Math Says Major Should Win
We computed the actual Pearson correlations for the Whitney Houston histogram:
```
Histogram: C:12, C#:25, D:4, D#:2, E:23, F:4, F#:17, G:3, G#:22, A:68, A#:2, B:17

A major raw correlation:  0.8328
A minor raw correlation:  0.6420
A major * 1.05 bias:      0.8744

All 24 keys ranked:
  A major:   0.8328   <-- clear winner
  A minor:   0.6420
  F# minor:  0.5975
  E major:   0.4898
  ...
```
A major wins by a huge margin (0.83 vs 0.64). The 1.05 bias makes it even wider. Yet the UI still shows "A minor". This means either:

1. **Browser caching** — the old keyAnalysis.js (without the 1.05 bias) was still being served. User should do Ctrl+Shift+R hard refresh.
2. **The histogram in the live app differs from the CSV export** — the CSV records notes from `mic.js` detect(), but `keyAnalysis.recordPitch()` is called from the same place, so they should match. However, worth adding debug logging to verify the actual histogram being analyzed.
3. **The key stability logic is locking in an early wrong answer** — the first few seconds might detect A minor (before enough data accumulates), and then the stability threshold (`KEY_STABILITY_THRESHOLD = 3`) keeps it displayed even after A major starts winning. The `!displayedKey` fallback (line 145) means the FIRST key above confidence threshold gets displayed immediately without waiting for stability. If that first detection is A minor, subsequent A major wins need 3 consecutive cycles to overtake it.
4. **Possible interaction with auto-trichord** — the trichord selection changes the tonnetz layout which redraws, but shouldn't affect key analysis. However, worth investigating if there's any coupling.

## Debugging Steps (Next Session)

### Step 1: Rule out browser caching
- Hard refresh (Ctrl+Shift+R) before testing
- Or add a cache-busting query string to the script tag temporarily: `<script src="js/keyAnalysis.js?v=2">`

### Step 2: Add debug logging to analyze()
Temporarily add to the `analyze()` function after building the histogram:
```javascript
console.log('HIST:', histogram.join(','), 'BEST:', bestKey.root, bestKey.mode, bestKey.confidence.toFixed(4));
if (displayedKey) console.log('DISPLAYED:', displayedKey.root, displayedKey.mode);
console.log('CANDIDATE:', candidateKey ? candidateKey.root + ' ' + candidateKey.mode + ' x' + candidateCount : 'none');
```
This will show in the browser console exactly what the algorithm is computing each second and whether the stability logic is the bottleneck.

### Step 3: Check if stability logic is the culprit
The current stability logic (added this session) may be locking in early wrong answers:
```javascript
// Current logic (keyAnalysis.js lines 135-148):
if (candidateCount >= KEY_STABILITY_THRESHOLD || !displayedKey) {
    displayedKey = bestKey;
}
```
The `!displayedKey` clause means the very first confident detection gets displayed immediately. If A minor wins on the first analysis cycle (before enough data), it becomes `displayedKey`, and then A major needs to win 3 consecutive cycles to replace it.

**Possible fix:** Remove the `!displayedKey` shortcut — always require stability:
```javascript
if (candidateCount >= KEY_STABILITY_THRESHOLD) {
    displayedKey = bestKey;
}
```
This means the display stays on "Listening..." for 3+ seconds but the first key shown is more likely correct.

### Step 4: Consider larger bias or alternative profiles
If the raw correlation truly favors minor in the live app (different from our offline calculation):

**Option A: Increase bias to 1.10 or 1.15**
Simple but hacky. Would break detection of legitimately minor keys.

**Option B: Use Temperley profiles instead of Krumhansl-Kessler**
The Temperley (2001) profiles were specifically designed to better distinguish relative major/minor:
```javascript
var MAJOR_PROFILE = [5.0, 2.0, 3.5, 2.0, 4.5, 4.0, 2.0, 4.5, 2.0, 3.5, 1.5, 4.0];
var MINOR_PROFILE = [5.0, 2.0, 3.5, 4.5, 2.0, 4.0, 2.0, 4.5, 3.5, 2.0, 1.5, 4.0];
```
These are more "binary" — scale tones get high weight, non-scale tones get low weight. The critical difference: the minor 3rd position (index 3) is 4.5 in minor but only 2.0 in major, while major 3rd (index 4) is 4.5 in major but only 2.0 in minor. This creates much stronger differentiation.

**Option C: Post-hoc 3rd-degree check**
After finding the best key, check if the data supports major vs minor by comparing the 3rd scale degree:
```javascript
// After finding bestKey, if it's minor, check if major 3rd is actually stronger
if (bestKey.mode === 'minor') {
    var minor3rd = histogram[(bestKey.root + 3) % 12]; // e.g., C for A minor
    var major3rd = histogram[(bestKey.root + 4) % 12]; // e.g., C# for A major
    if (major3rd > minor3rd * 1.5) {
        // Evidence strongly favors major — flip it
        bestKey = { root: bestKey.root, mode: 'major', confidence: bestKey.confidence };
    }
}
```
For the Whitney data: C#=25 vs C=12, ratio=2.08 > 1.5 → would flip to A major.
For the Bohemian Rhapsody data: D=22 vs D#=28 for Bb, so it wouldn't flip (which is arguably correct since the data really does lean G minor).

**Option D: Duration-weighted histogram**
Currently every pitch detection counts as 1 regardless of duration. A sustained A4 for 3 seconds counts the same as a 120ms blip. Weighting by duration would give more influence to sustained melodic notes vs brief bass notes. Requires changing `recordPitch` to track timing:
```javascript
// In keyAnalysis.js:
module.recordPitch = function(midiNote) {
    pitchHistory.push({ pitchClass: midiNote % 12, timestamp: Date.now() });
};
module.recordPitchOff = function() {
    // Could retroactively weight the last entry by its duration
};
```

## Test Songs & Expected Keys
| Song | Key | Notes |
|------|-----|-------|
| I Will Always Love You (Whitney Houston) | A major | Currently shows A minor |
| Bohemian Rhapsody (Queen) | Bb major | Shows G minor (relative minor) |
| Let It Be (Beatles) | C major | Good test — no sharps/flats |
| Someone Like You (Adele) | A major | Another A major test |
| Hallelujah (Leonard Cohen) | C major | Simple key, good baseline |

## Summary of All Changes Made This Session
For reference, here's everything that was changed in `keyAnalysis.js` and `mic.js` during the current session:

### keyAnalysis.js
- `NOTE_NAMES` → split into `MAJOR_KEY_NAMES` and `MINOR_KEY_NAMES` (enharmonic naming)
- Added `TRICHORD_COOLDOWN_FILE = 30000` (30s cooldown for file playback vs 5s for mic)
- Added `KEY_STABILITY_THRESHOLD = 3` (consecutive wins before changing displayed key)
- Added state: `accumulateMode`, `candidateKey`, `candidateCount`, `displayedKey`
- `module.setAccumulateMode(enabled)` — public method
- `pruneHistory()` — skips pruning when `accumulateMode` is true
- `analyze()` — minimum threshold raised from 5 to 20 pitches
- `analyze()` — major correlation gets `* 1.05` bias
- `analyze()` — key stability logic (tracks candidate, promotes after consecutive wins)
- `analyze()` — uses `displayedKey` for highlights/display instead of raw `bestKey`
- `autoSelectTrichord()` — uses `TRICHORD_COOLDOWN_FILE` when in accumulate mode
- `updateDisplay()` — picks `MAJOR_KEY_NAMES` or `MINOR_KEY_NAMES` based on mode
- `start()`/`stop()` — reset all new state variables

### mic.js
- `startFile()` — calls `keyAnalysis.setAccumulateMode(true)` before `keyAnalysis.start()`
- `stopFile()` — calls `keyAnalysis.setAccumulateMode(false)` before `keyAnalysis.stop()`
- `autocorrelate()` — RMS threshold lowered to 0.001 for file playback (vs 0.01 for mic)
- `detect()` — clarity threshold lowered to 0.5 for file playback (vs 0.7 for mic)
- `detect()` — debug bar shows RMS threshold value: `(thr:0.001)` or `(thr:0.01)`
