(() => {
  /* ---------- headline ---------- */
  const headlineDate = document.querySelector('.date');
  if (headlineDate) {
    headlineDate.textContent = `${new Date().toLocaleDateString(undefined, {
      year: 'numeric', month: 'long', day: 'numeric'
    })}`;
  }

  /* ---------- audio + blobs ---------- */
  const audio = document.querySelector('.audio');
  const playIcon = document.querySelector('.play-icon');
  const blobs = Array.from(document.querySelectorAll('.blob'));

  /* Detect iOS (including iPadOS on Mac hardware) */
  const isIOS = (() => {
    const ua = navigator.userAgent || '';
    const isAppleMobile = /iPad|iPhone|iPod/.test(ua);
    const isTouchMac = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
    return isAppleMobile || isTouchMac;
  })();

  /* Web Audio setup (disabled on iOS to allow background playback) */
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  let ctx, analyser, sourceNode, data, rafId;
  const useWebAudio = !!AudioCtx && !isIOS;

  function ensureAudioGraph() {
    if (!useWebAudio) return;
    if (!ctx) ctx = new AudioCtx();
    if (!analyser) {
      analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.4;
      data = new Uint8Array(analyser.frequencyBinCount);
    }
    if (!sourceNode && audio) {
      // Tap the HTMLAudioElement into the analyser; do NOT route to destination
      // to avoid duplicating audio. The element already plays out-of-graph.
      sourceNode = ctx.createMediaElementSource(audio);
      sourceNode.connect(analyser);
    }
  }

  /* ---------- amplitude-driven scaling ---------- */
  function animateBlobs() {
    let scales;
    if (useWebAudio && analyser && data) {
      analyser.getByteFrequencyData(data);

      const avgSlice = (start, end) => {
        let sum = 0;
        for (let i = start; i < end; i++) sum += data[i];
        return (sum / (end - start)) / 255; // → 0‒1
      };

      const now = performance.now() / 1000;

      scales = [
        1 + avgSlice(0, 8) * 0,       // low bass thump
        1 + avgSlice(32, 96) * 0.5,   // mids
        1 + avgSlice(8, 48) * 0.1,    // highs
        1 + avgSlice(32, 96) * 0.1    // mids again
      ].map((s, i) => s * (1 + Math.sin(now * (1.3 + i * 0.7)) * 0.02));
    } else {
      // Lightweight fallback: time-based pulse so we still have motion
      const t = (audio?.currentTime || 0);
      scales = [0, 1, 2, 3].map((i) => 1 + Math.sin(t * (1.1 + i * 0.4)) * 0.05);
    }

    blobs.forEach((b, i) => {
      b.style.setProperty('--scale', (scales[i]).toFixed(3));
    });

    rafId = requestAnimationFrame(animateBlobs);
  }

  function stopAnim() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
  }

  /* ---------- play / pause logic ---------- */
  async function play() {
    ensureAudioGraph();
    if (useWebAudio && ctx && ctx.state !== 'running') {
      try { await ctx.resume(); } catch {}
    }
    await audio.play();
    playIcon.classList.replace('play', 'pause');
    animateBlobs();
  }

  function pause() {
    audio.pause();
    playIcon.classList.replace('pause', 'play');
    stopAnim();
  }

  if (playIcon) {
    playIcon.addEventListener('click', () => audio.paused ? play() : pause());
  }
  if (audio) {
    audio.addEventListener('ended', pause);
    audio.addEventListener('pause', () => { if (!audio.ended) pause(); });
    document.addEventListener('visibilitychange', () => {
      // Stop visualizer when hidden to save CPU; keep audio playing.
      if (document.visibilityState === 'hidden') {
        stopAnim();
      } else if (!audio.paused) {
        // Resume visual animation (and webaudio if applicable) when visible again
        if (useWebAudio && ctx && ctx.state !== 'running') {
          try { ctx.resume(); } catch {}
        }
        animateBlobs();
      }
    });
  }

  /* optional progress ring support */
  const ring = document.querySelector('.play-icon .progress-ring');
  if (!audio || !ring) return;

  const radius = ring.r.baseVal.value;
  const circumference = 2 * Math.PI * radius;
  ring.style.strokeDasharray = `${circumference}`;
  ring.style.strokeDashoffset = `${circumference}`;

  function tick() {
    if (audio.duration) {
      const pct = audio.currentTime / audio.duration;
      ring.style.strokeDashoffset = circumference * (1 - pct);
    }
    requestAnimationFrame(tick);
  }
  tick();

  /* ---------- Media Session (lock screen controls) ---------- */
  if ('mediaSession' in navigator && audio) {
    const dateText = (() => {
      try {
        return new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
      } catch { return ''; }
    })();
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: 'News for Schmucks',
        artist: dateText || 'Daily',
        album: 'news-for-schmucks',
      });
    } catch {}

    const seek = (delta) => {
      if (!audio) return;
      const dur = isFinite(audio.duration) ? audio.duration : 0;
      const pos = isFinite(audio.currentTime) ? audio.currentTime : 0;
      const next = Math.max(0, Math.min(dur || Infinity, pos + delta));
      audio.currentTime = next;
    };

    try { navigator.mediaSession.setActionHandler('play', () => audio.play()); } catch {}
    try { navigator.mediaSession.setActionHandler('pause', () => audio.pause()); } catch {}
    try { navigator.mediaSession.setActionHandler('seekbackward', () => seek(-10)); } catch {}
    try { navigator.mediaSession.setActionHandler('seekforward', () => seek(30)); } catch {}
    try { navigator.mediaSession.setActionHandler('stop', () => audio.pause()); } catch {}
    try {
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (details && typeof details.seekTime === 'number') audio.currentTime = details.seekTime;
      });
    } catch {}

    const updatePosition = () => {
      if (!('setPositionState' in navigator.mediaSession)) return;
      const dur = isFinite(audio.duration) ? audio.duration : 0;
      if (!dur) return;
      try {
        navigator.mediaSession.setPositionState({
          duration: dur,
          playbackRate: audio.playbackRate || 1,
          position: isFinite(audio.currentTime) ? audio.currentTime : 0,
        });
      } catch {}
    };
    audio.addEventListener('timeupdate', updatePosition);
    audio.addEventListener('loadedmetadata', updatePosition);
    audio.addEventListener('play', updatePosition);
  }
})();
