var tonnetz = (function() {
  "use strict";

  var module = {};

  var TONE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
  var STATE_OFF = 0,
      STATE_GHOST = 1,
      STATE_SUST = 2,
      STATE_ON = 3;
  var STATE_NAMES = ['OFF', 'GHOST', 'SUSTAIN', 'ON'];
  var LAYOUT_RIEMANN = 'riemann',
      LAYOUT_SONOME = 'sonome';
  var REGION_FILL_1 = 'rgba(100, 140, 220, 0.25)';  // distance 1
  var REGION_FILL_2 = 'rgba(100, 140, 220, 0.12)';  // distance 2
  var SUGGEST_STROKE = 'rgba(120, 220, 90, 0.7)';  // green ring

  var W,  // width
      H,  // height
      u;  // unit distance (distance between neighbors)

  module.density = 14;
  module.ghostDuration = 500;
  module.layout = LAYOUT_RIEMANN;
  module.unitCellVisible = false;
  module.intervalA = 3;
  module.intervalB = 4;
  module.traceEnabled = false;
  module.regionsEnabled = false;
  module.suggestEnabled = false;

  var trajectory = [];   // array of {type:'note', tone, x, y} or {type:'triad', root, kind, tones, x, y, verts}
  var visitedTones = {}; // tone -> true

  var suggestionCounts = [0,0,0,0,0,0,0,0,0,0,0,0];
  var frozenSuggestions = [false,false,false,false,false,false,false,false,false,false,false,false];
  var suggestionTracking = false;

  var replayState = null;      // null = not replaying
  var replayActiveTone = null;  // pitch class (0-11) currently highlighted, or null
  var replaySpeed = 300;        // ms per segment (Normal)

  var toneGrid = [];
  var tones;
  var channels;

  var sustainEnabled = true,
      sustain = false;

  var SQRT_3 = Math.sqrt(3);
  var CHANNELS = 18;  // 17th = computer keyboard, 18th = microphone


  module.init = function() {
    tones = $.map(Array(12), function(_, i) {
      return {
        'pitch': i,
        'name': TONE_NAMES[i],
        'state': STATE_OFF,
        'byChannel': {},     // counts of this tone in each channel
        'channelsSust': {},  // channels where the tone is sustained
        'released': null,    // the last time the note was on
        'cache': {}          // temporary data
      };
    });

    channels = $.map(Array(CHANNELS), function(_, i) {
      return {
        'number': i,
        'pitches': {},
        'sustTones': {},
        'sustain': false
      };
    });

    this.rebuild();
    window.onresize = function() { module.rebuild(); };
  };


  module.noteOn = function(c, pitch) {
    audio.noteOn(c, pitch);

    if (!(pitch in channels[c].pitches)) {
      var i = pitch%12;
      tones[i].state = STATE_ON;

      if (!tones[i].byChannel[c])
        tones[i].byChannel[c] = 1;
      else
        tones[i].byChannel[c]++;

      channels[c].pitches[pitch] = 1;

      // Remove sustain
      delete tones[i].channelsSust[c];
      delete channels[c].sustTones[i];

      if (module.traceEnabled) {
        addToTrajectory(i);
      }
    }
    this.draw();
  };

  module.noteOff = function(c, pitch) {
    audio.noteOff(c, pitch);

    if (pitch in channels[c].pitches) {
      var i = pitch%12;
      delete channels[c].pitches[pitch];
      tones[i].byChannel[c]--;

      // Check if this was the last instance of the tone in this channel
      if (tones[i].byChannel[c] === 0) {
        delete tones[i].byChannel[c];

        // Check if this was the last channel with this tone
        if ($.isEmptyObject(tones[i].byChannel)) {
          if (sustainEnabled && channels[c].sustain) {
            tones[i].state = STATE_SUST;
            channels[c].sustTones[i] = 1;
          } else {
            // change state to STATE_GHOST or STATE_OFF
            // depending on setting
            releaseTone(tones[i]);
          }
        }
      }

      this.draw();
    }
  };

  module.allNotesOff = function(c) {
    audio.allNotesOff(c);

    for (var i=0; i<12; i++) {
      delete tones[i].byChannel[c];
      delete tones[i].channelsSust[c];

      // Check if this tone is turned off in all channels
      if ($.isEmptyObject(tones[i].byChannel)) {
        tones[i].state = STATE_OFF;
      }
    }

    channels[c].pitches = {};
    channels[c].sustTones = {};

    this.draw();
  };

  module.sustainOn = function(c) {
    channels[c].sustain = true;
  };

  module.sustainOff = function(c) {
    channels[c].sustain = false;
    channels[c].sustTones = {};

    for (var i=0; i<12; i++) {
      delete tones[i].channelsSust[c];

      if (tones[i].state == STATE_SUST &&
          $.isEmptyObject(tones[i].channelsSust)) {
        releaseTone(tones[i]);
      }
    }

    this.draw();
  };

  module.panic = function() {
    for (var i=0; i<CHANNELS; i++) {
      this.sustainOff(i);
      this.allNotesOff(i);
    }
  };


  module.toggleSustainEnabled = function() {
    sustainEnabled = !sustainEnabled;
  };

  module.setDensity = function(density) {
    if (isFinite(density) && density >= 5 && density <= 50) {
      this.density = density;
      this.rebuild();
    }
  };

  module.setGhostDuration = function(duration) {
    if (isFinite(duration) && duration !== null && duration !== '') {
      duration = Number(duration);
      if (duration >= 0) {
        if (duration != this.ghostDuration) {
          this.ghostDuration = duration;
          this.draw();
        }
        return true;
      }
    }

    return false;
  };

  module.setLayout = function(layout) {
    this.layout = layout;
    this.rebuild();
  };

  module.toggleUnitCell = function() {
    this.unitCellVisible = !this.unitCellVisible;
    this.draw();
  };

  module.setIntervals = function(a, b) {
    this.intervalA = a;
    this.intervalB = b;
    this.stopReplay();
    this.panic();
    this.rebuild();
  };

  module.toggleDual = function() {
    var tmp = this.intervalA;
    this.intervalA = this.intervalB;
    this.intervalB = tmp;
    this.stopReplay();
    this.panic();
    this.rebuild();
  };

  module.toggleTrace = function() {
    this.traceEnabled = !this.traceEnabled;
    if (!this.traceEnabled) {
      this.clearTrajectory();
    }
  };

  module.toggleRegions = function() {
    this.regionsEnabled = !this.regionsEnabled;
    this.draw();
  };

  module.toggleSuggest = function() {
    this.suggestEnabled = !this.suggestEnabled;
    this.draw();
  };

  module.startSuggestionTracking = function() {
    for (var i = 0; i < 12; i++) {
      suggestionCounts[i] = 0;
      frozenSuggestions[i] = false;
    }
    suggestionTracking = true;
  };

  module.stopSuggestionTracking = function() {
    suggestionTracking = false;
    var sum = 0, nonZero = 0;
    for (var i = 0; i < 12; i++) {
      if (suggestionCounts[i] > 0) { sum += suggestionCounts[i]; nonZero++; }
    }
    if (nonZero === 0) return;
    var mean = sum / nonZero;
    for (var i = 0; i < 12; i++) {
      frozenSuggestions[i] = suggestionCounts[i] >= mean;
    }
  };

  module.clearTrajectory = function() {
    this.stopReplay();
    trajectory = [];
    visitedTones = {};
    this.draw();
  };

  module.startReplay = function() {
    if (trajectory.length < 2) return;
    replayState = {
      segment: 0,
      startTime: null,
      speed: replaySpeed,
      rafId: null
    };
    replayActiveTone = null;
    replayState.rafId = requestAnimationFrame(replayTick);
  };

  module.stopReplay = function() {
    if (replayState !== null) {
      if (replayState.rafId !== null) {
        cancelAnimationFrame(replayState.rafId);
      }
      replayState = null;
      replayActiveTone = null;
      this.draw();
    }
  };

  module.setReplaySpeed = function(ms) {
    replaySpeed = ms;
    if (replayState !== null) {
      replayState.speed = ms;
    }
  };

  module.isReplaying = function() {
    return replayState !== null;
  };

  module.getTrajectoryLength = function() {
    return trajectory.length;
  };


  var releaseTone = function(tone) {
    tone.release = new Date();
    if (module.ghostDuration > 0) {
      tone.state = STATE_GHOST;
      ghosts();
    } else {
      tone.state = STATE_OFF;
    }
  };


  var ghostsInterval = null;

  /**
   * Check for dead ghost tones and turn them off. Keep
   * checking using setInterval as long as there are
   * any ghost tones left.
   */
  var ghosts = function() {
    if (ghostsInterval === null) {
      ghostsInterval = setInterval(function() {
        var numAlive = 0, numDead = 0;
        var now = new Date();

        for (var i=0; i<12; i++) {
          if (tones[i].state == STATE_GHOST) {
            if (now - tones[i].release >= module.ghostDuration) {
              tones[i].state = STATE_OFF;
              numDead++;
            } else {
              numAlive++;
            }
          }
        }

        if (numAlive == 0) {
          clearInterval(ghostsInterval);
          ghostsInterval = null;
        }

        if (numDead>0)
          module.draw();
      }, Math.min(module.ghostDuration, 30));
    }
  };


  var computeRegionDepths = function() {
    var a = module.intervalA;
    var b = module.intervalB;
    var minor = [], major = [];
    var i;
    for (i = 0; i < 12; i++) { minor[i] = -1; major[i] = -1; }

    // Detect active triads (all 3 vertices non-OFF)
    var queue = [];
    for (i = 0; i < 12; i++) {
      var root = tones[i].state !== STATE_OFF;
      var left = tones[(i + a) % 12].state !== STATE_OFF;
      var right = tones[(i + b) % 12].state !== STATE_OFF;
      var top = tones[(i + a + b) % 12].state !== STATE_OFF;

      // minor(i): root, root+a, root+a+b
      if (root && left && top) {
        minor[i] = 0;
        queue.push({type: 'minor', tone: i, depth: 0});
      }
      // major(i): root, root+b, root+a+b
      if (root && right && top) {
        major[i] = 0;
        queue.push({type: 'major', tone: i, depth: 0});
      }
    }

    // BFS to depth 2
    var qi = 0;
    while (qi < queue.length) {
      var cur = queue[qi++];
      if (cur.depth >= 2) continue;
      var nd = cur.depth + 1;
      var neighbors;

      if (cur.type === 'minor') {
        // minor(t) neighbors: major(t), major((t-b+12)%12), major((t+a)%12)
        neighbors = [
          {type: 'major', tone: cur.tone},
          {type: 'major', tone: (cur.tone - b + 12) % 12},
          {type: 'major', tone: (cur.tone + a) % 12}
        ];
      } else {
        // major(t) neighbors: minor(t), minor((t-a+12)%12), minor((t+b)%12)
        neighbors = [
          {type: 'minor', tone: cur.tone},
          {type: 'minor', tone: (cur.tone - a + 12) % 12},
          {type: 'minor', tone: (cur.tone + b) % 12}
        ];
      }

      for (var j = 0; j < neighbors.length; j++) {
        var n = neighbors[j];
        var arr = (n.type === 'minor') ? minor : major;
        if (arr[n.tone] === -1) {
          arr[n.tone] = nd;
          queue.push({type: n.type, tone: n.tone, depth: nd});
        }
      }
    }

    return {minor: minor, major: major};
  };

  var computeSuggestedTones = function() {
    var a = module.intervalA;
    var b = module.intervalB;
    var suggested = [];
    for (var i = 0; i < 12; i++) suggested[i] = false;

    for (var t = 0; t < 12; t++) {
      // Minor triad: t, (t+a)%12, (t+a+b)%12
      var mVerts = [t, (t + a) % 12, (t + a + b) % 12];
      var mActive = 0;
      var mMissing = -1;
      for (var j = 0; j < 3; j++) {
        if (tones[mVerts[j]].state !== STATE_OFF) {
          mActive++;
        } else {
          mMissing = mVerts[j];
        }
      }
      if (mActive === 2 && mMissing >= 0) suggested[mMissing] = true;

      // Major triad: t, (t+b)%12, (t+a+b)%12
      var MVerts = [t, (t + b) % 12, (t + a + b) % 12];
      var MActive = 0;
      var MMissing = -1;
      for (var j = 0; j < 3; j++) {
        if (tones[MVerts[j]].state !== STATE_OFF) {
          MActive++;
        } else {
          MMissing = MVerts[j];
        }
      }
      if (MActive === 2 && MMissing >= 0) suggested[MMissing] = true;
    }

    return suggested;
  };

  var remapTrajectory = function() {
    for (var i = 0; i < trajectory.length; i++) {
      var entry = trajectory[i];
      var refX = (i > 0) ? trajectory[i - 1].x : W / 2;
      var refY = (i > 0) ? trajectory[i - 1].y : H / 2;

      if (entry.type === 'triad') {
        // Remap each vertex to the closest grid node for its tone
        var curRefX = refX, curRefY = refY;
        for (var v = 0; v < 3; v++) {
          var node = pickClosestNode(entry.tones[v], curRefX, curRefY);
          if (node) {
            entry.verts[v].x = node.x;
            entry.verts[v].y = node.y;
            curRefX = node.x;
            curRefY = node.y;
          }
        }
        entry.x = (entry.verts[0].x + entry.verts[1].x + entry.verts[2].x) / 3;
        entry.y = (entry.verts[0].y + entry.verts[1].y + entry.verts[2].y) / 3;
      } else {
        // Note entry
        var node = pickClosestNode(entry.tone, refX, refY);
        if (node) {
          entry.x = node.x;
          entry.y = node.y;
        }
      }
    }
  };

  var pickClosestNode = function(tone, refX, refY) {
    var nodes = toneGrid[tone];
    if (!nodes || nodes.length === 0) return null;

    // Compute drift weight based on how far ref point is from center
    var driftFromCenter = Math.sqrt((refX - W/2)*(refX - W/2) + (refY - H/2)*(refY - H/2));
    var screenDiag = Math.sqrt(W*W + H*H);
    var driftWeight = Math.min(driftFromCenter / (screenDiag * 0.3), 0.5);

    var bestNode = nodes[0];
    var bestScore = Infinity;
    for (var i = 0; i < nodes.length; i++) {
      var dx = nodes[i].x - refX;
      var dy = nodes[i].y - refY;
      var distPrev = dx*dx + dy*dy;
      var dxC = nodes[i].x - W/2, dyC = nodes[i].y - H/2;
      var distCenter = dxC*dxC + dyC*dyC;
      var score = distPrev + driftWeight * distCenter;
      if (score < bestScore) {
        bestScore = score;
        bestNode = nodes[i];
      }
    }
    return bestNode;
  };

  var tryDetectTriad = function() {
    // Collect last 3 distinct pitch classes from recent note entries
    var recentNotes = [];
    var seen = {};
    for (var i = trajectory.length - 1; i >= 0 && recentNotes.length < 3; i--) {
      var entry = trajectory[i];
      if (entry.type !== 'note') break; // stop at a triad boundary
      if (!seen[entry.tone]) {
        seen[entry.tone] = true;
        recentNotes.unshift({tone: entry.tone, index: i});
      }
    }
    if (recentNotes.length < 3) return false;

    var t0 = recentNotes[0].tone;
    var t1 = recentNotes[1].tone;
    var t2 = recentNotes[2].tone;
    var pitches = [t0, t1, t2];
    var a = module.intervalA;
    var b = module.intervalB;
    var ab = (a + b) % 12;

    // Try each pitch as root for minor triad: root, root+a, root+a+b
    // and major triad: root, root+b, root+a+b
    var match = null;
    for (var r = 0; r < 3; r++) {
      var root = pitches[r];
      var others = pitches.filter(function(_, idx) { return idx !== r; });

      // Minor: root, root+a, root+ab
      var needA = (root + a) % 12;
      var needAB = (root + ab) % 12;
      if ((others[0] === needA && others[1] === needAB) ||
          (others[1] === needA && others[0] === needAB)) {
        match = {root: root, kind: 'minor', tones: [root, needA, needAB]};
        break;
      }

      // Major: root, root+b, root+ab
      var needB = (root + b) % 12;
      if ((others[0] === needB && others[1] === needAB) ||
          (others[1] === needB && others[0] === needAB)) {
        match = {root: root, kind: 'major', tones: [root, needB, needAB]};
        break;
      }
    }

    if (!match) return false;

    console.log('Triad detected:', match.kind, 'root=' + TONE_NAMES[match.root],
      'tones=[' + match.tones.map(function(t) { return TONE_NAMES[t]; }).join(', ') + ']',
      'intervals: a=' + a + ' b=' + b);

    // Find the first note-entry index that is part of this triad
    var firstIdx = recentNotes[0].index;

    // Get reference position from entry before the triad notes
    var refX = W / 2, refY = H / 2;
    if (firstIdx > 0) {
      refX = trajectory[firstIdx - 1].x;
      refY = trajectory[firstIdx - 1].y;
    }

    // Pick vertices for each triad tone, chaining from ref
    var verts = [];
    var curRefX = refX, curRefY = refY;
    for (var v = 0; v < 3; v++) {
      var node = pickClosestNode(match.tones[v], curRefX, curRefY);
      if (!node) return false;
      verts.push({x: node.x, y: node.y});
      curRefX = node.x;
      curRefY = node.y;
    }

    var cx = (verts[0].x + verts[1].x + verts[2].x) / 3;
    var cy = (verts[0].y + verts[1].y + verts[2].y) / 3;

    // Remove the note entries that formed this triad
    trajectory.splice(firstIdx, trajectory.length - firstIdx);

    // Push the triad entry
    trajectory.push({
      type: 'triad',
      root: match.root,
      kind: match.kind,
      tones: match.tones,
      x: cx,
      y: cy,
      verts: verts
    });

    return true;
  };

  var addToTrajectory = function(tone) {
    visitedTones[tone] = true;
    var nodes = toneGrid[tone];
    if (!nodes || nodes.length === 0) return;

    var refX = W / 2, refY = H / 2;
    if (trajectory.length > 0) {
      var last = trajectory[trajectory.length - 1];
      refX = last.x;
      refY = last.y;
    }

    var bestNode = pickClosestNode(tone, refX, refY);
    if (!bestNode) return;

    trajectory.push({type: 'note', tone: tone, x: bestNode.x, y: bestNode.y});
    console.log('Note added:', TONE_NAMES[tone], '(' + tone + ')');

    // Try to detect and collapse a triad
    tryDetectTriad();
  };

  var drawTrajectoryPath = function(ctx) {
    setTranslate(ctx, 0, 0);

    // Flow line connecting consecutive triad centroids
    var triadEntries = [];
    for (var i = 0; i < trajectory.length; i++) {
      if (trajectory[i].type === 'triad') triadEntries.push(trajectory[i]);
    }
    if (triadEntries.length > 1) {
      ctx.beginPath();
      ctx.moveTo(triadEntries[0].x, triadEntries[0].y);
      for (var i = 1; i < triadEntries.length; i++) {
        ctx.lineTo(triadEntries[i].x, triadEntries[i].y);
      }
      ctx.strokeStyle = 'rgba(255, 80, 40, 0.3)';
      ctx.lineWidth = 1.5;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();
    }

    // Draw each entry
    var fontSize = Math.max(10, u * 0.2);
    for (var i = 0; i < trajectory.length; i++) {
      var entry = trajectory[i];
      var isLast = (i === trajectory.length - 1);

      if (entry.type === 'triad') {
        // Filled triangle
        ctx.beginPath();
        ctx.moveTo(entry.verts[0].x, entry.verts[0].y);
        ctx.lineTo(entry.verts[1].x, entry.verts[1].y);
        ctx.lineTo(entry.verts[2].x, entry.verts[2].y);
        ctx.closePath();
        ctx.fillStyle = isLast ? 'rgba(255, 140, 60, 0.4)' : 'rgba(255, 140, 60, 0.25)';
        ctx.fill();
        ctx.strokeStyle = isLast ? 'rgba(255, 50, 20, 0.9)' : 'rgba(255, 100, 40, 0.6)';
        ctx.lineWidth = isLast ? 2 : 1;
        ctx.stroke();

        // Chord label at centroid
        var label = TONE_NAMES[entry.root] + (entry.kind === 'minor' ? 'm' : '');
        ctx.save();
        ctx.font = 'bold ' + fontSize + 'px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
        ctx.shadowBlur = 3;
        ctx.fillStyle = isLast ? '#fff' : 'rgba(255, 255, 255, 0.8)';
        ctx.fillText(label, entry.x, entry.y);
        ctx.restore();
      } else {
        // Non-triad note: small dim dot
        ctx.beginPath();
        ctx.arc(entry.x, entry.y, u / 10, 0, Math.PI * 2);
        ctx.fillStyle = isLast ? 'rgba(255, 50, 20, 0.9)' : 'rgba(255, 120, 60, 0.3)';
        ctx.fill();
      }
    }
  };


  var replayTick = function(timestamp) {
    if (replayState === null) return;

    if (replayState.startTime === null) {
      replayState.startTime = timestamp;
    }

    var elapsed = timestamp - replayState.startTime;
    var t = elapsed / replayState.speed;

    if (t >= 1) {
      replayState.segment++;
      if (replayState.segment >= trajectory.length - 1) {
        replayActiveTone = null;
        replayState = null;
        module.draw(true);
        $(document).trigger('tonnetz:replayEnd');
        return;
      }
      replayState.startTime = timestamp;
      t = 0;
    }

    var seg = replayState.segment;
    var currentEntry = (t < 0.5) ? trajectory[seg] : trajectory[seg + 1];
    if (currentEntry.type === 'triad') {
      replayActiveTone = currentEntry.tones;
    } else {
      replayActiveTone = currentEntry.tone;
    }

    module.draw(true);
    replayState.rafId = requestAnimationFrame(replayTick);
  };

  var drawReplayOverlay = function(ctx) {
    if (replayState === null) return;

    var seg = replayState.segment;
    if (seg >= trajectory.length - 1) return;

    var elapsed = (replayState.startTime !== null)
      ? (performance.now() - replayState.startTime) : 0;
    var t = Math.min(elapsed / replayState.speed, 1);

    var p0 = trajectory[seg];
    var p1 = trajectory[seg + 1];
    var x = p0.x + (p1.x - p0.x) * t;
    var y = p0.y + (p1.y - p0.y) * t;

    setTranslate(ctx, 0, 0);
    ctx.save();
    ctx.shadowColor = 'rgba(0, 200, 255, 0.6)';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(x, y, u / 4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 200, 255, 0.9)';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  };

  var drawTimeout = null;

  /**
   * Request a redraw. If true is passed as a parameter, redraw immediately.
   * Otherwise, draw at most once every 30 ms.
   */
  module.draw = function(immediately) {
    if (immediately) {
      if (drawTimeout !== null) {
        clearTimeout(drawTimeout);
      }
      drawNow();
    } else if (drawTimeout === null) {
      drawTimeout = setTimeout(drawNow, 30);
    }
  };

  var drawNow = function() {
    drawTimeout = null;

    colorscheme.update();

    var xUnit = u*SQRT_3/2;
    var uW = Math.ceil(Math.ceil(W/xUnit*2)/2);
    var uH = Math.ceil(H/u);

    var now = new Date();

    ctx.clearRect(0, 0, W, H);

    // Compute fixed hex directions (layout-dependent, interval-independent)
    var dirA, dirB, dirAB;
    if (module.layout == LAYOUT_RIEMANN) {
      dirA = {x: 0.5*u, y: -0.5*SQRT_3*u};
      dirB = {x: 0.5*u, y: 0.5*SQRT_3*u};
      dirAB = {x: u, y: 0};
    } else {
      dirA = {x: -0.5*SQRT_3*u, y: -0.5*u};
      dirB = {x: 0.5*SQRT_3*u, y: -0.5*u};
      dirAB = {x: 0, y: -u};
    }

    var regionDepths = null;
    if (module.regionsEnabled) {
      regionDepths = computeRegionDepths();
    }

    // Fill faces. Each vertex takes care of the two faces above it.
    for (var tone=0; tone<12; tone++) {
      var c = tones[tone].cache;

      var leftNeighbor = (tone + module.intervalA) % 12;
      var rightNeighbor = (tone + module.intervalB) % 12;
      var topNeighbor = (tone + module.intervalA + module.intervalB) % 12;

      c.leftPos = dirA;
      c.rightPos = dirB;
      c.topPos = dirAB;

      c.leftState = tones[leftNeighbor].state;
      c.rightState = tones[rightNeighbor].state;
      c.topState = tones[topNeighbor].state;

      var thisOn = (tones[tone].state != STATE_OFF);
      var leftOn = (c.leftState != STATE_OFF);
      var rightOn = (c.rightState != STATE_OFF);
      var topOn = (c.topState != STATE_OFF);

      // Fill faces
      for (var i=0; i<toneGrid[tone].length; i++) {
        setTranslate(ctx, toneGrid[tone][i].x, toneGrid[tone][i].y);

        var minorOn = false, majorOn = false;
        if (thisOn && topOn) {
          if (leftOn) { // left face (minor triad)
            minorOn = true;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(c.topPos.x, c.topPos.y);
            ctx.lineTo(c.leftPos.x, c.leftPos.y);
            ctx.closePath();
            ctx.fillStyle = colorscheme.minorFill;
            ctx.fill();
          }
          if (rightOn) { // right face (major triad)
            majorOn = true;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(c.topPos.x, c.topPos.y);
            ctx.lineTo(c.rightPos.x, c.rightPos.y);
            ctx.closePath();
            ctx.fillStyle = colorscheme.majorFill;
            ctx.fill();
          }
        }

        var $minorTriadLabel = $(toneGrid[tone][i].minorTriadLabel);
        var $majorTriadLabel = $(toneGrid[tone][i].majorTriadLabel);

        if (minorOn) {
          $minorTriadLabel.addClass('state-ON');
        } else {
          $minorTriadLabel.removeClass('state-ON');
        }

        if (majorOn) {
          $majorTriadLabel.addClass('state-ON');
        } else {
          $majorTriadLabel.removeClass('state-ON');
        }

        // Region shading for inactive faces
        if (regionDepths !== null) {
          if (!minorOn && regionDepths.minor[tone] > 0) {
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(c.topPos.x, c.topPos.y);
            ctx.lineTo(c.leftPos.x, c.leftPos.y);
            ctx.closePath();
            ctx.fillStyle = (regionDepths.minor[tone] === 1) ? REGION_FILL_1 : REGION_FILL_2;
            ctx.fill();
          }
          if (!majorOn && regionDepths.major[tone] > 0) {
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(c.topPos.x, c.topPos.y);
            ctx.lineTo(c.rightPos.x, c.rightPos.y);
            ctx.closePath();
            ctx.fillStyle = (regionDepths.major[tone] === 1) ? REGION_FILL_1 : REGION_FILL_2;
            ctx.fill();
          }
        }
      }
    }

    if (module.unitCellVisible && module.intervalA === 3 && module.intervalB === 4){
      drawUnitCell(ctx);
    };

    // Draw edges. Each vertex takes care of the three upward edges.
    for (var tone=0; tone<12; tone++) {
      var c = tones[tone].cache;
      var state = tones[tone].state;

      for (var i=0; i<toneGrid[tone].length; i++) {
        setTranslate(ctx, toneGrid[tone][i].x, toneGrid[tone][i].y);

        drawEdge(ctx, c.topPos, state, c.topState);
        drawEdge(ctx, c.leftPos, state, c.leftState);
        drawEdge(ctx, c.rightPos, state, c.rightState);
      }
    }

    setTranslate(ctx, 0, 0);

    // Draw trajectory path
    if (module.traceEnabled) {
      drawTrajectoryPath(ctx);
    }

    // Compute suggested tones
    var suggestedTones = null;
    if (module.suggestEnabled) {
      suggestedTones = computeSuggestedTones();
    }

    if (suggestedTones !== null && suggestionTracking) {
      for (var i = 0; i < 12; i++) {
        if (suggestedTones[i]) suggestionCounts[i]++;
      }
    }

    // Draw vertices.
    for (var tone=0; tone<12; tone++) {
      for (var i=0; i<toneGrid[tone].length; i++) {
        var x = toneGrid[tone][i].x, y = toneGrid[tone][i].y;
        ctx.beginPath();
        ctx.arc(x, y, u/5, 0, Math.PI * 2, false);
        ctx.closePath();

        var isReplayActive = (replayActiveTone !== null) && (
          (Array.isArray(replayActiveTone) ? replayActiveTone.indexOf(tone) >= 0 : replayActiveTone === tone)
        );
        if (isReplayActive && tones[tone].state === STATE_OFF) {
          ctx.fillStyle = colorscheme.fill[STATE_ON];
          ctx.strokeStyle = colorscheme.stroke[STATE_ON];
        } else if (module.traceEnabled && visitedTones[tone] && tones[tone].state === STATE_OFF) {
          ctx.fillStyle = 'rgba(255, 180, 130, 0.5)';
          ctx.strokeStyle = 'rgba(255, 100, 50, 0.8)';
        } else {
          ctx.fillStyle = colorscheme.fill[tones[tone].state];
          ctx.strokeStyle = colorscheme.stroke[tones[tone].state];
        }
        toneGrid[tone][i].label.className = 'state-' + STATE_NAMES[tones[tone].state];

        if (tones[tone].state == STATE_OFF) {
          ctx.lineWidth = 1;
        } else {
          ctx.lineWidth = 2;
        }

        ctx.fill();
        ctx.stroke();

        // Diatonic scale highlight ring
        if (typeof keyAnalysis !== 'undefined' &&
            keyAnalysis.highlightedTones[tone] &&
            tones[tone].state === STATE_OFF) {
          ctx.beginPath();
          ctx.arc(x, y, u/5 + 3, 0, Math.PI * 2, false);
          ctx.closePath();
          ctx.strokeStyle = 'rgba(100, 180, 255, 0.6)';
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        // Suggested next note ring
        var showSuggest = (suggestedTones !== null && suggestedTones[tone]) ||
                          frozenSuggestions[tone];
        if (showSuggest && tones[tone].state === STATE_OFF) {
          ctx.beginPath();
          ctx.arc(x, y, u/5 + 6, 0, Math.PI * 2, false);
          ctx.closePath();
          ctx.strokeStyle = SUGGEST_STROKE;
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }
    }

    // Draw replay playhead overlay
    drawReplayOverlay(ctx);

    $(document).trigger('tonnetz:drawn');
  };

  var setTranslate = function(ctx, x, y) {
    ctx.setTransform(1, 0, 0, 1, x, y);
  };

  var drawEdge = function(ctx, endpoint, state1, state2) {
    var state = Math.min(state1, state2);

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(endpoint.x, endpoint.y);
    ctx.strokeStyle = colorscheme.stroke[state];
    ctx.lineWidth = (state != STATE_OFF) ? 1.5 : 1;
    ctx.stroke();
  };

  var getNeighborXYDiff = function(t1, t2){
    var diff = (t2-t1+12)%12;
    var a = module.intervalA;
    var b = module.intervalB;
    var ab = (a + b) % 12;

    var result;
    if (diff === a)              result = {x: -0.5*SQRT_3*u, y: -0.5*u};
    else if (diff === ab)        result = {x: 0, y: -1*u};
    else if (diff === b)         result = {x: 0.5*SQRT_3*u, y: -0.5*u};
    else if (diff === (12-a)%12) result = {x: 0.5*SQRT_3*u, y: 0.5*u};
    else if (diff === (12-ab)%12)result = {x: 0, y: 1*u};
    else if (diff === (12-b)%12) result = {x: -0.5*SQRT_3*u, y: 0.5*u};
    else                         result = {x: -0.5*SQRT_3*u, y: -0.5*u};

    if (module.layout == LAYOUT_RIEMANN) {
      result = {x: -result.y, y: result.x};
    }

    return result;
  };

  var createLabel = function(text, x, y) {
    var label = document.createElement('div');
    var inner = document.createElement('div');
    inner.appendChild(document.createTextNode(text));
    label.appendChild(inner);
    label.style.left = x + 'px';
    label.style.top = y + 'px';
    return label;
  };

  var addNode = function(tone, x, y) {
    if (x < -u || y < -u || x > W+u || y > H+u) {
      return;
    }

    var name = tones[tone].name;
    var node = {'x': x, 'y': y};

    // Create the note label.
    node.label = createLabel(name, x, y);
    noteLabels.appendChild(node.label);

    // Create labels for the two triads above this node.
    if (module.layout == LAYOUT_RIEMANN) {
      var yUnit = u * SQRT_3;
      node.majorTriadLabel = createLabel(name.toUpperCase(), x + u/2, y + yUnit/6);
      node.minorTriadLabel = createLabel(name.toLowerCase(), x + u/2, y - yUnit/6);
    } else if (module.layout == LAYOUT_SONOME) {
      var xUnit = u * SQRT_3;
      node.majorTriadLabel = createLabel(name.toUpperCase(), x + xUnit/6, y - u/2);
      node.minorTriadLabel = createLabel(name.toLowerCase(), x - xUnit/6, y - u/2);
    }
    node.majorTriadLabel.className = 'major';
    node.minorTriadLabel.className = 'minor';
    triadLabels.appendChild(node.majorTriadLabel);
    triadLabels.appendChild(node.minorTriadLabel);

    // Add the node to the grid.
    toneGrid[tone].push(node);
  };

  var drawUnitCell = function(ctx) {
    var closest = getNeighborXYDiff(0,3);
    setTranslate(ctx, W/2-closest.x, H/2-closest.y);

    ctx.beginPath();
    ctx.moveTo(0, 0);
    if (module.layout == LAYOUT_RIEMANN) {
      ctx.lineTo(1.5*u, 3*SQRT_3*u/2);
      ctx.lineTo(3.5*u, -1*SQRT_3*u/2);
      ctx.lineTo(2*u, -4*SQRT_3*u/2);
    } else if (module.layout == LAYOUT_SONOME) {
      ctx.lineTo(-2*SQRT_3*u, -2*u);
      ctx.lineTo(-3.5*SQRT_3*u, -0.5*u);
      ctx.lineTo(-1.5*SQRT_3*u, 1.5*u);
    }
    ctx.lineTo(0, 0);
    ctx.strokeStyle = colorscheme.stroke[0];
    ctx.lineWidth = 4;
    ctx.stroke();
  };

  module.rebuild = function() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
    u = (W+H)/this.density;
    this.stopReplay();

    for (var i=0; i<12; i++) {
      toneGrid[i] = [];
    }

    $(noteLabels).empty();
    $(triadLabels).empty();

    $(noteLabels).css('font-size', u * 0.17 + 'px');
    $(triadLabels).css('font-size', u * 0.17 + 'px');

    var da = this.intervalB - this.intervalA;
    var dv = this.intervalA + this.intervalB;

    if (this.layout == LAYOUT_RIEMANN) {
      var yUnit = u * SQRT_3;
      var uW = Math.ceil(W/u);
      var uH = Math.ceil(H/yUnit);
      for(var j=-Math.floor(uW/2+1); j<=Math.floor(uW/2+1); j++){
        for(var i=-Math.floor(uH/2+1); i<=Math.floor(uH/2+1); i++){
          addNode(((da*i - dv*j)%12 + 144)%12,
                  W/2 - j*u,
                  H/2 + i*yUnit);

          addNode(((da*i - dv*j + this.intervalB)%12 + 144)%12,
                  W/2 - (j - 0.5)*u,
                  H/2 + (i + 0.5)*yUnit);
        }
      }
    } else if (this.layout == LAYOUT_SONOME) {
      var xUnit = u * SQRT_3;
      var uW = Math.ceil(W/xUnit);
      var uH = Math.ceil(H/u);

      for (var j=-Math.floor(uH/2+1); j<=Math.floor(uH/2+1); j++) {
        for (var i=-Math.floor(uW/2+1); i<=Math.floor(uW/2+1); i++) {
          addNode(((da*i - dv*j)%12 + 144)%12,
                  W/2 + i*xUnit,
                  H/2 + j*u);

          addNode(((da*i - dv*j + this.intervalB)%12 + 144)%12,
                  W/2 + (i + 0.5)*xUnit,
                  H/2 + (j - 0.5)*u);
        }
      }
    }

    remapTrajectory();
    this.draw(true);
  };

  return module;
})();
