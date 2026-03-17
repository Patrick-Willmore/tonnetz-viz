var noteRecorder = (function() {
  "use strict";

  var module = {};

  var NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

  var events = [];
  var sessionStart = 0;
  var currentEvent = null;

  module.MIN_DURATION = 100; // ms — notes shorter than this are filtered out (waver filtering)

  module.init = function() {
    // No-op for now; keeps the pattern consistent with other modules
  };

  module.start = function() {
    events = [];
    currentEvent = null;
    sessionStart = Date.now();
  };

  module.noteOn = function(midiNote, frequency, centsOffset) {
    // Close any open note first
    if (currentEvent) {
      currentEvent.endTime = Date.now();
      events.push(currentEvent);
    }
    var a = (typeof tonnetz !== 'undefined') ? tonnetz.intervalA : '';
    var b = (typeof tonnetz !== 'undefined') ? tonnetz.intervalB : '';
    currentEvent = {
      startTime: Date.now(),
      endTime: null,
      midiNote: midiNote,
      frequency: frequency,
      centsOffset: (typeof centsOffset === 'number') ? centsOffset : '',
      trichord: (a !== '' && b !== '') ? '"' + a + '-' + b + '-' + ((12 - a - b + 12) % 12) + '"' : ''
    };
  };

  module.noteOff = function() {
    if (currentEvent) {
      currentEvent.endTime = Date.now();
      events.push(currentEvent);
      currentEvent = null;
    }
  };

  module.stop = function() {
    // Close any open note
    if (currentEvent) {
      currentEvent.endTime = Date.now();
      events.push(currentEvent);
      currentEvent = null;
    }

    // Filter out notes shorter than MIN_DURATION (waver filtering)
    var filtered = [];
    for (var i = 0; i < events.length; i++) {
      var dur = events[i].endTime - events[i].startTime;
      if (dur >= module.MIN_DURATION) {
        filtered.push(events[i]);
      }
    }

    if (filtered.length === 0) return;

    downloadCSV(filtered);
  };

  function buildCSV(filtered) {
    var lines = ['timestamp_ms,duration_ms,midi_note,note_name,octave,frequency_hz,cents_offset,trichord'];
    for (var i = 0; i < filtered.length; i++) {
      var e = filtered[i];
      var timestamp = e.startTime - sessionStart;
      var duration = e.endTime - e.startTime;
      var noteName = NOTE_NAMES[e.midiNote % 12];
      var octave = Math.floor(e.midiNote / 12) - 1;
      lines.push(
        timestamp + ',' +
        duration + ',' +
        e.midiNote + ',' +
        noteName + ',' +
        octave + ',' +
        e.frequency.toFixed(1) + ',' +
        e.centsOffset + ',' +
        e.trichord
      );
    }
    return lines.join('\n') + '\n';
  }

  function downloadCSV(filtered) {
    var csv = buildCSV(filtered);
    var blob = new Blob([csv], { type: 'text/csv' });
    var url = URL.createObjectURL(blob);

    var now = new Date();
    var pad = function(n) { return n < 10 ? '0' + n : '' + n; };
    var filename = 'tonnetz-notes-' +
      now.getFullYear() + '-' +
      pad(now.getMonth() + 1) + '-' +
      pad(now.getDate()) + '-' +
      pad(now.getHours()) +
      pad(now.getMinutes()) +
      pad(now.getSeconds()) + '.csv';

    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return module;
})();
