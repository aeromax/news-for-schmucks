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

  /* Web Audio setup */
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  let ctx, analyser, sourceNode, data, rafId;

  function ensureAudioGraph() {
    if (!ctx) ctx = new AudioCtx();
    if (!analyser) {
      analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.4;
      data = new Uint8Array(analyser.frequencyBinCount);
    }
    if (!sourceNode && audio) {
      sourceNode = ctx.createMediaElementSource(audio);
      sourceNode.connect(analyser);
      analyser.connect(ctx.destination);
    }
  }

  /* ---------- amplitude-driven scaling ---------- */
  function animateBlobs() {
    analyser.getByteFrequencyData(data);

    const avgSlice = (start, end) => {
      let sum = 0;
      for (let i = start; i < end; i++) sum += data[i];
      return (sum / (end - start)) / 255; // → 0‒1
    };

    const now = performance.now() / 1000;

    const scales = [
      1 + avgSlice(0, 8) * 0,       // low bass thump
      1 + avgSlice(32, 96) * 0.5,   // mids
      1 + avgSlice(8, 48) * 0.1,    // highs
      1 + avgSlice(32, 96) * 0.1    // mids again
    ];

    blobs.forEach((b, i) => {
      const jitter = 1 + Math.sin(now * (1.3 + i * 0.7)) * 0.02;
      b.style.setProperty('--scale', (scales[i] * jitter).toFixed(3));
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
    if (ctx.state !== 'running') await ctx.resume();
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
})();
