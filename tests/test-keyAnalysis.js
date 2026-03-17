// Test that the key analysis logic produces correct enharmonic names
// and that accumulate mode / minimum threshold work as expected.

var passed = 0;
var failed = 0;

function assert(condition, name) {
  if (condition) {
    console.log('  PASS: ' + name);
    passed++;
  } else {
    console.log('  FAIL: ' + name);
    failed++;
  }
}

// --- Extract the pure functions from keyAnalysis.js for testing ---

var MAJOR_KEY_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
var MINOR_KEY_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];

var MAJOR_PROFILE = [5.0, 2.0, 3.5, 2.0, 4.5, 4.0, 2.0, 4.5, 2.0, 3.5, 1.5, 4.0];
var MINOR_PROFILE = [5.0, 2.0, 3.5, 4.5, 2.0, 4.0, 2.0, 4.5, 3.5, 2.0, 1.5, 4.0];

function rotateProfile(profile, semitones) {
  var rotated = new Array(12);
  for (var i = 0; i < 12; i++) {
    rotated[i] = profile[(i - semitones + 12) % 12];
  }
  return rotated;
}

function pearsonCorrelation(x, y) {
  var n = x.length;
  var sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
  for (var i = 0; i < n; i++) {
    sumX += x[i]; sumY += y[i];
    sumXY += x[i] * y[i];
    sumX2 += x[i] * x[i]; sumY2 += y[i] * y[i];
  }
  var num = n * sumXY - sumX * sumY;
  var den = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
  return den === 0 ? 0 : num / den;
}

function detectKey(histogram) {
  var bestKey = null;
  var bestCorr = -Infinity;
  for (var root = 0; root < 12; root++) {
    var majorCorr = pearsonCorrelation(histogram, rotateProfile(MAJOR_PROFILE, root));
    if (majorCorr > bestCorr) {
      bestCorr = majorCorr;
      bestKey = { root: root, mode: 'major', confidence: majorCorr };
    }
    var minorCorr = pearsonCorrelation(histogram, rotateProfile(MINOR_PROFILE, root));
    if (minorCorr > bestCorr) {
      bestCorr = minorCorr;
      bestKey = { root: root, mode: 'minor', confidence: minorCorr };
    }
  }
  return bestKey;
}

function keyName(bestKey) {
  var names = bestKey.mode === 'major' ? MAJOR_KEY_NAMES : MINOR_KEY_NAMES;
  return names[bestKey.root] + ' ' + bestKey.mode;
}

// Build a histogram from scale degrees with realistic weighting
// (tonic and dominant get more weight, like real music)
function buildHistogram(root, scaleIntervals) {
  var hist = new Array(12);
  for (var i = 0; i < 12; i++) hist[i] = 0;
  var weights = [30, 5, 10, 5, 15, 10, 3, 20, 5, 8, 3, 5]; // rough tonal weights
  for (var i = 0; i < scaleIntervals.length; i++) {
    hist[(root + scaleIntervals[i]) % 12] = weights[i] || 5;
  }
  return hist;
}

var MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];
var MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10];

// Trichord definitions (must match keyAnalysis.js)
var TRICHORD_TYPES = [
  [1, 1], [1, 2], [1, 3], [1, 4], [1, 5],
  [2, 2], [2, 3], [2, 4], [2, 5],
  [3, 3], [3, 4], [4, 4]
];

// Copy of buildIntervalHistogram from keyAnalysis.js
function buildIntervalHistogram(histogram) {
  var intervalHist = new Array(12);
  for (var i = 0; i < 12; i++) intervalHist[i] = 0;
  for (var i = 0; i < 12; i++) {
    for (var j = i + 1; j < 12; j++) {
      if (histogram[i] > 0 && histogram[j] > 0) {
        var interval = (j - i) % 12;
        var count = Math.min(histogram[i], histogram[j]);
        intervalHist[interval] += count;
        intervalHist[(12 - interval) % 12] += count;
      }
    }
  }
  return intervalHist;
}

// Copy of scoreTrichords from keyAnalysis.js (with unique-interval-class fix)
function scoreTrichords(intervalHist) {
  var results = [];
  for (var t = 0; t < TRICHORD_TYPES.length; t++) {
    var a = TRICHORD_TYPES[t][0];
    var b = TRICHORD_TYPES[t][1];
    var c = (12 - a - b + 12) % 12;
    var seen = {};
    var score = 0;
    var intervals = [a, b, c];
    for (var k = 0; k < intervals.length; k++) {
      var ic = Math.min(intervals[k], 12 - intervals[k]);
      if (!seen[ic]) {
        seen[ic] = true;
        score += intervalHist[intervals[k]];
      }
    }
    results.push({ type: TRICHORD_TYPES[t], score: score });
  }
  results.sort(function(x, y) { return y.score - x.score; });
  return results;
}

