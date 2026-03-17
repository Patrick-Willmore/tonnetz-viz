var keyAnalysis = (function() {
  "use strict";

  var module = {};

  // --- Configuration ---
  var WINDOW_SEC = 15;        // rolling window for pitch history
  var ANALYSIS_INTERVAL = 1000; // ms between analysis runs
  var CONFIDENCE_THRESHOLD = 0.5;
  var TRICHORD_COOLDOWN = 5000;      // ms between auto-trichord changes (live mic)
  var TRICHORD_COOLDOWN_FILE = 30000; // ms between auto-trichord changes (file playback)
  var KEY_STABILITY_THRESHOLD = 3;    // consecutive wins before changing displayed key
  var MAJOR_KEY_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  var MINOR_KEY_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];

  // --- State ---
  var pitchHistory = [];       // {pitchClass: 0-11, timestamp: ms}
  var intervalId = null;
  var lastTrichordChange = 0;
  var accumulateMode = false;
  var candidateKey = null;     // key currently being evaluated for stability
  var candidateCount = 0;      // consecutive analysis cycles this candidate has won
  var displayedKey = null;     // key currently shown to user
  var candidateTrichord = null;      // trichord currently being evaluated for stability
  var trichordCandidateCount = 0;    // consecutive analysis cycles this trichord candidate has won

  module.highlightedTones = new Array(12);
  module.autoTrichordEnabled = false;
  module.estimatedKey = null;  // {root: 0-11, mode: 'major'|'minor', confidence: number}

  // --- Temperley key profiles (better major/minor discrimination) ---
  var MAJOR_PROFILE = [5.0, 2.0, 3.5, 2.0, 4.5, 4.0, 2.0, 4.5, 2.0, 3.5, 1.5, 4.0];
  var MINOR_PROFILE = [5.0, 2.0, 3.5, 4.5, 2.0, 4.0, 2.0, 4.5, 3.5, 2.0, 1.5, 4.0];

  // Diatonic scale intervals from root
  var MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11]; // W W H W W W H
  var MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10]; // W H W W H W W

  // Trichord definitions: [intervalA, intervalB]
  var TRICHORD_TYPES = [
    [1, 1], [1, 2], [1, 3], [1, 4], [1, 5],
    [2, 2], [2, 3], [2, 4], [2, 5],
    [3, 3], [3, 4], [4, 4]
  ];

  // --- Public API ---

  module.init = function() {
    for (var i = 0; i < 12; i++) {
      module.highlightedTones[i] = false;
    }
  };

  module.start = function() {
    pitchHistory = [];
    module.estimatedKey = null;
    candidateKey = null;
    candidateCount = 0;
    displayedKey = null;
    candidateTrichord = null;
    trichordCandidateCount = 0;
    clearHighlights();
    updateDisplay('Listening...');
    if (intervalId) clearInterval(intervalId);
    intervalId = setInterval(analyze, ANALYSIS_INTERVAL);
  };

  module.stop = function() {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    pitchHistory = [];
    module.estimatedKey = null;
    accumulateMode = false;
    candidateKey = null;
    candidateCount = 0;
    displayedKey = null;
    candidateTrichord = null;
    trichordCandidateCount = 0;
    clearHighlights();
    updateDisplay(null);
    tonnetz.draw();
  };

  module.setAccumulateMode = function(enabled) {
    accumulateMode = enabled;
  };

  module.recordPitch = function(midiNote) {
    pitchHistory.push({
      pitchClass: midiNote % 12,
      timestamp: Date.now()
    });
  };

  // --- Internal ---

  function clearHighlights() {
    for (var i = 0; i < 12; i++) {
      module.highlightedTones[i] = false;
    }
  }

  function analyze() {
    pruneHistory();

    if (pitchHistory.length < 20) {
      updateDisplay('Listening...');
      clearHighlights();
      return;
    }

    // Build duration-weighted pitch-class histogram
    // Weight each note by how long it was held (ms), filtering out brief flickers
    var histogram = new Array(12);
    for (var i = 0; i < 12; i++) histogram[i] = 0;
    var now = Date.now();
    for (var i = 0; i < pitchHistory.length; i++) {
      var duration;
      if (i + 1 < pitchHistory.length) {
        duration = pitchHistory[i + 1].timestamp - pitchHistory[i].timestamp;
      } else {
        duration = now - pitchHistory[i].timestamp;
      }
      if (duration < 50) continue; // skip flickers shorter than 50ms
      histogram[pitchHistory[i].pitchClass] += Math.min(duration, 5000); // cap at 5s
    }

    // Correlate duration-weighted histogram against all 24 Temperley key profiles
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

    // Post-hoc major/minor correction using 3rd scale degree evidence
    if (bestKey) {
      var minor3rd = histogram[(bestKey.root + 3) % 12];
      var major3rd = histogram[(bestKey.root + 4) % 12];
      console.log('[keyAnalysis] 3rd check: root=' + bestKey.root + ' mode=' + bestKey.mode +
        ' minor3rd(pc' + ((bestKey.root + 3) % 12) + ')=' + minor3rd +
        ' major3rd(pc' + ((bestKey.root + 4) % 12) + ')=' + major3rd +
        ' ratio=' + (major3rd / (minor3rd || 1)).toFixed(2));
      if (bestKey.mode === 'minor' && major3rd > minor3rd * 1.3) {
        console.log('[keyAnalysis] FLIPPING minor -> major');
        bestKey = { root: bestKey.root, mode: 'major', confidence: bestKey.confidence };
      } else if (bestKey.mode === 'major' && minor3rd > major3rd * 1.3) {
        console.log('[keyAnalysis] FLIPPING major -> minor');
        bestKey = { root: bestKey.root, mode: 'minor', confidence: bestKey.confidence };
      }
    }

    module.estimatedKey = bestKey;

    // Debug: log analysis results to console
    console.log('[keyAnalysis] hist:', histogram.join(','),
      '| best:', bestKey ? bestKey.root + ' ' + bestKey.mode + ' ' + bestKey.confidence.toFixed(3) : 'none',
      '| displayed:', displayedKey ? displayedKey.root + ' ' + displayedKey.mode : 'none',
      '| candidate:', candidateKey ? candidateKey.root + ' ' + candidateKey.mode + ' x' + candidateCount : 'none',
      '| n:', pitchHistory.length);

    // Key stability: only change displayed key after consecutive wins
    if (bestKey && bestKey.confidence > CONFIDENCE_THRESHOLD) {
      if (candidateKey && candidateKey.root === bestKey.root && candidateKey.mode === bestKey.mode) {
        candidateCount++;
      } else {
        candidateKey = bestKey;
        candidateCount = 1;
      }

      // Promote candidate to displayed key once stable
      if (candidateCount >= KEY_STABILITY_THRESHOLD) {
        displayedKey = bestKey;
      }
    }

    // Update diatonic highlights based on displayed key
    clearHighlights();
    if (displayedKey && displayedKey.confidence > CONFIDENCE_THRESHOLD) {
      var scale = displayedKey.mode === 'major' ? MAJOR_SCALE : MINOR_SCALE;
      for (var i = 0; i < scale.length; i++) {
        module.highlightedTones[(displayedKey.root + scale[i]) % 12] = true;
      }
      var keyNames = displayedKey.mode === 'major' ? MAJOR_KEY_NAMES : MINOR_KEY_NAMES;
      updateDisplay('Probably ' + keyNames[displayedKey.root] + ' ' + displayedKey.mode);
    } else {
      updateDisplay('Listening...');
    }

    // Auto-trichord selection
    if (module.autoTrichordEnabled && bestKey && bestKey.confidence > CONFIDENCE_THRESHOLD) {
      autoSelectTrichord(histogram);
    }

    tonnetz.draw();
  }

  function pruneHistory() {
    if (accumulateMode) return;
    var cutoff = Date.now() - WINDOW_SEC * 1000;
    while (pitchHistory.length > 0 && pitchHistory[0].timestamp < cutoff) {
      pitchHistory.shift();
    }
  }

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
      sumX += x[i];
      sumY += y[i];
      sumXY += x[i] * y[i];
      sumX2 += x[i] * x[i];
      sumY2 += y[i] * y[i];
    }
    var num = n * sumXY - sumX * sumY;
    var den = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
    return den === 0 ? 0 : num / den;
  }

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

  function scoreTrichords(intervalHist) {
    var results = [];
    for (var t = 0; t < TRICHORD_TYPES.length; t++) {
      var a = TRICHORD_TYPES[t][0];
      var b = TRICHORD_TYPES[t][1];
      var c = (12 - a - b + 12) % 12;
      // Only sum each unique interval class once to avoid bias for symmetric trichords.
      // Interval classes treat i and 12-i as the same (e.g., 4 and 8 are both "major 3rd").
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

  function autoSelectTrichord(histogram) {
    var now = Date.now();
    var cooldown = accumulateMode ? TRICHORD_COOLDOWN_FILE : TRICHORD_COOLDOWN;
    if (now - lastTrichordChange < cooldown) return;

    var intervalHist = buildIntervalHistogram(histogram);
    var scored = scoreTrichords(intervalHist);

    // Debug: log interval histogram, top 3 scores, and stability candidate
    var top3Str = scored.slice(0, 3).map(function(s) {
      return '[' + s.type[0] + ',' + s.type[1] + ']:' + s.score;
    }).join(' ');
    console.log('[keyAnalysis] trichord: top3=' + top3Str +
      ' | candidate: ' + (candidateTrichord ? '[' + candidateTrichord[0] + ',' + candidateTrichord[1] + '] x' + trichordCandidateCount : 'none'));

    var bestType = scored.length > 0 ? scored[0].type : null;
    if (!bestType) return;

    // Trichord stability: require consecutive wins before switching
    if (candidateTrichord && candidateTrichord[0] === bestType[0] && candidateTrichord[1] === bestType[1]) {
      trichordCandidateCount++;
    } else {
      candidateTrichord = bestType;
      trichordCandidateCount = 1;
    }

    if (trichordCandidateCount >= KEY_STABILITY_THRESHOLD &&
        (bestType[0] !== tonnetz.intervalA || bestType[1] !== tonnetz.intervalB)) {
      lastTrichordChange = now;
      tonnetz.setIntervals(bestType[0], bestType[1]);

      // Update UI: highlight the matching cell in the selector
      $('#trichord-selector td').removeClass('active');
      $('#trichord-selector td[data-a="' + bestType[0] + '"][data-b="' + bestType[1] + '"]').addClass('active');
    }
  }

  // --- Exposed internals for testing ---
  module._buildIntervalHistogram = buildIntervalHistogram;
  module._scoreTrichords = scoreTrichords;

  function updateDisplay(text) {
    var el = document.getElementById('key-display');
    if (!el) return;
    if (text === null) {
      el.style.opacity = '0';
    } else {
      el.textContent = text;
      el.style.opacity = '1';
    }
  }

  return module;
})();
