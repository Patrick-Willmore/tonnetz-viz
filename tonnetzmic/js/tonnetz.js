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

  var W,  // width
      H,  // height
      u;  // unit distance (distance between neighbors)

  module.density = 22;
  module.ghostDuration = 500;
  module.layout = LAYOUT_RIEMANN;
  module.unitCellVisible = false;
  module.intervalA = 3;
  module.intervalB = 4;
  module.traceEnabled = false;
  module.dualMode = false;

  var trajectory = [];   // array of {tone, x, y}
  var visitedTones = {}; // tone -> true

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
    trajectory = [];
    visitedTones = {};
    this.panic();
    this.rebuild();
  };

  module.toggleDual = function() {
    this.dualMode = !this.dualMode;
    trajectory = [];
    visitedTones = {};
    this.draw(true);
  };

  module.toggleTrace = function() {
    this.traceEnabled = !this.traceEnabled;
    if (!this.traceEnabled) {
      this.clearTrajectory();
    }
  };

  module.clearTrajectory = function() {
    trajectory = [];
    visitedTones = {};
    this.draw();
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


  var addToTrajectory = function(tone) {
    visitedTones[tone] = true;
    var nodes = toneGrid[tone];
    if (nodes.length === 0) return;

    var bestNode = nodes[0];
    var bestDist = Infinity;

    if (trajectory.length > 0) {
      var last = trajectory[trajectory.length - 1];
      for (var i = 0; i < nodes.length; i++) {
        var dx = nodes[i].x - last.x;
        var dy = nodes[i].y - last.y;
        var dist = dx * dx + dy * dy;
        if (dist < bestDist) {
          bestDist = dist;
          bestNode = nodes[i];
        }
      }
    } else {
      for (var i = 0; i < nodes.length; i++) {
        var dx = nodes[i].x - W / 2;
        var dy = nodes[i].y - H / 2;
        var dist = dx * dx + dy * dy;
        if (dist < bestDist) {
          bestDist = dist;
          bestNode = nodes[i];
        }
      }
    }

    trajectory.push({tone: tone, x: bestNode.x, y: bestNode.y});
  };

  var drawTrajectoryPath = function(ctx) {
    setTranslate(ctx, 0, 0);

    if (trajectory.length > 1) {
      ctx.beginPath();
      ctx.moveTo(trajectory[0].x, trajectory[0].y);
      for (var i = 1; i < trajectory.length; i++) {
        ctx.lineTo(trajectory[i].x, trajectory[i].y);
      }
      ctx.strokeStyle = 'rgba(255, 80, 40, 0.7)';
      ctx.lineWidth = 3;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();
    }

    for (var i = 0; i < trajectory.length; i++) {
      ctx.beginPath();
      ctx.arc(trajectory[i].x, trajectory[i].y, u / 8, 0, Math.PI * 2);
      ctx.fillStyle = (i === trajectory.length - 1)
        ? 'rgba(255, 50, 20, 0.9)'
        : 'rgba(255, 120, 60, 0.6)';
      ctx.fill();
    }
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

  var drawChickenWireView = function() {
    colorscheme.update();
    ctx.clearRect(0, 0, W, H);

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

    // Centroid offsets from vertex position
    var minorOff = {x: (dirA.x + dirAB.x)/3, y: (dirA.y + dirAB.y)/3};
    var majorOff = {x: (dirB.x + dirAB.x)/3, y: (dirB.y + dirAB.y)/3};

    // CW edge vectors from minor centroids to their 3 major neighbors
    var cwEdges = [
      {x: (dirB.x - dirA.x)/3, y: (dirB.y - dirA.y)/3},
      {x: -(2*dirB.x + dirA.x)/3, y: -(2*dirB.y + dirA.y)/3},
      {x: (2*dirA.x + dirB.x)/3, y: (2*dirA.y + dirB.y)/3}
    ];

    var a = module.intervalA, b = module.intervalB;

    // Draw edges from each minor centroid (each CW edge connects minor↔major)
    for (var tone = 0; tone < 12; tone++) {
      var leftTone = (tone + a) % 12;
      var topTone = (tone + a + b) % 12;
      // Shared note pairs for each edge: [t,t+a+b], [t,t+a], [t+a,t+a+b]
      var sharePairs = [
        [tone, topTone],
        [tone, leftTone],
        [leftTone, topTone]
      ];

      for (var i = 0; i < toneGrid[tone].length; i++) {
        var nx = toneGrid[tone][i].x, ny = toneGrid[tone][i].y;
        var mcx = nx + minorOff.x, mcy = ny + minorOff.y;

        setTranslate(ctx, mcx, mcy);
        for (var e = 0; e < 3; e++) {
          var s1 = tones[sharePairs[e][0]].state;
          var s2 = tones[sharePairs[e][1]].state;
          var edgeOn = (s1 !== STATE_OFF) && (s2 !== STATE_OFF);

          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(cwEdges[e].x, cwEdges[e].y);
          ctx.strokeStyle = edgeOn ? colorscheme.stroke[STATE_ON] : colorscheme.stroke[STATE_OFF];
          ctx.lineWidth = edgeOn ? 2 : 1;
          ctx.stroke();
        }
      }
    }

    // Draw chord nodes
    setTranslate(ctx, 0, 0);
    for (var tone = 0; tone < 12; tone++) {
      var leftTone = (tone + a) % 12;
      var rightTone = (tone + b) % 12;
      var topTone = (tone + a + b) % 12;

      var minorActive = (tones[tone].state !== STATE_OFF) &&
                        (tones[leftTone].state !== STATE_OFF) &&
                        (tones[topTone].state !== STATE_OFF);
      var majorActive = (tones[tone].state !== STATE_OFF) &&
                        (tones[rightTone].state !== STATE_OFF) &&
                        (tones[topTone].state !== STATE_OFF);

      for (var i = 0; i < toneGrid[tone].length; i++) {
        var nx = toneGrid[tone][i].x, ny = toneGrid[tone][i].y;

        // Minor chord node
        var mcx = nx + minorOff.x, mcy = ny + minorOff.y;
        ctx.beginPath();
        ctx.arc(mcx, mcy, u/6, 0, Math.PI * 2);
        ctx.fillStyle = minorActive ? colorscheme.minorFill : colorscheme.fill[STATE_OFF];
        ctx.strokeStyle = minorActive ? colorscheme.stroke[STATE_ON] : colorscheme.stroke[STATE_OFF];
        ctx.lineWidth = minorActive ? 2 : 1;
        ctx.fill();
        ctx.stroke();

        // Major chord node
        var Mcx = nx + majorOff.x, Mcy = ny + majorOff.y;
        ctx.beginPath();
        ctx.arc(Mcx, Mcy, u/6, 0, Math.PI * 2);
        ctx.fillStyle = majorActive ? colorscheme.majorFill : colorscheme.fill[STATE_OFF];
        ctx.strokeStyle = majorActive ? colorscheme.stroke[STATE_ON] : colorscheme.stroke[STATE_OFF];
        ctx.lineWidth = majorActive ? 2 : 1;
        ctx.fill();
        ctx.stroke();

        // Update triad label classes for activation
        var $minor = $(toneGrid[tone][i].minorTriadLabel);
        var $major = $(toneGrid[tone][i].majorTriadLabel);
        if (minorActive) { $minor.addClass('state-ON'); } else { $minor.removeClass('state-ON'); }
        if (majorActive) { $major.addClass('state-ON'); } else { $major.removeClass('state-ON'); }
      }
    }

    // Draw trajectory if enabled
    if (module.traceEnabled) {
      drawTrajectoryPath(ctx);
    }
  };


  var drawNow = function() {
    drawTimeout = null;

    if (module.dualMode) {
      drawChickenWireView();
      return;
    }

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

    // Draw vertices.
    for (var tone=0; tone<12; tone++) {
      for (var i=0; i<toneGrid[tone].length; i++) {
        var x = toneGrid[tone][i].x, y = toneGrid[tone][i].y;
        ctx.beginPath();
        ctx.arc(x, y, u/5, 0, Math.PI * 2, false);
        ctx.closePath();

        if (module.traceEnabled && visitedTones[tone] && tones[tone].state === STATE_OFF) {
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
      }
    }
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
    trajectory = [];  // positions invalid after resize

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

    this.draw(true);
  };

  return module;
})();