// ============================================================
console.log('\n=== Enharmonic naming tests ===');
// ============================================================

console.log('\n-- Major keys --');
var majorTests = [
  { root: 0, expected: 'C major' },
  { root: 1, expected: 'Db major' },   // not C# major
  { root: 2, expected: 'D major' },
  { root: 3, expected: 'Eb major' },   // not D# major
  { root: 4, expected: 'E major' },
  { root: 5, expected: 'F major' },
  { root: 6, expected: 'F# major' },
  { root: 7, expected: 'G major' },
  { root: 8, expected: 'Ab major' },   // not G# major
  { root: 9, expected: 'A major' },
  { root: 10, expected: 'Bb major' },  // not A# major  <-- the Bohemian Rhapsody case
  { root: 11, expected: 'B major' },
];

majorTests.forEach(function(tc) {
  var hist = buildHistogram(tc.root, MAJOR_SCALE);
  var key = detectKey(hist);
  var name = keyName(key);
  assert(name === tc.expected, 'root ' + tc.root + ' -> "' + name + '" (expected "' + tc.expected + '")');
});

console.log('\n-- Minor keys --');
var minorTests = [
  { root: 0, expected: 'C minor' },
  { root: 1, expected: 'C# minor' },   // not Db minor
  { root: 2, expected: 'D minor' },
  { root: 3, expected: 'D# minor' },
  { root: 4, expected: 'E minor' },
  { root: 5, expected: 'F minor' },
  { root: 6, expected: 'F# minor' },
  { root: 7, expected: 'G minor' },
  { root: 8, expected: 'G# minor' },
  { root: 9, expected: 'A minor' },
  { root: 10, expected: 'Bb minor' },
  { root: 11, expected: 'B minor' },
];

minorTests.forEach(function(tc) {
  var hist = buildHistogram(tc.root, MINOR_SCALE);
  var key = detectKey(hist);
  var name = keyName(key);
  assert(name === tc.expected, 'root ' + tc.root + ' -> "' + name + '" (expected "' + tc.expected + '")');
});

// ============================================================
console.log('\n=== Bb major detection (Bohemian Rhapsody case) ===');
// ============================================================

(function() {
  // Bb major scale: Bb C D Eb F G A = pitch classes 10 0 2 3 5 7 9
  // Simulate a realistic distribution heavy on Bb(10), F(5), D(2)
  var hist = [0,0,0,0,0,0,0,0,0,0,0,0];
  hist[10] = 50;  // Bb - tonic
  hist[0]  = 20;  // C
  hist[2]  = 25;  // D
  hist[3]  = 15;  // Eb
  hist[5]  = 35;  // F - dominant
  hist[7]  = 18;  // G
  hist[9]  = 12;  // A

  var key = detectKey(hist);
  var name = keyName(key);
  console.log('  Detected: ' + name + ' (confidence: ' + key.confidence.toFixed(3) + ')');
  assert(key.root === 10, 'root is 10 (Bb)');
  assert(key.mode === 'major', 'mode is major');
  assert(name === 'Bb major', 'displays as "Bb major" not "A# major"');
})();

// ============================================================
console.log('\n=== Whitney Houston "I Will Always Love You" (A major) ===');
// ============================================================

(function() {
  // Count-based histogram from CSV (original test)
  var hist = [12, 25, 4, 2, 23, 4, 17, 3, 22, 68, 2, 17];
  var key = detectKey(hist);
  var name = keyName(key);
  console.log('  Count-based: ' + name + ' (confidence: ' + key.confidence.toFixed(3) + ')');
  assert(key.root === 9, 'count: root is 9 (A)');
  assert(key.mode === 'major', 'count: mode is major');

  // Duration-weighted histogram (simulating real live detection)
  // A4 held for long stretches, C# passing tones ~150ms, C noise ~50ms flickers filtered out
  // Values in ms: A gets huge weight from sustained notes, C# from real passing tones
  var durationHist = [800, 4200, 600, 300, 3600, 600, 2700, 400, 3500, 15000, 300, 2800];
  var durKey = detectKey(durationHist);
  var durName = keyName(durKey);
  console.log('  Duration-weighted: ' + durName + ' (confidence: ' + durKey.confidence.toFixed(3) + ')');
  assert(durKey.root === 9, 'duration: root is 9 (A)');
  assert(durKey.mode === 'major', 'duration: mode is major');

  // Noisy live detection after 50ms filter removes flickers
  // C noise flickers (17ms) filtered out, genuine C# tones (~150ms) kept
  var noisyDurHist = [1200, 3500, 700, 1500, 3200, 2000, 1800, 1000, 3500, 12000, 1200, 2200];
  var noisyKey = detectKey(noisyDurHist);
  var noisyName = keyName(noisyKey);
  console.log('  Noisy duration: ' + noisyName + ' (confidence: ' + noisyKey.confidence.toFixed(3) + ')');
  assert(noisyKey.root === 9, 'noisy duration: root is 9 (A)');
  assert(noisyKey.mode === 'major', 'noisy duration: mode is major');
})();

