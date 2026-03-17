var mic = (function() {
  "use strict";

  var module = {};

  var active = false;
  var stream = null;
  var audioCtx = null;
  var analyser = null;
  var source = null;
  var rafId = null;
  var currentNote = -1;
  var MIC_CHANNEL = 17;
  var CLARITY_THRESHOLD = 0.7;

  // Audio-file playback state
  var fileActive = false;
  var fileSourceNode = null;
  var fileAudioBuffer = null;
  var fileGainNode = null;
  var fileSpeakerEnabled = true;
  var MIN_FREQ = 60;   // ~B1
  var MAX_FREQ = 1500; // ~F#6
  var NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

  module.init = function() {
    populateDevices();
    $('#mic-toggle').click(function() {
      if (active) {
        module.stop();
      } else {
        module.start();
      }
    });
    $('#mic-test').click(function() {
      module.testTone();
    });

    // Audio file handlers
    $('#audiofile-input').on('change', function() {
      if (this.files && this.files[0]) module.loadFile(this.files[0]);
    });
    $('#audiofile-play').click(function() {
      if (fileActive) {
        module.stopFile();
      } else {
        module.startFile();
      }
    });
    $('#audiofile-speaker').on('change', function() {
      module.setFileSpeaker(this.checked);
    });
  };

  module.testTone = function() {
    // Bypass mic entirely — generate a 440Hz tone and feed it to the detector
    if (active) module.stop();
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    audioCtx.resume().then(function() {
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;

      // Connect: osc -> analyser -> silent gain -> destination
      // The destination connection is required for Chrome to process the graph
      var silentGain = audioCtx.createGain();
      silentGain.gain.value = 0;
      analyser.connect(silentGain);
      silentGain.connect(audioCtx.destination);

      var osc = audioCtx.createOscillator();
      osc.frequency.value = 440;
      osc.connect(analyser);
      startProcessor();
      osc.start();

      active = true;
      $('#mic-debug').show();
      $('#mic-debug').text('TEST TONE: 440 Hz (A4) | ctx state: ' + audioCtx.state + ' | sampleRate: ' + audioCtx.sampleRate);
      detect();

      // Stop after 3 seconds
      setTimeout(function() {
        osc.stop();
        module.stop();
        $('#mic-debug').text('Test done. If A4 was detected, the pipeline works. Mic input may be the issue.');
        $('#mic-debug').show();
      }, 3000);
    });
  };

  // ── Audio file playback ──────────────────────────────────────────

  module.loadFile = function(file) {
    var reader = new FileReader();
    reader.onload = function(e) {
      var tempCtx = new (window.AudioContext || window.webkitAudioContext)();
      tempCtx.decodeAudioData(e.target.result).then(function(buffer) {
        fileAudioBuffer = buffer;
        var duration = buffer.duration;
        var mins = Math.floor(duration / 60);
        var secs = Math.floor(duration % 60);
        var timeStr = mins + ':' + (secs < 10 ? '0' : '') + secs;
        $('#audiofile-status').text(file.name + ' — ' + timeStr + ' — ' + buffer.sampleRate + ' Hz');
        $('#audiofile-play').prop('disabled', false).text('Play');
        tempCtx.close();
      }).catch(function(err) {
        $('#audiofile-status').text('Error decoding: ' + err.message);
        fileAudioBuffer = null;
        $('#audiofile-play').prop('disabled', true).text('Play');
      });
    };
    reader.readAsArrayBuffer(file);
  };

  module.startFile = function() {
    if (!fileAudioBuffer) return;
    if (active) module.stop();  // mutual exclusion: stop mic

    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    audioCtx.resume().then(function() {
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;

      fileGainNode = audioCtx.createGain();
      fileSpeakerEnabled = $('#audiofile-speaker').prop('checked');
      fileGainNode.gain.value = fileSpeakerEnabled ? 1 : 0;

      fileSourceNode = audioCtx.createBufferSource();
      fileSourceNode.buffer = fileAudioBuffer;

      // BufferSource → analyser → fileGainNode → destination
      fileSourceNode.connect(analyser);
      analyser.connect(fileGainNode);
      fileGainNode.connect(audioCtx.destination);

      startProcessor();
      fileSourceNode.start();

      fileActive = true;
      active = true;  // lets detect() loop run
      tonnetz.startSuggestionTracking();
      if (typeof keyAnalysis !== 'undefined') {
        keyAnalysis.setAccumulateMode(true);
        keyAnalysis.start();
      }
      if (typeof noteRecorder !== 'undefined') noteRecorder.start();

      $('#audiofile-play').text('Stop').removeClass('btn-default').addClass('btn-danger');
      $('#mic-toggle').prop('disabled', true);
      $('#mic-test').prop('disabled', true);
      $('#mic-debug').show();
      $('#mic-debug').text('FILE: playing | sampleRate: ' + audioCtx.sampleRate);

      detect();

      fileSourceNode.onended = function() {
        if (fileActive) module.stopFile();
      };
    });
  };

  module.stopFile = function() {
    fileActive = false;
    active = false;
    tonnetz.stopSuggestionTracking();
    if (typeof noteRecorder !== 'undefined') noteRecorder.stop();
    if (typeof keyAnalysis !== 'undefined') {
      keyAnalysis.setAccumulateMode(false);
      keyAnalysis.stop();
    }
    if (rafId) cancelAnimationFrame(rafId);
    if (currentNote >= 0) {
      tonnetz.noteOff(MIC_CHANNEL, currentNote);
      currentNote = -1;
    }
    if (scriptNode) { scriptNode.disconnect(); scriptNode = null; }
    latestBuf = null;
    if (fileSourceNode) {
      try { fileSourceNode.stop(); } catch (e) { /* already stopped */ }
      fileSourceNode.disconnect();
      fileSourceNode = null;
    }
    if (fileGainNode) { fileGainNode.disconnect(); fileGainNode = null; }
    if (audioCtx) audioCtx.close();
    audioCtx = null;
    analyser = null;

    $('#audiofile-play').text('Replay').removeClass('btn-danger').addClass('btn-default');
    $('#mic-toggle').prop('disabled', false);
    $('#mic-test').prop('disabled', false);
    $('#mic-status').text('--');
    $('#mic-debug').hide();
    hidePitchIndicator();
  };

  module.setFileSpeaker = function(enabled) {
    fileSpeakerEnabled = enabled;
    if (fileGainNode) {
      fileGainNode.gain.value = enabled ? 1 : 0;
    }
  };

  function populateDevices() {
    navigator.mediaDevices.enumerateDevices().then(function(devices) {
      var select = $('#mic-device');
      select.empty().append('<option value="">Default</option>');
      devices.forEach(function(dev) {
        if (dev.kind === 'audioinput') {
          var label = dev.label || ('Microphone ' + (select.children().length));
          select.append('<option value="' + dev.deviceId + '">' + label + '</option>');
        }
      });
    });
  }

  module.start = function() {
    if (fileActive) module.stopFile();  // mutual exclusion: stop file playback
    var deviceId = $('#mic-device').val();
    var constraints = deviceId
      ? { audio: { deviceId: { exact: deviceId }, echoCancellation: false, noiseSuppression: false, autoGainControl: false } }
      : { audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } };
    navigator.mediaDevices.getUserMedia(constraints).then(function(s) {
      // Re-populate with labels now that we have permission
      populateDevices();
      stream = s;
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();

      // Chrome requires resume + destination connection for analyser to work
      return audioCtx.resume().then(function() {
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 2048;

        // Must connect to destination for Chrome to process the graph
        var silentGain = audioCtx.createGain();
        silentGain.gain.value = 0;
        analyser.connect(silentGain);
        silentGain.connect(audioCtx.destination);

        source = audioCtx.createMediaStreamSource(s);
        source.connect(analyser);
        startProcessor();
        active = true;
        tonnetz.startSuggestionTracking();
        if (typeof keyAnalysis !== 'undefined') keyAnalysis.start();
        if (typeof noteRecorder !== 'undefined') noteRecorder.start();
        $('#mic-toggle').text('Stop microphone').removeClass('btn-default').addClass('btn-success');
        $('#navbar-mic-toggle').removeClass('btn-default').addClass('btn-success');
        $('#navbar-mic-text').text('Mic ON');
        $('#mic-check').prop('checked', true);
        $('#mic-debug').show();
        var track = s.getAudioTracks()[0];
        var settings = track.getSettings ? track.getSettings() : {};
        $('#mic-debug').text('MIC: ' + track.label + ' | sampleRate: ' + audioCtx.sampleRate + ' | state: ' + audioCtx.state + ' | deviceId: ' + (settings.deviceId || '?').substring(0, 16));
        detect();
      });
    }).catch(function(err) {
      showError('Microphone access denied: ' + err.message);
    });
  };

  module.stop = function() {
    active = false;
    tonnetz.stopSuggestionTracking();
    if (typeof noteRecorder !== 'undefined') noteRecorder.stop();
    if (typeof keyAnalysis !== 'undefined') keyAnalysis.stop();
    if (rafId) cancelAnimationFrame(rafId);
    if (currentNote >= 0) {
      tonnetz.noteOff(MIC_CHANNEL, currentNote);
      currentNote = -1;
    }
    if (scriptNode) { scriptNode.disconnect(); scriptNode = null; }
    latestBuf = null;
    if (source) source.disconnect();
    if (audioCtx) audioCtx.close();
    if (stream) stream.getTracks().forEach(function(t) { t.stop(); });
    stream = null;
    audioCtx = null;
    analyser = null;
    source = null;
    $('#mic-toggle').text('Start microphone').removeClass('btn-success').addClass('btn-default');
    $('#navbar-mic-toggle').removeClass('btn-success').addClass('btn-default');
    $('#navbar-mic-text').text('Microphone');
    $('#mic-check').prop('checked', false);
    $('#mic-status').text('--');
    $('#mic-debug').hide();
    hidePitchIndicator();
  };

  var scriptNode = null;
  var latestBuf = null;

  function startProcessor() {
    // Use ScriptProcessorNode to capture raw audio directly
    // This bypasses AnalyserNode which may not work in all browsers
    scriptNode = audioCtx.createScriptProcessor(2048, 1, 1);
    scriptNode.onaudioprocess = function(e) {
      var input = e.inputBuffer.getChannelData(0);
      latestBuf = new Float32Array(input);
    };
    analyser.connect(scriptNode);
    scriptNode.connect(audioCtx.destination);
  }

  function detect() {
    if (!active) return;

    // Try ScriptProcessorNode buffer first, fall back to AnalyserNode
    var buf;
    if (latestBuf) {
      buf = latestBuf;
    } else {
      buf = new Float32Array(analyser.fftSize);
      analyser.getFloatTimeDomainData(buf);
    }

    // Compute RMS for debug
    var rms = 0;
    for (var k = 0; k < buf.length; k++) rms += buf[k] * buf[k];
    rms = Math.sqrt(rms / buf.length);

    var result = autocorrelate(buf, audioCtx.sampleRate);
    var rmsThresh = fileActive ? 0.001 : 0.01;
    var dbg = 'ctx:' + audioCtx.state + ' | RMS: ' + rms.toFixed(4) + ' (thr:' + rmsThresh + ')';
    if (result.freq > 0) {
      dbg += ' | freq: ' + result.freq.toFixed(1) + ' Hz | clarity: ' + result.clarity.toFixed(2);
    } else {
      dbg += ' | no pitch';
    }

    var clarityThresh = fileActive ? 0.6 : CLARITY_THRESHOLD;
    if (result.freq > 0 && result.clarity > clarityThresh) {
      var exactMidi = 12 * Math.log2(result.freq / 440) + 69;
      var note = Math.round(exactMidi);
      var cents = Math.round((exactMidi - note) * 100);
      var octave = Math.floor(note / 12) - 1;
      var name = NOTE_NAMES[note % 12] + octave;
      var centsStr = (cents >= 0 ? '+' : '') + cents;
      dbg += ' | NOTE: ' + name + ' ' + centsStr + 'c';
      $('#mic-status').text(name + '  ' + result.freq.toFixed(1) + ' Hz  ' + centsStr + '\u00A2');
      updatePitchIndicator(cents, name);
      if (note !== currentNote) {
        if (currentNote >= 0) {
          tonnetz.noteOff(MIC_CHANNEL, currentNote);
          if (typeof noteRecorder !== 'undefined') noteRecorder.noteOff();
        }
        tonnetz.noteOn(MIC_CHANNEL, note);
        if (typeof keyAnalysis !== 'undefined') keyAnalysis.recordPitch(note);
        if (typeof noteRecorder !== 'undefined') noteRecorder.noteOn(note, result.freq, cents);
        currentNote = note;
      }
    } else {
      $('#mic-status').text(result.freq > 0 ? 'low clarity: ' + result.clarity.toFixed(2) : '--');
      hidePitchIndicator();
      if (currentNote >= 0) {
        tonnetz.noteOff(MIC_CHANNEL, currentNote);
        if (typeof noteRecorder !== 'undefined') noteRecorder.noteOff();
        currentNote = -1;
      }
    }
    $('#mic-debug').text(dbg);

    rafId = requestAnimationFrame(detect);
  }

  function autocorrelate(buf, sampleRate) {
    // Check if there's enough signal
    var rms = 0;
    for (var i = 0; i < buf.length; i++) rms += buf[i] * buf[i];
    rms = Math.sqrt(rms / buf.length);
    var rmsThreshold = fileActive ? 0.001 : 0.01;
    if (rms < rmsThreshold) return { freq: -1, clarity: 0 };

    // Autocorrelation
    var size = buf.length;
    var corr = new Float32Array(size);
    for (i = 0; i < size; i++) {
      var sum = 0;
      for (var j = 0; j < size - i; j++) {
        sum += buf[j] * buf[j + i];
      }
      corr[i] = sum;
    }

    // Find first dip then first peak
    var d = 0;
    while (d < size && corr[d] > 0) d++;
    if (d >= size) return { freq: -1, clarity: 0 };

    var maxVal = -1, maxPos = -1;
    var minLag = Math.floor(sampleRate / MAX_FREQ);
    var maxLag = Math.floor(sampleRate / MIN_FREQ);
    for (i = Math.max(d, minLag); i < Math.min(size, maxLag); i++) {
      if (corr[i] > maxVal) {
        maxVal = corr[i];
        maxPos = i;
      }
    }

    if (maxPos < 0) return { freq: -1, clarity: 0 };

    // Parabolic interpolation for sub-sample accuracy
    var a = corr[maxPos - 1] || 0;
    var b = corr[maxPos];
    var c = corr[maxPos + 1] || 0;
    var shift = (a - c) / (2 * (a - 2 * b + c));
    var refinedPos = maxPos + (isFinite(shift) ? shift : 0);

    return {
      freq: sampleRate / refinedPos,
      clarity: corr[maxPos] / corr[0]
    };
  }

  function updatePitchIndicator(cents, noteName) {
    var el = document.getElementById('pitch-indicator');
    if (!el) return;
    var absCents = Math.abs(cents);
    var color;
    if (absCents <= 5) color = '#2ecc71';       // green — centered
    else if (absCents <= 15) color = '#f1c40f';  // yellow — slightly off
    else color = '#e74c3c';                       // red — far off

    var sign = cents >= 0 ? '+' : '';
    el.querySelector('.pitch-note').textContent = noteName;
    el.querySelector('.pitch-cents').textContent = sign + cents + '\u00A2';
    el.querySelector('.pitch-cents').style.color = color;

    // Position the bar indicator: 0 cents = center, +-50 = edges
    var pct = 50 + (cents / 50) * 50;
    pct = Math.max(0, Math.min(100, pct));
    el.querySelector('.pitch-bar-fill').style.left = pct + '%';
    el.querySelector('.pitch-bar-fill').style.background = color;

    el.style.opacity = '1';
  }

  function hidePitchIndicator() {
    var el = document.getElementById('pitch-indicator');
    if (el) el.style.opacity = '0';
  }

  // Exposed for testing
  module._autocorrelate = autocorrelate;
  module._freqToMidi = function(freq) {
    return Math.round(12 * Math.log2(freq / 440) + 69);
  };

  return module;
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = mic;
}
