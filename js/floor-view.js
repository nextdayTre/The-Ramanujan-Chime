/* ===== Harmony.FloorView — 2D Active Slice / MiniMeters EQ, MP3 Lookahead & System Audio =====
   Zero-build classic script powering the `6 · Floor WT` studio tab:
     - MP3 / WAV / OGG upload (decoded locally via Web Audio API; works over file:// and http://)
       with automatic BPM estimation, on-demand 28-slice Future/Present/Past FFT across the
       constant BPM window T = (60 * beats) / BPM, plus real-time RMS, Peak & Crest Factor!
     - System Audio (getDisplayMedia loopback), Live Mic, and optional 3-voice Chime Tone
       with a BPM-timed history ring buffer scrolling across the cutaway cavity floor! */
(function () {
  'use strict';

  var Harmony = window.Harmony = window.Harmony || {};
  var canvas = null;
  var ctx = null;

  var SLICES = 28;
  var BINS = 72;
  var MIN_HZ = 32;
  var MAX_HZ = 12000;
  var LOG_RATIO = Math.log(MAX_HZ / MIN_HZ);

  // Precomputed log-frequency Hz per bin
  var binHz = new Float32Array(BINS);
  for (var bi0 = 0; bi0 < BINS; bi0++) {
    binHz[bi0] = MIN_HZ * Math.exp((bi0 / (BINS - 1)) * LOG_RATIO);
  }

  // ---- Audio State (strictly opt-in; dormant until user uploads or clicks an audio button) ----
  var audioCtx = null;
  var analyser = null;
  var fftBuf = null;
  var timeBuf = null;
  var audioMode = 'synth'; // 'synth' | 'tone' | 'mic' | 'sys' | 'file'

  // Chime Tone / Mic / System Audio nodes
  var toneOscs = [];
  var toneMaster = null;
  var liveStream = null;
  var liveSource = null;

  // MP3 / Audio File playback & decoded PCM lookahead state
  var fileBuffer = null;
  var fileMono = null;
  var fileSampleRate = 44100;
  var fileDuration = 0;
  var fileName = '';
  var filePlaying = false;
  var fileOffsetSec = 0;
  var fileStartCtxTime = 0;
  var fileSourceNode = null;
  var fileGainNode = null;
  var detectedBpm = 120;

  // Timestamped BPM history ring buffer for live System Audio / Mic / Tone
  var HISTORY_MAX = 480; // ~8 seconds at 60 fps
  var historyRing = [];
  var tempRowsPool = null;

  function ensureTempPool() {
    if (tempRowsPool) return tempRowsPool;
    tempRowsPool = new Array(SLICES);
    for (var s = 0; s < SLICES; s++) tempRowsPool[s] = new Float32Array(BINS);
    return tempRowsPool;
  }

  var tankRippleHandler = null;
  var tankDiscGeom = null;
  var tankDragging = false;
  var tankOffCv = null;
  var tankOffCtx = null;
  var tankImgData = null;

  function fireTankPointer(ev) {
    if (!tankRippleHandler || !tankDiscGeom || !canvas) return;
    var rect = canvas.getBoundingClientRect();
    var px = ev.clientX - rect.left;
    var py = ev.clientY - rect.top;
    var nx = (px - tankDiscGeom.cx) / tankDiscGeom.rad;
    var nz = (py - tankDiscGeom.cy) / tankDiscGeom.rad;
    if (nx * nx + nz * nz <= 0.96) {
      tankRippleHandler(nx, nz);
    }
  }

  function init(el) {
    canvas = el;
    ctx = el ? el.getContext('2d') : null;
    if (canvas && !canvas._tankBound) {
      canvas._tankBound = true;
      canvas.addEventListener('pointerdown', function (ev) {
        if (!tankDiscGeom) return;
        tankDragging = true;
        fireTankPointer(ev);
      });
      window.addEventListener('pointermove', function (ev) {
        if (tankDragging) fireTankPointer(ev);
      });
      window.addEventListener('pointerup', function () {
        tankDragging = false;
      });
    }
  }

  function ensureAudioCtx() {
    if (!audioCtx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      audioCtx = new AC();
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.72;
      fftBuf = new Uint8Array(analyser.frequencyBinCount);
      timeBuf = new Float32Array(analyser.fftSize);
    }
    if (audioCtx.state === 'suspended') {
      try { audioCtx.resume(); } catch (e) { /* ignore */ }
    }
    return audioCtx;
  }

  function stopFileSource() {
    if (fileSourceNode) {
      try { fileSourceNode.onended = null; fileSourceNode.stop(); fileSourceNode.disconnect(); } catch (e) { /* ignore */ }
      fileSourceNode = null;
    }
    filePlaying = false;
  }

  function stopLiveNodes() {
    for (var i = 0; i < toneOscs.length; i++) {
      try { toneOscs[i].osc.stop(); toneOscs[i].osc.disconnect(); } catch (e) { /* ignore */ }
    }
    toneOscs = [];
    if (toneMaster) {
      try { toneMaster.disconnect(); } catch (e) { /* ignore */ }
      toneMaster = null;
    }
    if (liveSource) {
      try { liveSource.disconnect(); } catch (e) { /* ignore */ }
      liveSource = null;
    }
    if (liveStream) {
      try { liveStream.getTracks().forEach(function (tr) { tr.stop(); }); } catch (e) { /* ignore */ }
      liveStream = null;
    }
  }

  function stopAudio() {
    stopFileSource();
    stopLiveNodes();
    historyRing = [];
    audioMode = 'synth';
    syncAudioUI();
  }

  // ---- Fast Onset-Flux Autocorrelation BPM Estimator (<20ms on decoded mono PCM) ----
  function estimateBpm(mono, sr) {
    if (!mono || mono.length < sr * 2) return 120;
    var hop = Math.max(256, Math.round(sr / 86)); // ~86 frames/sec
    var maxSamples = Math.min(mono.length, sr * 45); // analyze first 45s max for speed
    var frames = Math.floor(maxSamples / hop);
    if (frames < 120) return 120;

    var env = new Float32Array(frames);
    var prevE = 0;
    for (var f = 0; f < frames; f++) {
      var base = f * hop;
      var sum = 0;
      for (var k = 0; k < hop; k += 4) {
        var v = mono[base + k];
        sum += v * v;
      }
      var e = Math.sqrt(sum / (hop * 0.25));
      var flux = e - prevE;
      env[f] = flux > 0 ? flux : 0;
      prevE = e;
    }

    var fps = sr / hop;
    var minLag = Math.max(10, Math.round(fps * 60 / 172));
    var maxLag = Math.min(frames >> 1, Math.round(fps * 60 / 72));
    var bestLag = Math.round(fps * 60 / 120);
    var bestScore = -1;

    for (var lag = minLag; lag <= maxLag; lag++) {
      var score = 0;
      for (var i = 0; i < frames - lag; i += 2) {
        score += env[i] * env[i + lag];
      }
      if (score > bestScore) {
        bestScore = score;
        bestLag = lag;
      }
    }
    var bpm = Math.round((fps * 60) / bestLag);
    if (bpm < 72) bpm *= 2;
    if (bpm > 172) bpm = Math.round(bpm * 0.5);
    return Math.max(60, Math.min(180, bpm || 120));
  }

  // ---- MP3 / Audio File Upload & Transport ----
  function getFileTimeSec() {
    if (!fileBuffer) return 0;
    if (filePlaying && audioCtx) {
      var cur = fileOffsetSec + (audioCtx.currentTime - fileStartCtxTime);
      return fileDuration > 0 ? (cur % fileDuration) : 0;
    }
    return fileOffsetSec;
  }

  function startFilePlayback(offsetSec) {
    if (!fileBuffer) return;
    var ac = ensureAudioCtx();
    if (!ac) return;
    stopLiveNodes();
    stopFileSource();

    fileOffsetSec = Math.max(0, Math.min(Math.max(0, fileDuration - 0.05), offsetSec || 0));
    var src = ac.createBufferSource();
    src.buffer = fileBuffer;
    src.loop = true;
    if (!fileGainNode) {
      fileGainNode = ac.createGain();
      fileGainNode.gain.value = 0.85;
      fileGainNode.connect(ac.destination);
    }
    src.connect(fileGainNode);
    src.start(0, fileOffsetSec);
    fileSourceNode = src;
    fileStartCtxTime = ac.currentTime;
    filePlaying = true;
    audioMode = 'file';
    syncAudioUI();
  }

  function toggleFilePlay() {
    if (!fileBuffer) return;
    if (filePlaying) {
      fileOffsetSec = getFileTimeSec();
      stopFileSource();
      audioMode = 'file';
      syncAudioUI();
    } else {
      startFilePlayback(fileOffsetSec);
    }
  }

  function seekFile(norm) {
    if (!fileBuffer || fileDuration <= 0) return;
    var target = Math.max(0, Math.min(1, norm)) * fileDuration;
    if (filePlaying) {
      startFilePlayback(target);
    } else {
      fileOffsetSec = target;
      audioMode = 'file';
      syncAudioUI();
    }
  }

  function loadAudioFile(file, callbacks) {
    if (!file) return;
    callbacks = callbacks || {};
    var ac = ensureAudioCtx();
    if (!ac) return;

    if (callbacks.onStatus) callbacks.onStatus('Decoding…');
    var reader = new FileReader();
    reader.onload = function () {
      ac.decodeAudioData(reader.result.slice(0), function (decoded) {
        stopLiveNodes();
        stopFileSource();
        fileBuffer = decoded;
        fileSampleRate = decoded.sampleRate;
        fileDuration = decoded.duration;
        fileName = file.name || 'Audio Track';

        // Mix down to mono Float32Array for instant zero-lag lookahead FFT slices
        var len = decoded.length;
        var ch0 = decoded.getChannelData(0);
        if (decoded.numberOfChannels > 1) {
          var ch1 = decoded.getChannelData(1);
          fileMono = new Float32Array(len);
          for (var i = 0; i < len; i++) fileMono[i] = 0.5 * (ch0[i] + ch1[i]);
        } else {
          fileMono = ch0;
        }

        detectedBpm = estimateBpm(fileMono, fileSampleRate);
        fileOffsetSec = 0;
        startFilePlayback(0);
        if (callbacks.onLoaded) {
          callbacks.onLoaded({ name: fileName, duration: fileDuration, bpm: detectedBpm });
        }
      }, function () {
        if (callbacks.onStatus) callbacks.onStatus('Decode failed');
      });
    };
    reader.readAsArrayBuffer(file);
  }

  // ---- Chime Tone, Mic & System Audio (getDisplayMedia) ----
  function startChimeTone(state) {
    stopAudio();
    var ac = ensureAudioCtx();
    if (!ac || !analyser) return;

    toneMaster = ac.createGain();
    toneMaster.gain.value = 0.14;
    toneMaster.connect(analyser);
    analyser.connect(ac.destination);

    var types = ['sine', 'triangle', 'sine'];
    var gains = [0.55, 0.30, 0.18];
    for (var i = 0; i < 3; i++) {
      var osc = ac.createOscillator();
      var g = ac.createGain();
      osc.type = types[i];
      osc.frequency.value = 110 * (i + 1);
      g.gain.value = gains[i];
      osc.connect(g);
      g.connect(toneMaster);
      osc.start();
      toneOscs.push({ osc: osc, gain: g });
    }
    audioMode = 'tone';
    updateChimeTone(state);
    syncAudioUI();
  }

  function updateChimeTone(state) {
    if (audioMode !== 'tone' || !audioCtx || toneOscs.length < 3) return;
    var Engine = Harmony.engine;
    var res = Engine && Engine.sphereResonance ? Engine.sphereResonance(state, state.playT || 0) : null;
    var semi = ((state.phaseRad || 0) / Math.PI) * 6;
    var baseHz = Math.max(40, Math.min(880, 98.0 * (state.f || 1) * Math.pow(2, semi / 12)));
    var alpha = (res && res.cavityActive && res.stretchRatio) ? Math.min(6, res.stretchRatio) : 2.0;
    var wall = (res && res.wallRatio) ? Math.min(8, res.wallRatio) : 1.5;

    var now = audioCtx.currentTime;
    toneOscs[0].osc.frequency.setTargetAtTime(baseHz, now, 0.04);
    toneOscs[1].osc.frequency.setTargetAtTime(Math.min(2400, baseHz * alpha), now, 0.04);
    toneOscs[2].osc.frequency.setTargetAtTime(Math.min(3600, baseHz * wall), now, 0.04);
    toneOscs[1].gain.gain.setTargetAtTime((res && res.cavityActive) ? 0.32 : 0.02, now, 0.05);
  }

  function startMic(onStatus) {
    stopAudio();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      if (onStatus) onStatus('Mic unavailable');
      return;
    }
    var ac = ensureAudioCtx();
    if (!ac || !analyser) return;
    navigator.mediaDevices.getUserMedia({ audio: true, video: false }).then(function (stream) {
      liveStream = stream;
      liveSource = ac.createMediaStreamSource(stream);
      liveSource.connect(analyser);
      try { analyser.disconnect(ac.destination); } catch (e) { /* avoid mic feedback */ }
      audioMode = 'mic';
      syncAudioUI();
      if (onStatus) onStatus('MIC LIVE');
    }).catch(function () {
      audioMode = 'synth';
      syncAudioUI();
      if (onStatus) onStatus('Mic denied');
    });
  }

  function startSystemAudio(onStatus) {
    stopAudio();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      if (onStatus) onStatus('Sys Audio unavailable');
      return;
    }
    var ac = ensureAudioCtx();
    if (!ac || !analyser) return;
    navigator.mediaDevices.getDisplayMedia({ audio: true, video: true }).then(function (stream) {
      var audioTracks = stream.getAudioTracks();
      if (!audioTracks || !audioTracks.length) {
        stream.getTracks().forEach(function (t) { t.stop(); });
        if (onStatus) onStatus('No audio shared');
        return;
      }
      liveStream = stream;
      liveSource = ac.createMediaStreamSource(stream);
      liveSource.connect(analyser);
      try { analyser.disconnect(ac.destination); } catch (e) { /* system audio already audible */ }
      audioTracks[0].addEventListener('ended', function () {
        if (audioMode === 'sys') stopAudio();
      });
      audioMode = 'sys';
      syncAudioUI();
      if (onStatus) onStatus('SYS AUDIO');
    }).catch(function () {
      audioMode = 'synth';
      syncAudioUI();
      if (onStatus) onStatus('Share cancelled');
    });
  }

  function fmtTime(sec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    var m = Math.floor(sec / 60);
    var s = Math.floor(sec % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function syncAudioUI() {
    var bTone = document.getElementById('btnFloorTone');
    var bMic = document.getElementById('btnFloorMic');
    var bSys = document.getElementById('btnFloorSys');
    var bUp = document.getElementById('btnFloorUpload');
    if (bTone) bTone.classList.toggle('active', audioMode === 'tone');
    if (bMic) bMic.classList.toggle('active', audioMode === 'mic');
    if (bSys) bSys.classList.toggle('active', audioMode === 'sys');
    if (bUp) bUp.classList.toggle('active', audioMode === 'file');

    var bar = document.getElementById('floorFileBar');
    if (bar) bar.hidden = !fileBuffer;
    var playBtn = document.getElementById('btnFloorFilePlay');
    if (playBtn) playBtn.innerHTML = filePlaying ? '&#10074;&#10074;' : '&#9654;';
    var nameEl = document.getElementById('floorFileName');
    if (nameEl) nameEl.textContent = fileName || 'No file';
  }

  // ---- Sample Linear FFT Array into 72 Log-Frequency Bands ----
  function mapLinearFftToLog72(linMag, nyq, outArr, isByte255) {
    var n = linMag.length;
    var scale = isByte255 ? (1 / 255) : 1;
    for (var b = 0; b < BINS; b++) {
      var idxF = (binHz[b] / nyq) * (n - 1);
      if (idxF < 0) idxF = 0;
      if (idxF > n - 1) idxF = n - 1;
      var i0 = Math.floor(idxF);
      var i1 = i0 < n - 1 ? i0 + 1 : i0;
      var frac = idxF - i0;
      var val = (linMag[i0] * (1 - frac) + linMag[i1] * frac) * scale;
      outArr[b] = Math.pow(val < 0 ? 0 : (val > 1 ? 1 : val), 1.12);
    }
  }

  // ---- Build Continuous Zoom-T Future / Present / Past Options for Engine.floorField() ----
  function getAudioOptions(state) {
    var Engine = Harmony.engine;
    var bpm = Math.max(40, Math.min(240, state.floorBpm || 120));
    var beats = Math.max(0.25, Math.min(16, state.floorBeats || 4));
    var windowSec = (Engine && Engine.floorZoomSec && state.floorZoomLog != null)
      ? Engine.floorZoomSec(state.floorZoomLog)
      : ((60 * beats) / bpm);
    var halfWin = windowSec * 0.5;

    // 1. Decoded MP3 / Audio File -> EXACT Lookahead Future (+z), Present (z=0), Fading Past (-z)!
    if (audioMode === 'file' && fileMono && fileDuration > 0 && Engine && Engine.fftMag) {
      var tNow = getFileTimeSec();
      var pool = ensureTempPool();
      var nyq = fileSampleRate * 0.5;

      // Update file seek bar & time display smoothly
      var scrub = document.getElementById('floorFileSeek');
      if (scrub && document.activeElement !== scrub) {
        scrub.value = String(fileDuration > 0 ? (tNow / fileDuration) : 0);
      }
      var timeEl = document.getElementById('floorFileTime');
      if (timeEl) timeEl.textContent = fmtTime(tNow) + ' / ' + fmtTime(fileDuration);

      // Compute 28 on-demand 256-pt FFT slices across [tNow - T/2 .. tNow + T/2]
      for (var s = 0; s < SLICES; s++) {
        var v = (s / (SLICES - 1)) * 2 - 1; // -1 = fading past (-z), 0 = present, +1 = incoming future (+z)
        var tSlice = tNow + v * halfWin;
        // Wrap cleanly around loop boundaries
        tSlice = ((tSlice % fileDuration) + fileDuration) % fileDuration;
        var sampleIdx = Math.floor(tSlice * fileSampleRate) - 128;
        var lin = Engine.fftMag(fileMono, sampleIdx, 256);
        mapLinearFftToLog72(lin, nyq, pool[s], false);
      }

      // Exact Present (z = 0) FFT (512-pt for crisp 2D EQ peaks & pitch readout) + RMS / Crest Factor!
      var nowIdx = Math.floor(tNow * fileSampleRate);
      var presentLin = Engine.fftMag(fileMono, nowIdx - 256, 512);
      var presentRow = new Float32Array(BINS);
      mapLinearFftToLog72(presentLin, nyq, presentRow, false);
      var dyn = Engine.audioDynamics ? Engine.audioDynamics(fileMono, nowIdx - 512, 1024) : null;

      return {
        temporalRows: pool,
        presentRow: presentRow,
        dynamics: dyn,
        bpm: bpm,
        windowBeats: beats,
        windowSec: windowSec,
        hasLookahead: true,
        sourceLabel: 'MP3 LOOKAHEAD'
      };
    }

    // 2. Live System Audio / Mic / Chime Tone -> Zoom-T History Ring Buffer scrolling Past (-z) + Present (z=0) + Forward Dispersion (+z)
    if (audioMode === 'tone') updateChimeTone(state);
    if ((audioMode === 'tone' || audioMode === 'mic' || audioMode === 'sys') && analyser && fftBuf && timeBuf) {
      analyser.getByteFrequencyData(fftBuf);
      analyser.getFloatTimeDomainData(timeBuf);

      var nyqLive = (audioCtx ? audioCtx.sampleRate : 44100) * 0.5;
      var curRow = new Float32Array(BINS);
      mapLinearFftToLog72(fftBuf, nyqLive, curRow, true);

      var nowSec = performance.now() * 0.001;
      historyRing.push({ t: nowSec, bins: curRow });
      if (historyRing.length > HISTORY_MAX) historyRing.shift();

      var poolLive = ensureTempPool();

      for (var sl = 0; sl < SLICES; sl++) {
        var vl = (sl / (SLICES - 1)) * 2 - 1; // -1 (past) .. 0 (present) .. +1 (forward shimmer)
        if (vl <= 0) {
          var targetT = nowSec - Math.abs(vl) * halfWin;
          var best = historyRing[0];
          for (var hi = historyRing.length - 1; hi >= 0; hi--) {
            best = historyRing[hi];
            if (historyRing[hi].t <= targetT) break;
          }
          poolLive[sl].set(best ? best.bins : curRow);
        } else {
          var att = Math.exp(-0.5 * Math.pow(vl / 0.42, 2));
          for (var kb = 0; kb < BINS; kb++) {
            poolLive[sl][kb] = curRow[kb] * att;
          }
        }
      }

      var dynLive = Engine && Engine.audioDynamics ? Engine.audioDynamics(timeBuf, 0, timeBuf.length) : null;
      return {
        temporalRows: poolLive,
        presentRow: curRow,
        dynamics: dynLive,
        bpm: bpm,
        windowBeats: beats,
        windowSec: windowSec,
        hasLookahead: false,
        sourceLabel: audioMode === 'sys' ? 'SYS AUDIO' : (audioMode === 'mic' ? 'MIC LIVE' : 'CHIME TONE')
      };
    }

    // 3. Read-Only BitWave Register Feed (when active and no live audio stream overrides it)
    var bwFeed = Harmony.BitWaveFeed;
    if (bwFeed && typeof bwFeed.isActive === 'function' && bwFeed.isActive()) {
      var fd = bwFeed.getFeed();
      if (fd && fd.active && fd.activeNibbles && fd.activeNibbles.length >= 2) {
        var twinDec = typeof bwFeed.decompileForState === 'function'
          ? bwFeed.decompileForState(state, state.playT)
          : null;
        return {
          bpm: bpm,
          windowBeats: beats,
          windowSec: windowSec,
          hasLookahead: false,
          sourceLabel: 'BITWAVE ' + fd.width + 'b' + (twinDec ? ' TWIN' : (fd.liveTransport === 'broadcast' ? ' LIVE' : '')),
          bitwave: {
            nibblesA: twinDec ? twinDec.P.nibbles : fd.nibblesA,
            nibblesB: twinDec ? twinDec.nullTwin.nibbles : fd.nibblesB,
            nibblesZ: twinDec ? twinDec.observed.nibbles : fd.nibblesZ,
            activeNibbles: twinDec ? twinDec.observed.nibbles : fd.activeNibbles,
            label: twinDec ? twinDec.observed.label : fd.label,
            widthBits: fd.width,
            opSymbol: fd.opSymbol,
            lane: fd.lane,
            frame: fd.frame,
            twinDec: twinDec
          }
        };
      }
    }

    return {
      bpm: bpm,
      windowBeats: beats,
      windowSec: windowSec,
      hasLookahead: false,
      sourceLabel: 'SYNTH'
    };
  }

  // ---- MiniMeters vibrant CSS RGB helper matching Scene3D ----
  function mmColorCss(u, mag, harmor, alpha) {
    var a = alpha != null ? alpha : 1;
    if (harmor) {
      var g = Math.round((0.25 + 0.75 * Math.min(1, mag * 1.15)) * 255);
      return 'rgba(' + Math.round((0.04 + 0.22 * mag) * 255) + ',' + g + ',' + Math.round((0.16 + 0.28 * mag) * 255) + ',' + a + ')';
    }
    var e = Math.max(0, Math.min(1, mag));
    var r, gr, bl;
    if (u < 0.42) {
      if (e > 0.68) {
        var t1 = (e - 0.68) / 0.32;
        r = 0.92 + 0.08 * t1;
        gr = 0.09 + 0.14 * (1 - t1);
        bl = 0.52 * (1 - t1) + 0.24 * t1;
      } else {
        var t0 = e / 0.68;
        r = 0.22 + 0.68 * t0;
        gr = 0.06 + 0.08 * t0;
        bl = 0.45 + 0.35 * t0;
      }
    } else {
      var hi = (u - 0.42) / 0.58;
      r = 0.16 * (1 - hi) + 0.38 * e * hi;
      gr = 0.20 + 0.68 * e * (0.55 + 0.45 * hi);
      bl = 0.56 + 0.42 * e;
    }
    return 'rgba(' + Math.round(r * 255) + ',' + Math.round(gr * 255) + ',' + Math.round(bl * 255) + ',' + a + ')';
  }

  // ---- RX 11-Style 2D PCM Needle Groove View (Auto-switches Macro Envelope <-> Micro Sample Dots!) ----
  function drawPcmGroove(state, field, w, h, harmor) {
    var padL = 8, padR = 8, padT = 16, padB = 14;
    var plotW = Math.max(10, w - padL - padR);
    var plotH = Math.max(10, h - padT - padB);
    var midY = padT + plotH * 0.5;
    var ampY = plotH * 0.44;
    var winSec = field.windowSec || 2.0;

    ctx.fillStyle = harmor ? '#000000' : '#060a12';
    ctx.fillRect(0, 0, w, h);

    // Shaded Inner Cavity [-r..+r] time window around Present needle z = 0
    if (field.rIn > 0.01) {
      var cavW = plotW * field.eta;
      ctx.fillStyle = harmor ? 'rgba(74,242,138,0.08)' : 'rgba(54,214,200,0.08)';
      ctx.fillRect(padL + (plotW - cavW) * 0.5, padT, cavW, plotH);
    }

    // Center -inf horizontal line & time grid
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, midY); ctx.lineTo(padL + plotW, midY);
    for (var g = 1; g < 8; g++) {
      var gx = padL + (g / 8) * plotW;
      ctx.moveTo(gx, padT); ctx.lineTo(gx, padT + plotH);
    }
    ctx.stroke();

    var waveCol = harmor ? '#4af28a' : '#2f8dff';
    var dotCol = harmor ? '#b7ffd0' : '#dce8f8';
    var showDots = false;
    var sampleCountText = '';

    if (audioMode === 'file' && fileMono && fileDuration > 0) {
      var tNow = getFileTimeSec();
      var halfWin = winSec * 0.5;
      var totalSamps = Math.max(8, Math.round(winSec * fileSampleRate));
      var startSamp = Math.floor((tNow - halfWin) * fileSampleRate);
      var monoLen = fileMono.length;

      if (totalSamps <= plotW * 0.45 || winSec <= 0.055) {
        // RX 11 Micro-Zoom: smooth interpolated curve + crisp square sample dots!
        var drawN = Math.min(totalSamps, 160);
        showDots = true;
        sampleCountText = drawN + ' PCM samples (micro-zoom)';
        ctx.strokeStyle = waveCol;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        var step = totalSamps / drawN;
        for (var i = 0; i < drawN; i++) {
          var si = Math.floor(startSamp + i * step);
          var wrapped = ((si % monoLen) + monoLen) % monoLen;
          var x = padL + (i / Math.max(1, drawN - 1)) * plotW;
          var y = midY - fileMono[wrapped] * ampY;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();

        ctx.fillStyle = dotCol;
        for (var d = 0; d < drawN; d++) {
          var dsi = Math.floor(startSamp + d * step);
          var dw = ((dsi % monoLen) + monoLen) % monoLen;
          var dx = padL + (d / Math.max(1, drawN - 1)) * plotW;
          var dy = midY - fileMono[dw] * ampY;
          ctx.fillRect(dx - 2, dy - 2, 4, 4);
        }
      } else {
        // RX 11 Macro/Mid Zoom: high-contrast min/max vertical peak columns
        var cols = Math.min(Math.floor(plotW), 420);
        var sampsPerCol = totalSamps / cols;
        sampleCountText = 'RX Macro PCM (' + totalSamps.toLocaleString() + ' samps)';
        ctx.fillStyle = waveCol;
        for (var c = 0; c < cols; c++) {
          var cStart = Math.floor(startSamp + c * sampsPerCol);
          var cEnd = Math.max(cStart + 1, Math.floor(startSamp + (c + 1) * sampsPerCol));
          var stride = Math.max(1, Math.floor((cEnd - cStart) / 32));
          var mn = 1, mx = -1;
          for (var s = cStart; s < cEnd; s += stride) {
            var sw = ((s % monoLen) + monoLen) % monoLen;
            var sv = fileMono[sw];
            if (sv < mn) mn = sv;
            if (sv > mx) mx = sv;
          }
          var cx = padL + (c / cols) * plotW;
          var yTop = midY - mx * ampY;
          var yBot = midY - mn * ampY;
          ctx.fillRect(cx, yTop, Math.max(1.2, plotW / cols), Math.max(1.2, yBot - yTop));
        }
      }
    } else if ((audioMode === 'sys' || audioMode === 'mic' || audioMode === 'tone') && timeBuf) {
      // Live time-domain buffer
      var nLive = Math.min(timeBuf.length, winSec <= 0.055 ? 96 : 512);
      showDots = nLive <= 96;
      sampleCountText = 'Live PCM (' + nLive + ' samps)';
      ctx.strokeStyle = waveCol;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (var li = 0; li < nLive; li++) {
        var lx = padL + (li / (nLive - 1)) * plotW;
        var ly = midY - timeBuf[li] * ampY;
        if (li === 0) ctx.moveTo(lx, ly); else ctx.lineTo(lx, ly);
      }
      ctx.stroke();
      if (showDots) {
        ctx.fillStyle = dotCol;
        for (var ld = 0; ld < nLive; ld++) {
          var ldx = padL + (ld / (nLive - 1)) * plotW;
          var ldy = midY - timeBuf[ld] * ampY;
          ctx.fillRect(ldx - 2, ldy - 2, 4, 4);
        }
      }
    } else {
      // Deterministic Ramanujan Chime time-domain wave scaled by Zoom T
      var pts = winSec <= 0.08 ? 64 : 240;
      showDots = winSec <= 0.08;
      sampleCountText = showDots ? 'Micro Synth PCM (' + pts + ' dots)' : 'Synth Groove (' + winSec.toFixed(2) + 's)';
      var baseHz = (field.pitch && field.pitch.freqHz > 20) ? field.pitch.freqHz : 98;
      var phNow = (state.playT || 0) * Math.PI * 2 * 4 + (state.phaseRad || 0);
      ctx.strokeStyle = waveCol;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (var pi = 0; pi < pts; pi++) {
        var u = pi / (pts - 1);
        var dt = (u - 0.5) * Math.min(0.18, winSec);
        var wv = 0.62 * Math.sin(Math.PI * 2 * baseHz * dt + phNow) +
                 0.26 * Math.sin(Math.PI * 2 * baseHz * field.alpha * dt + phNow * 0.5) +
                 0.12 * Math.sin(Math.PI * 2 * baseHz * 3 * dt);
        var px = padL + u * plotW;
        var py = midY - wv * ampY;
        if (pi === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
      if (showDots) {
        ctx.fillStyle = dotCol;
        for (var pd = 0; pd < pts; pd++) {
          var ud = pd / (pts - 1);
          var dtd = (ud - 0.5) * Math.min(0.18, winSec);
          var wvd = 0.62 * Math.sin(Math.PI * 2 * baseHz * dtd + phNow) +
                    0.26 * Math.sin(Math.PI * 2 * baseHz * field.alpha * dtd + phNow * 0.5) +
                    0.12 * Math.sin(Math.PI * 2 * baseHz * 3 * dtd);
          ctx.fillRect(padL + ud * plotW - 2, midY - wvd * ampY - 2, 4, 4);
        }
      }
    }

    // Glowing Present Stylus Needle right at z = 0 (center!)
    var needleX = padL + plotW * 0.5;
    ctx.strokeStyle = '#ffb84d';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(needleX, padT);
    ctx.lineTo(needleX, padT + plotH);
    ctx.stroke();

    // Header timeline & velocity caption
    ctx.fillStyle = '#6ee7a0';
    ctx.font = '600 9.5px "Cascadia Code", Consolas, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    var halfLbl = Harmony.engine && Harmony.engine.fmtZoomSec ? Harmony.engine.fmtZoomSec(winSec * 0.5) : (winSec * 0.5).toFixed(2) + 's';
    ctx.fillText('← PAST (−' + halfLbl + ')  |  NEEDLE z=0  |  INCOMING (+' + halfLbl + ') →   ' + sampleCountText, padL + 2, 3);

    ctx.fillStyle = '#ffb84d';
    ctx.textAlign = 'right';
    ctx.fillText('v=' + (field.floorVelocity || 1).toFixed(2) + ' Ø/s', w - padR - 2, 3);
  }

  // ---- BitWave 2D Luminous Emerald Monotone-Cubic Register & Spherical Twin Decompiler View ----
  function drawBitWaveScope(state, field, w, h, harmor) {
    var bwMod = Harmony.BitWaveFeed;
    var fd = (bwMod && typeof bwMod.getFeed === 'function') ? bwMod.getFeed() : null;
    var isLiveFeed = !!(fd && fd.active && fd.activeNibbles && fd.activeNibbles.length >= 2);
    var twinDec = (field && field.bitwave && field.bitwave.twinDec)
      ? field.bitwave.twinDec
      : (isLiveFeed && bwMod && typeof bwMod.decompileForState === 'function' ? bwMod.decompileForState(state, state.playT) : null);

    var nibA = twinDec ? twinDec.P.nibbles : (isLiveFeed ? fd.nibblesA : (bwMod ? bwMod.DEFAULT_LFO_NIBBLES : [8, 10, 13, 14, 15, 14, 13, 10, 8, 5, 2, 1, 0, 1, 2, 5]));
    var nibB = twinDec ? twinDec.nullTwin.nibbles : (isLiveFeed ? fd.nibblesB : null);
    var nibConj = twinDec ? twinDec.conj.nibbles : null;
    var nibAct = twinDec ? twinDec.observed.nibbles : (isLiveFeed ? fd.activeNibbles : nibA);
    var nLen = nibAct.length;

    var padL = 22, padR = 10, padT = 17, padB = 20;
    var plotW = Math.max(20, w - padL - padR);
    var plotH = Math.max(20, h - padT - padB);

    ctx.fillStyle = harmor ? '#000000' : '#050a0d';
    ctx.fillRect(0, 0, w, h);

    // Subtle Inner Cavity vertical proportion band centered on the register
    if (field && field.rIn > 0.01) {
      var cavW = plotW * field.eta;
      ctx.fillStyle = 'rgba(74, 242, 138, 0.045)';
      ctx.fillRect(padL + (plotW - cavW) * 0.5, padT, cavW, plotH);
    }

    // Horizontal Cavity Amplitude Gate band (|y - 8| <= 8 * eta) when Twin Decompiler is active
    if (twinDec && twinDec.eta > 0.01) {
      var hiN = Math.min(15, 8 + 8 * twinDec.eta);
      var loN = Math.max(0, 8 - 8 * twinDec.eta);
      var yTopC = padT + (1 - hiN / 15) * plotH;
      var yBotC = padT + (1 - loN / 15) * plotH;
      var isCavRule = twinDec.rule === 'cavity';
      ctx.fillStyle = isCavRule ? 'rgba(54, 214, 200, 0.11)' : 'rgba(54, 214, 200, 0.04)';
      ctx.fillRect(padL, yTopC, plotW, Math.max(1, yBotC - yTopC));
      if (isCavRule) {
        ctx.save();
        ctx.strokeStyle = 'rgba(54, 214, 200, 0.45)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(padL, yTopC); ctx.lineTo(padL + plotW, yTopC);
        ctx.moveTo(padL, yBotC); ctx.lineTo(padL + plotW, yBotC);
        ctx.stroke();
        ctx.restore();
      }
    }

    // Horizontal nibble grid lines: F (15), C (12), 8 (0x8 zero-crossing midline), 4, 0
    var levels = [
      { v: 15, lbl: 'F', dash: false },
      { v: 12, lbl: 'C', dash: false },
      { v: 8,  lbl: '8', dash: true  },
      { v: 4,  lbl: '4', dash: false },
      { v: 0,  lbl: '0', dash: false }
    ];
    ctx.font = '600 9px "Cascadia Code", Consolas, monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (var li = 0; li < levels.length; li++) {
      var lv = levels[li];
      var ly = padT + (1 - lv.v / 15) * plotH;
      ctx.strokeStyle = lv.dash ? 'rgba(255, 184, 77, 0.24)' : 'rgba(74, 242, 138, 0.09)';
      ctx.lineWidth = 1;
      ctx.setLineDash(lv.dash ? [4, 4] : []);
      ctx.beginPath();
      ctx.moveTo(padL, ly);
      ctx.lineTo(padL + plotW, ly);
      ctx.stroke();
      ctx.fillStyle = lv.dash ? '#ffb84d' : '#58706a';
      ctx.fillText(lv.lbl, padL - 5, ly);
    }
    ctx.setLineDash([]);

    // Vertical center meridian x = 0.5
    ctx.strokeStyle = 'rgba(74, 242, 138, 0.09)';
    ctx.beginPath();
    ctx.moveTo(padL + plotW * 0.5, padT);
    ctx.lineTo(padL + plotW * 0.5, padT + plotH);
    ctx.stroke();

    function traceSpline(nibbles, strokeStyle, widthPx, dashed, glowStyle) {
      if (!nibbles || nibbles.length < 2 || !bwMod) return;
      var sl = bwMod.computeCyclicSlopes(nibbles);
      var steps = Math.max(120, Math.min(360, nibbles.length * 8));
      ctx.save();
      if (dashed) ctx.setLineDash([5, 4]);
      ctx.beginPath();
      for (var i = 0; i <= steps; i++) {
        var u = i / steps;
        var raw = bwMod.sampleMonotoneRaw(nibbles, u * ((nibbles.length - 1) / nibbles.length), sl);
        var x = padL + u * plotW;
        var y = padT + (1 - raw / 15) * plotH;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      if (glowStyle) {
        ctx.strokeStyle = glowStyle;
        ctx.lineWidth = widthPx + 4.5;
        ctx.stroke();
      }
      ctx.strokeStyle = strokeStyle;
      ctx.lineWidth = widthPx;
      ctx.stroke();
      ctx.restore();
    }

    if (twinDec) {
      // Spatial Twin overlays matching top TWIN toolbar palette:
      //   P Primary (cyan-teal), P̄ Conj (amber dashed), −P Null (magenta dashed), Observed Z (glowing emerald)
      traceSpline(nibA, 'rgba(54, 214, 200, 0.52)', 1.25, false, null);
      if (nibConj) traceSpline(nibConj, 'rgba(255, 184, 77, 0.44)', 1.15, true, null);
      if (nibB) traceSpline(nibB, 'rgba(255, 92, 168, 0.48)', 1.2, true, null);
    } else {
      // Raw BitWave lane mode: A (solid emerald-teal), B (dashed cyan)
      if (isLiveFeed && fd.nibblesA && fd.frame !== 'a') {
        traceSpline(fd.nibblesA, 'rgba(46, 194, 126, 0.45)', 1.2, false, null);
      }
      if (isLiveFeed && nibB && fd.frame !== 'b') {
        traceSpline(nibB, 'rgba(54, 214, 200, 0.48)', 1.2, true, null);
      }
    }

    // Draw glowing primary active / observed BitWave register spline
    traceSpline(nibAct, isLiveFeed ? '#4af28a' : 'rgba(74, 242, 138, 0.72)', 2.1, false, isLiveFeed ? 'rgba(74, 242, 138, 0.22)' : 'rgba(74, 242, 138, 0.10)');

    // Crisp nibble knot markers for compact widths (e.g. 8-bit A5 dipole, 16-bit Quadray, 32-bit)
    if (nLen <= 16) {
      for (var ki = 0; ki < nLen; ki++) {
        var kx = padL + (nLen > 1 ? (ki / (nLen - 1)) * plotW : 0);
        var ky = padT + (1 - nibAct[ki] / 15) * plotH;
        var inCavKnot = twinDec && twinDec.cavityMask && twinDec.cavityMask[ki];
        ctx.fillStyle = (twinDec && twinDec.rule === 'cavity' && !inCavKnot) ? '#ffb84d' : '#b7ffd0';
        ctx.beginPath();
        ctx.arc(kx, ky, nLen <= 4 ? 4.2 : 2.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#050a0d';
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
    }

    // Live playhead cursor synced to state.playT
    var pT = ((state.playT || 0) % 1 + 1) % 1;
    var activeIdx = Math.min(nLen - 1, Math.floor(pT * nLen));
    if (bwMod) {
      var slAct = bwMod.computeCyclicSlopes(nibAct);
      var rawPh = bwMod.sampleMonotoneRaw(nibAct, pT * ((nLen - 1) / Math.max(1, nLen)), slAct);
      var phX = padL + pT * plotW;
      var phY = padT + (1 - rawPh / 15) * plotH;
      ctx.strokeStyle = 'rgba(255, 184, 77, 0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(phX, padT);
      ctx.lineTo(phX, padT + plotH);
      ctx.stroke();

      ctx.fillStyle = '#ffb84d';
      ctx.beginPath();
      ctx.arc(phX, phY, 3.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#050a0d';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }

    // Bottom hex nibble ruler (auto-thins labels cleanly for 64-nibble 256-bit registers)
    var stepLbl = nLen > 32 ? 2 : 1;
    ctx.font = (nLen > 32 ? '500 8.5px' : '600 9.5px') + ' "Cascadia Code", Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    for (var ni = 0; ni < nLen; ni += stepLbl) {
      var nx = padL + (nLen > 1 ? (ni / (nLen - 1)) * plotW : 0);
      var isHit = Math.abs(ni - activeIdx) < stepLbl;
      var flipCol = (twinDec && twinDec.rule === 'cavity' && twinDec.cavityMask && !twinDec.cavityMask[ni]);
      ctx.fillStyle = isHit ? '#ffb84d' : (flipCol ? '#ffc575' : (nibAct[ni] > 0 ? '#6ee7a0' : '#4a605a'));
      ctx.fillText(nibAct[ni].toString(16).toUpperCase(), nx, h - 3);
    }

    // Top-left decompiler / provenance caption + top-right live HEX/DEC/BIN readout
    ctx.font = '600 9.5px "Cascadia Code", Consolas, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    if (twinDec) {
      ctx.fillStyle = '#4af28a';
      var syzTag = twinDec.isNull ? ' · NULL 0' : (twinDec.balanced ? ' · 50% SYZYGY ★' : '');
      var decHdr = 'TWIN DECOMPILER [' + twinDec.ruleLabel + '] · θ=' + twinDec.thetaDeg.toFixed(0) + '° (k=' + twinDec.stepK + '/' + twinDec.width + ' · Q' + twinDec.quadrant + ')' + syzTag;
      ctx.fillText(decHdr, padL + 2, 2);
    } else if (isLiveFeed) {
      ctx.fillStyle = '#4af28a';
      var laneInfo = 'LANE ' + fd.lane + ' · ' + fd.labels.a + ' ' + fd.opSymbol + ' ' + fd.labels.b + ' → ' + fd.labels.z +
        '  [' + fd.width + 'b · ' + fd.nibbleCount + ' nibbles · POP ' + fd.popcount + ']';
      ctx.fillText(laneInfo, padL + 2, 2);
    } else {
      ctx.fillStyle = '#6ee7a0';
      ctx.fillText('PREVIEW · Click "8b / 64b / 256b" or paste a BitWave #bw= link / hex register', padL + 2, 2);
    }

    ctx.textAlign = 'right';
    if (twinDec) {
      ctx.fillStyle = '#b7ffd0';
      var hexDisp = twinDec.observed.hex.length > 16 ? (twinDec.observed.hex.slice(0, 12) + '…') : twinDec.observed.hex;
      var rightTxt = twinDec.width <= 16
        ? ('Z=0x' + hexDisp + ' (' + twinDec.observed.dec + ') · ' + twinDec.observed.bin)
        : ('Z=0x' + hexDisp + ' · POP ' + twinDec.observed.popcount + '/' + twinDec.width);
      ctx.fillText(rightTxt, w - padR, 2);
    } else {
      ctx.fillStyle = '#ffb84d';
      ctx.fillText('0x' + nibAct[activeIdx].toString(16).toUpperCase() + ' @ #' + activeIdx, w - padR, 2);
    }
  }

  function drawTankView(state, field, w, h, harmor) {
    ctx.fillStyle = harmor ? '#000000' : '#070b11';
    ctx.fillRect(0, 0, w, h);

    var rad = Math.max(24, Math.min(h * 0.43, w * 0.22));
    var cx = rad + 12;
    var cy = h * 0.52;
    tankDiscGeom = { cx: cx, cy: cy, rad: rad };

    var N = field.tankSize || 0;
    var grid = field.tankGrid;
    var vGrid = field.tankVelGrid;
    var mask = field.tankMask;
    var rhoMap = field.tankRho;
    var eta = field.eta || 0;

    if (N > 0 && grid && mask) {
      if (!tankOffCv || tankOffCv.width !== N) {
        tankOffCv = document.createElement('canvas');
        tankOffCv.width = N;
        tankOffCv.height = N;
        tankOffCtx = tankOffCv.getContext('2d');
        tankImgData = tankOffCtx.createImageData(N, N);
      }
      var px = tankImgData.data;
      for (var k = 0; k < N * N; k++) {
        var o = k * 4;
        if (!mask[k]) { px[o] = px[o + 1] = px[o + 2] = px[o + 3] = 0; continue; }
        var val = grid[k];
        var spd = vGrid ? Math.min(1, Math.abs(vGrid[k]) * 4.2) : 0;
        var inCav = eta > 0.01 && rhoMap && rhoMap[k] <= eta;
        var pos = Math.max(0, Math.min(1, val * 1.25));
        var neg = Math.max(0, Math.min(1, -val * 1.25));
        if (harmor) {
          var lum = Math.min(1, (pos + neg) * 0.92 + spd * 0.55);
          px[o] = Math.round(18 * pos + 60 * spd);
          px[o + 1] = Math.round((inCav ? 36 : 14) + 218 * lum);
          px[o + 2] = Math.round(35 * neg + 95 * spd);
          px[o + 3] = 255;
        } else {
          px[o] = Math.min(255, Math.round((inCav ? 34 : 12) + 228 * neg + 95 * spd + 30 * pos));
          px[o + 1] = Math.min(255, Math.round((inCav ? 18 : 26) + 215 * pos + 130 * spd + 35 * neg));
          px[o + 2] = Math.min(255, Math.round((inCav ? 36 : 46) + 210 * pos + 110 * neg + 70 * spd));
          px[o + 3] = 255;
        }
      }
      tankOffCtx.putImageData(tankImgData, 0, 0);
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.clip();
      ctx.drawImage(tankOffCv, cx - rad, cy - rad, rad * 2, rad * 2);
      ctx.restore();
    }

    // Center z=0 line, Helix chord, Inner Cavity ring, Outer Rim
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(cx - rad, cy); ctx.lineTo(cx + rad, cy); ctx.stroke();
    ctx.setLineDash([]);
    if (field.tankHelixAngle) {
      var hx = Math.cos(field.tankHelixAngle) * rad, hy = Math.sin(field.tankHelixAngle) * rad;
      ctx.strokeStyle = 'rgba(255,209,102,0.72)';
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(cx - hx, cy - hy); ctx.lineTo(cx + hx, cy + hy); ctx.stroke();
    }
    if (eta > 0.01) {
      ctx.strokeStyle = harmor ? '#00ff66' : '#ff6b7a';
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(cx, cy, rad * eta, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.strokeStyle = field.tankBoundary === 'wavefold' ? '#ffd166' : (harmor ? '#39ff14' : '#4df3dd');
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.stroke();

    // Right side: Live Front f(x) Center Slice Displacement u(x,0) + Propagation Delta du/dt
    var sx0 = cx + rad + 16;
    var sw = w - sx0 - 10;
    if (sw > 40) {
      var midY = h * 0.54;
      var ampY = h * 0.36;
      if (eta > 0.01) {
        var cavW = sw * eta;
        ctx.fillStyle = harmor ? 'rgba(0,255,102,0.08)' : 'rgba(255,107,122,0.09)';
        ctx.fillRect(sx0 + (sw - cavW) * 0.5, 16, cavW, h - 22);
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.10)';
      ctx.beginPath(); ctx.moveTo(sx0, midY); ctx.lineTo(sx0 + sw, midY); ctx.stroke();

      var act = field.activeSlice;
      var vel = field.activeVel;
      var B = act ? act.length : 0;
      if (vel && B > 1) {
        ctx.fillStyle = harmor ? 'rgba(0,255,102,0.22)' : 'rgba(110,231,160,0.22)';
        ctx.beginPath();
        ctx.moveTo(sx0, midY);
        for (var vi = 0; vi < B; vi++) {
          var vx = sx0 + (vi / (B - 1)) * sw;
          var vy = midY - Math.max(-0.95, Math.min(0.95, vel[vi] * 4.5)) * ampY;
          ctx.lineTo(vx, vy);
        }
        ctx.lineTo(sx0 + sw, midY);
        ctx.closePath();
        ctx.fill();
      }
      if (act && B > 1) {
        ctx.strokeStyle = harmor ? '#39ff14' : '#4df3dd';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        for (var ai = 0; ai < B; ai++) {
          var ax = sx0 + (ai / (B - 1)) * sw;
          var ay = midY - Math.max(-0.95, Math.min(0.95, act[ai] * 1.15)) * ampY;
          if (ai === 0) ctx.moveTo(ax, ay); else ctx.lineTo(ax, ay);
        }
        ctx.stroke();
      }
      ctx.fillStyle = harmor ? '#6ee7a0' : '#8495ad';
      ctx.font = '600 9.5px "Cascadia Code", Consolas, monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('Click/drag disc to drop ripples · Front u(x,0) & ∂u/∂t [' + (field.tankBoundary === 'wavefold' ? 'WAVEFOLD' : 'OSMOSIS') + ']', sx0, 3);
    }
  }

  function update(state, field) {
    if (!canvas || !ctx || !field) return;
    var w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    var harmor = !!(state.toggles && state.toggles.harmorVoid);
    if (field.mode === 'tank' && state.floorScopeView !== 'bitwave' && state.floorScopeView !== 'pcm') {
      drawTankView(state, field, w, h, harmor);
      return;
    }
    tankDiscGeom = null;
    if (state.floorScopeView === 'pcm') {
      drawPcmGroove(state, field, w, h, harmor);
      return;
    }
    if (state.floorScopeView === 'bitwave') {
      drawBitWaveScope(state, field, w, h, harmor);
      return;
    }

    var isSpec = field.mode === 'spectrogram';
    var B = field.bins;

    ctx.fillStyle = harmor ? '#000000' : (isSpec ? '#090918' : '#080c14');
    ctx.fillRect(0, 0, w, h);

    if (isSpec) {
      var padL = 8, padR = 8, padT = 16, padB = 16;
      var plotW = w - padL - padR;
      var plotH = h - padT - padB;

      // Vertical log-frequency grid lines
      ctx.strokeStyle = harmor ? 'rgba(74,242,138,0.10)' : 'rgba(130, 120, 220, 0.13)';
      ctx.lineWidth = 1;
      for (var g = 0; g <= 14; g++) {
        var gx = padL + (g / 14) * plotW;
        ctx.beginPath(); ctx.moveTo(gx, padT); ctx.lineTo(gx, padT + plotH); ctx.stroke();
      }

      // Spectral curtains
      var barW = plotW / (B - 1);
      for (var b = 0; b < B; b++) {
        var u = b / (B - 1);
        var mag = field.eqCenter[b];
        var bx = padL + u * plotW;
        var bh = mag * plotH;
        var by = padT + plotH - bh;
        var grad = ctx.createLinearGradient(0, by, 0, padT + plotH);
        grad.addColorStop(0, mmColorCss(u, mag, harmor, 0.94));
        grad.addColorStop(0.65, mmColorCss(u, mag * 0.72, harmor, 0.52));
        grad.addColorStop(1, mmColorCss(u, mag * 0.3, harmor, 0.08));
        ctx.fillStyle = grad;
        ctx.fillRect(bx - barW * 0.5, by, Math.max(1.5, barW + 0.6), bh);
      }

      // Crisp cyan upper contour
      ctx.strokeStyle = harmor ? '#7affad' : '#7dd3fc';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (var c = 0; c < B; c++) {
        var cx = padL + (c / (B - 1)) * plotW;
        var cy = padT + plotH - field.eqCenter[c] * plotH;
        if (c === 0) ctx.moveTo(cx, cy); else ctx.lineTo(cx, cy);
      }
      ctx.stroke();

      // Spectral tilt reference line
      ctx.strokeStyle = harmor ? 'rgba(122,255,173,0.55)' : 'rgba(103, 232, 249, 0.65)';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      for (var t = 0; t < B; t++) {
        var tx = padL + (t / (B - 1)) * plotW;
        var ty = padT + plotH - field.tiltLine[t] * plotH * 0.88;
        if (t === 0) ctx.moveTo(tx, ty); else ctx.lineTo(tx, ty);
      }
      ctx.stroke();

      // Subtle timeline caption showing Present vs BPM Window T
      ctx.fillStyle = field.hasLookahead ? '#6ee7a0' : '#7c8aa0';
      ctx.font = '600 9.5px "Cascadia Code", Consolas, monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      var tlTxt = field.hasLookahead
        ? ('← PAST (−' + (field.windowSec * 0.5).toFixed(2) + 's) · PRESENT z=0 · INCOMING (+' + (field.windowSec * 0.5).toFixed(2) + 's) →  @ ' + field.bpm + ' BPM')
        : ('PRESENT z=0 · FLOOR WINDOW T=' + field.windowSec.toFixed(2) + 's (' + field.windowBeats + 'b @ ' + field.bpm + ' BPM)');
      ctx.fillText(tlTxt, padL + 2, 3);

      // Floating MiniMeters Pitch & Cents Callout Pill over Peak Bin
      if (field.pitch && field.pitch.freqHz > 0) {
        var px = padL + (field.peakBin / (B - 1)) * plotW;
        var py = padT + plotH - field.eqCenter[field.peakBin] * plotH;
        var lbl = field.pitch.label;
        ctx.font = '600 10.5px "Cascadia Code", Consolas, monospace';
        var tw = ctx.measureText(lbl).width + 14;
        var bx0 = Math.max(padL + 4, Math.min(w - tw - 6, px + 8));
        var by0 = Math.max(15, Math.min(padT + plotH - 24, py - 10));

        ctx.fillStyle = 'rgba(11, 13, 24, 0.86)';
        ctx.strokeStyle = harmor ? 'rgba(74,242,138,0.5)' : 'rgba(125, 211, 252, 0.45)';
        ctx.lineWidth = 1;
        ctx.fillRect(bx0, by0, tw, 18);
        ctx.strokeRect(bx0, by0, tw, 18);

        ctx.fillStyle = '#e2e8f0';
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        ctx.fillText(lbl, bx0 + 7, by0 + 9.5);
      }

      // Bottom frequency ticks
      ctx.fillStyle = '#7c8aa0';
      ctx.font = '9.5px "Cascadia Code", Consolas, monospace';
      ctx.textBaseline = 'bottom';
      ctx.textAlign = 'center';
      var ticks = [
        { u: 0.06, txt: '50Hz' }, { u: 0.25, txt: '160Hz' },
        { u: 0.50, txt: '620Hz' }, { u: 0.75, txt: '2.5k' }, { u: 0.94, txt: '10k' }
      ];
      for (var tk = 0; tk < ticks.length; tk++) {
        ctx.fillText(ticks[tk].txt, padL + ticks[tk].u * plotW, h - 2);
      }
    } else {
      // GitWave-Style 2D Active Slice Oscilloscope
      var padX = 12, midY = h * 0.5;
      var ampY = h * 0.36;

      if (field.rIn > 0.01) {
        var cavHalf = (field.eta * (w - padX * 2)) * 0.5;
        ctx.fillStyle = harmor ? 'rgba(74,242,138,0.07)' : 'rgba(54,214,200,0.07)';
        ctx.fillRect(w * 0.5 - cavHalf, 6, cavHalf * 2, h - 12);
      }

      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padX, midY); ctx.lineTo(w - padX, midY);
      ctx.moveTo(w * 0.5, 8); ctx.lineTo(w * 0.5, h - 8);
      ctx.stroke();

      var sliceCol = harmor ? '#7affad' : '#ffb84d';
      ctx.save();
      ctx.strokeStyle = harmor ? 'rgba(74,242,138,0.28)' : 'rgba(255,184,77,0.28)';
      ctx.lineWidth = 6;
      ctx.beginPath();
      for (var i = 0; i < B; i++) {
        var x0 = padX + (i / (B - 1)) * (w - padX * 2);
        var y0 = midY - field.activeSlice[i] * ampY;
        if (i === 0) ctx.moveTo(x0, y0); else ctx.lineTo(x0, y0);
      }
      ctx.stroke();
      ctx.strokeStyle = sliceCol;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();

      var wtPct = Math.round(((field.activeZNorm + 1) * 0.5) * 100);
      ctx.fillStyle = '#ffb84d';
      ctx.font = '600 10px "Cascadia Code", Consolas, monospace';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillText('WT POS ' + wtPct + '% (z=' + (field.activeZ >= 0 ? '+' : '') + field.activeZ.toFixed(2) + ')', w - 10, 8);
    }
  }

  Harmony.FloorView = {
    init: init,
    update: update,
    setTankRippleHandler: function (fn) { tankRippleHandler = (typeof fn === 'function') ? fn : null; },
    getAudioOptions: getAudioOptions,
    loadAudioFile: loadAudioFile,
    toggleFilePlay: toggleFilePlay,
    seekFile: seekFile,
    toggleTone: function (state) {
      if (audioMode === 'tone') stopAudio();
      else startChimeTone(state);
    },
    toggleMic: function (onStatus) {
      if (audioMode === 'mic') stopAudio();
      else startMic(onStatus);
    },
    toggleSystemAudio: function (onStatus) {
      if (audioMode === 'sys') stopAudio();
      else startSystemAudio(onStatus);
    },
    stopAudio: stopAudio,
    getAudioMode: function () { return audioMode; },
    hasFile: function () { return !!fileBuffer; }
  };
})();