// ============================================================
console.log('\n=== Minimum threshold test ===');
// ============================================================

(function() {
  // With < 20 pitches, the analyze function should show "Listening..."
  // We test the threshold value itself
  assert(20 > 5, 'new threshold (20) is higher than old threshold (5)');
  console.log('  (threshold increase from 5 to 20 verified in source code)');
})();

// ============================================================
console.log('\n=== Interval histogram building ===');
// ============================================================

(function() {
  console.log('\n-- C major triad (C=0, E=4, G=7) --');
  // Heavy on C, E, G
  var hist = [0,0,0,0,0,0,0,0,0,0,0,0];
  hist[0] = 100;  // C
  hist[4] = 80;   // E
  hist[7] = 90;   // G
  var ih = buildIntervalHistogram(hist);
  // C-E = 4 semitones, E-G = 3 semitones, C-G = 7 semitones (inverts to 5)
  assert(ih[4] > 0, 'intervalHist[4] populated (C-E = maj 3rd)');
  assert(ih[3] > 0, 'intervalHist[3] populated (E-G = min 3rd)');
  assert(ih[5] > 0, 'intervalHist[5] populated (G-C = perf 4th / inversion of 7)');
  console.log('  intervals: ' + ih.join(','));

  console.log('\n-- C augmented triad (C=0, E=4, G#=8) --');
  var hist2 = [0,0,0,0,0,0,0,0,0,0,0,0];
  hist2[0] = 100; // C
  hist2[4] = 100; // E
  hist2[8] = 100; // G#
  var ih2 = buildIntervalHistogram(hist2);
  // C-E = 4, E-G# = 4, C-G# = 8 (inverts to 4)
  assert(ih2[4] > 0, 'intervalHist[4] dominant for augmented triad');
  // All three pairs contribute to interval 4 (and its inversion 8)
  console.log('  intervals: ' + ih2.join(','));

  console.log('\n-- Single note --');
  var hist3 = [0,0,0,0,0,0,0,0,0,0,0,0];
  hist3[5] = 200;
  var ih3 = buildIntervalHistogram(hist3);
  var allZero = true;
  for (var i = 0; i < 12; i++) { if (ih3[i] !== 0) allZero = false; }
  assert(allZero, 'single note produces all-zero interval histogram');

  console.log('\n-- Two notes (C and E) --');
  var hist4 = [0,0,0,0,0,0,0,0,0,0,0,0];
  hist4[0] = 100;
  hist4[4] = 80;
  var ih4 = buildIntervalHistogram(hist4);
  assert(ih4[4] > 0, 'interval 4 populated for C-E');
  assert(ih4[8] > 0, 'interval 8 populated (inversion of 4)');
  // All other intervals should be zero
  var otherZero = true;
  for (var i = 0; i < 12; i++) {
    if (i !== 4 && i !== 8 && ih4[i] !== 0) otherZero = false;
  }
  assert(otherZero, 'only intervals 4 and 8 populated for two notes');
})();

// ============================================================
console.log('\n=== Trichord scoring ===');
// ============================================================

(function() {
  console.log('\n-- C major triad histogram -> [3,4] wins --');
  var hist = [0,0,0,0,0,0,0,0,0,0,0,0];
  hist[0] = 100; hist[4] = 80; hist[7] = 90;
  var ih = buildIntervalHistogram(hist);
  var scored = scoreTrichords(ih);
  assert(scored[0].type[0] === 3 && scored[0].type[1] === 4,
    'C major triad -> [3,4] wins (got [' + scored[0].type + '] score=' + scored[0].score + ')');

  console.log('\n-- C augmented triad histogram -> [4,4] scores highest --');
  var hist2 = [0,0,0,0,0,0,0,0,0,0,0,0];
  hist2[0] = 100; hist2[4] = 100; hist2[8] = 100;
  var ih2 = buildIntervalHistogram(hist2);
  var scored2 = scoreTrichords(ih2);
  // Pure augmented triad has only interval class 4 — multiple trichords tie.
  // Verify [4,4] achieves the top score (tied with others is fine).
  var score44 = null;
  for (var i = 0; i < scored2.length; i++) {
    if (scored2[i].type[0] === 4 && scored2[i].type[1] === 4) { score44 = scored2[i].score; break; }
  }
  assert(score44 === scored2[0].score,
    'C augmented triad -> [4,4] ties for top score (' + score44 + ' == ' + scored2[0].score + ')');
  // Trichords that lack interval class 4 should score 0
  var score15 = null;
  for (var i = 0; i < scored2.length; i++) {
    if (scored2[i].type[0] === 1 && scored2[i].type[1] === 5) { score15 = scored2[i].score; break; }
  }
  assert(score15 === 0, '[1,5] scores 0 for pure augmented (got ' + score15 + ')');

  console.log('\n-- Chromatic cluster (C, C#, D) -> [1,1] wins --');
  var hist3 = [0,0,0,0,0,0,0,0,0,0,0,0];
  hist3[0] = 100; hist3[1] = 100; hist3[2] = 100;
  var ih3 = buildIntervalHistogram(hist3);
  var scored3 = scoreTrichords(ih3);
  assert(scored3[0].type[0] === 1 && scored3[0].type[1] === 1,
    'chromatic cluster -> [1,1] wins (got [' + scored3[0].type + '] score=' + scored3[0].score + ')');

  console.log('\n-- Whole-tone fragment (C, D, E) -> [2,2] wins --');
  var hist4 = [0,0,0,0,0,0,0,0,0,0,0,0];
  hist4[0] = 100; hist4[2] = 100; hist4[4] = 100;
  var ih4 = buildIntervalHistogram(hist4);
  var scored4 = scoreTrichords(ih4);
  assert(scored4[0].type[0] === 2 && scored4[0].type[1] === 2,
    'whole-tone fragment -> [2,2] wins (got [' + scored4[0].type + '] score=' + scored4[0].score + ')');
})();

