// Mock browser globals so mic.js can load in Node
global.$ = function() { return { click: function() {} }; };
global.navigator = { mediaDevices: {} };
global.window = {};
global.tonnetz = { noteOn: function() {}, noteOff: function() {} };
global.showError = function() {};

var mic = require('../js/mic.js');

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

function assertApprox(actual, expected, tolerance, name) {
  var diff = Math.abs(actual - expected);
  if (diff <= tolerance) {
    console.log('  PASS: ' + name + ' (got ' + actual.toFixed(2) + ', expected ' + expected + ')');
    passed++;
  } else {
    console.log('  FAIL: ' + name + ' (got ' + actual.toFixed(2) + ', expected ' + expected + ', diff ' + diff.toFixed(2) + ')');
    failed++;
  }
}

// Generate a sine wave buffer
function makeSine(freq, sampleRate, length) {
  var buf = new Float32Array(length);
  for (var i = 0; i < length; i++) {
    buf[i] = 0.5 * Math.sin(2 * Math.PI * freq * i / sampleRate);
  }
  return buf;
}

// Generate silence
function makeSilence(length) {
  return new Float32Array(length);
}

// Generate white noise
function makeNoise(length, amplitude) {
  var buf = new Float32Array(length);
  for (var i = 0; i < length; i++) {
    buf[i] = (Math.random() * 2 - 1) * amplitude;
  }
  return buf;
}

var SAMPLE_RATE = 44100;
var BUF_SIZE = 2048;

// ============================================================
console.log('\n=== autocorrelate tests ===');
// ============================================================

console.log('\n-- Silence --');
(function() {
  var buf = makeSilence(BUF_SIZE);
  var result = mic._autocorrelate(buf, SAMPLE_RATE);
  assert(result.freq === -1, 'silence returns freq -1');
  assert(result.clarity === 0, 'silence returns clarity 0');
})();

console.log('\n-- Low amplitude noise (below RMS threshold) --');
(function() {
  var buf = makeNoise(BUF_SIZE, 0.005);
  var result = mic._autocorrelate(buf, SAMPLE_RATE);
  assert(result.freq === -1, 'very quiet noise returns freq -1');
})();

console.log('\n-- Pure A4 (440 Hz) --');
(function() {
  var buf = makeSine(440, SAMPLE_RATE, BUF_SIZE);
  var result = mic._autocorrelate(buf, SAMPLE_RATE);
  assert(result.freq > 0, 'detects a frequency');
  assertApprox(result.freq, 440, 5, 'frequency is ~440 Hz');
  assert(result.clarity > 0.8, 'high clarity for pure tone (got ' + result.clarity.toFixed(3) + ')');
})();

console.log('\n-- Pure C4 (261.63 Hz) --');
(function() {
  var buf = makeSine(261.63, SAMPLE_RATE, BUF_SIZE);
  var result = mic._autocorrelate(buf, SAMPLE_RATE);
  assert(result.freq > 0, 'detects a frequency');
  assertApprox(result.freq, 261.63, 5, 'frequency is ~261.63 Hz');
})();

console.log('\n-- Pure E4 (329.63 Hz) --');
(function() {
  var buf = makeSine(329.63, SAMPLE_RATE, BUF_SIZE);
  var result = mic._autocorrelate(buf, SAMPLE_RATE);
  assert(result.freq > 0, 'detects a frequency');
  assertApprox(result.freq, 329.63, 5, 'frequency is ~329.63 Hz');
})();

console.log('\n-- Low note: E2 (82.41 Hz) --');
(function() {
  var buf = makeSine(82.41, SAMPLE_RATE, BUF_SIZE);
  var result = mic._autocorrelate(buf, SAMPLE_RATE);
  assert(result.freq > 0, 'detects low frequency');
  assertApprox(result.freq, 82.41, 3, 'frequency is ~82.41 Hz');
})();

console.log('\n-- High note: C6 (1046.50 Hz) --');
(function() {
  var buf = makeSine(1046.50, SAMPLE_RATE, BUF_SIZE);
  var result = mic._autocorrelate(buf, SAMPLE_RATE);
  assert(result.freq > 0, 'detects high frequency');
  assertApprox(result.freq, 1046.50, 10, 'frequency is ~1046.50 Hz');
})();

// ============================================================
console.log('\n=== freqToMidi tests ===');
// ============================================================

(function() {
  assert(mic._freqToMidi(440) === 69, 'A4 (440 Hz) = MIDI 69');
  assert(mic._freqToMidi(261.63) === 60, 'C4 (261.63 Hz) = MIDI 60');
  assert(mic._freqToMidi(329.63) === 64, 'E4 (329.63 Hz) = MIDI 64');
  assert(mic._freqToMidi(82.41) === 40, 'E2 (82.41 Hz) = MIDI 40');
  assert(mic._freqToMidi(1046.50) === 84, 'C6 (1046.50 Hz) = MIDI 84');
  assert(mic._freqToMidi(880) === 81, 'A5 (880 Hz) = MIDI 81');
  assert(mic._freqToMidi(220) === 57, 'A3 (220 Hz) = MIDI 57');
})();

// ============================================================
console.log('\n=== Note detection integration tests ===');
// ============================================================

console.log('\n-- Correct MIDI note from detected pitch --');
(function() {
  var testCases = [
    { freq: 440, name: 'A4', midi: 69 },
    { freq: 261.63, name: 'C4', midi: 60 },
    { freq: 329.63, name: 'E4', midi: 64 },
    { freq: 493.88, name: 'B4', midi: 71 },
    { freq: 146.83, name: 'D3', midi: 50 },
  ];

  testCases.forEach(function(tc) {
    var buf = makeSine(tc.freq, SAMPLE_RATE, BUF_SIZE);
    var result = mic._autocorrelate(buf, SAMPLE_RATE);
    if (result.freq > 0) {
      var note = mic._freqToMidi(result.freq);
      assert(note === tc.midi, tc.name + ' (' + tc.freq + ' Hz) -> detected ' + result.freq.toFixed(1) + ' Hz -> MIDI ' + note + ' (expected ' + tc.midi + ')');
    } else {
      console.log('  FAIL: ' + tc.name + ' - no frequency detected');
      failed++;
    }
  });
})();

// ============================================================
console.log('\n=== Summary ===');
console.log(passed + ' passed, ' + failed + ' failed');
process.exit(failed > 0 ? 1 : 0);