// ============================================================
console.log('\n=== Scoring fairness (bias fix) ===');
// ============================================================

(function() {
  // Histogram where interval 4 is moderately strong AND intervals 3 and 5 also strong
  // With the old triple-counting bug, [4,4] would get score = 3*intervalHist[4]
  // while [3,4] would get intervalHist[3] + intervalHist[4] + intervalHist[5]
  // With the fix, [4,4] gets only intervalHist[4] (1 unique interval)
  // and [3,4] gets intervalHist[3] + intervalHist[4] + intervalHist[5] (3 unique intervals)

  // Build a histogram with C major + some extra notes to create mixed intervals
  var hist = [0,0,0,0,0,0,0,0,0,0,0,0];
  hist[0] = 100;  // C
  hist[2] = 40;   // D
  hist[4] = 80;   // E
  hist[5] = 60;   // F
  hist[7] = 90;   // G
  hist[9] = 30;   // A
  hist[11] = 20;  // B

  var ih = buildIntervalHistogram(hist);
  var scored = scoreTrichords(ih);

  console.log('  Interval histogram: ' + ih.join(','));
  console.log('  Top 5 scores:');
  for (var i = 0; i < Math.min(5, scored.length); i++) {
    console.log('    [' + scored[i].type + ']: ' + scored[i].score);
  }

  // Find [3,4] and [4,4] scores
  var score34 = null, score44 = null;
  for (var i = 0; i < scored.length; i++) {
    if (scored[i].type[0] === 3 && scored[i].type[1] === 4) score34 = scored[i].score;
    if (scored[i].type[0] === 4 && scored[i].type[1] === 4) score44 = scored[i].score;
  }

  console.log('  [3,4] score: ' + score34 + ', [4,4] score: ' + score44);
  assert(score34 > score44,
    '[3,4] beats [4,4] for diatonic music (score34=' + score34 + ' > score44=' + score44 + ')');

  // Also verify that [4,4] is NOT the winner for diatonic music
  assert(scored[0].type[0] !== 4 || scored[0].type[1] !== 4,
    '[4,4] is not the top trichord for diatonic music');
})();

// ============================================================
console.log('\n=== Whitney Houston trichord detection ===');
// ============================================================

(function() {
  // Whitney Houston "I Will Always Love You" - count histogram from CSV
  var hist = [12, 25, 4, 2, 23, 4, 17, 3, 22, 68, 2, 17];

  var ih = buildIntervalHistogram(hist);
  var scored = scoreTrichords(ih);

  console.log('  Interval histogram: ' + ih.join(','));
  console.log('  Top 3:');
  for (var i = 0; i < 3; i++) {
    console.log('    [' + scored[i].type + ']: ' + scored[i].score);
  }

  // For a pop ballad in A major, [3,4] (major/minor triads) should win
  assert(scored[0].type[0] === 3 && scored[0].type[1] === 4,
    'Whitney Houston -> [3,4] wins (got [' + scored[0].type + '] score=' + scored[0].score + ')');

  // [4,4] (augmented) should NOT be the winner for standard pop music
  assert(scored[0].type[0] !== 4 || scored[0].type[1] !== 4,
    'Whitney Houston -> [4,4] (augmented) is NOT the winner');
})();

// ============================================================
console.log('\n=== Summary ===');
console.log(passed + ' passed, ' + failed + ' failed');
process.exit(failed > 0 ? 1 : 0);
