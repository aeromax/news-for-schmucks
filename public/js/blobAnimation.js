(() => {
  /* ---------- headline ---------- */
  const headline = document.getElementById('date');
  headline.textContent = `${new Date().toLocaleDateString(undefined, {
    year: 'numeric', month: 'long', day: 'numeric'
  })}`;

  /* ---------- audio + blobs ---------- */
  const audio = document.getElementById('audio');
  const playIcon = document.getElementById('playIcon');
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
    if (!sourceNode) {
      sourceNode = ctx.createMediaElementSource(audio);
      sourceNode.connect(analyser);
      analyser.connect(ctx.destination);
    }
  }

  /* ---------- amplitude-driven scaling ---------- */
  /* ---------- amplitude-driven scaling (per blob) ---------- */
  function animateBlobs() {
    analyser.getByteFrequencyData(data);

    // helper that averages a slice of the FFT array
    const avgSlice = (start, end) => {
      let sum = 0;
      for (let i = start; i < end; i++) sum += data[i];
      return (sum / (end - start)) / 255; // → 0‒1
    };

    const now = performance.now() / 1000; // seconds

    /* blob-specific scale factors */
    const scales = [
      1 + avgSlice(0, 8) * 0,            // low bass thump
      1 + avgSlice(32, 96) * 0.5,           // mids
      1 + avgSlice(8, 48) * 0.1,          // highs / cymbals
      1 + avgSlice(32, 96) * 0.1,           // mids
    ];

    blobs.forEach((b, i) => {
      /* tiny per-blob noise so nothing is perfectly steady */
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

  playIcon.addEventListener('click', () => audio.paused ? play() : pause());
  audio.addEventListener('ended', pause);
  audio.addEventListener('pause', () => { if (!audio.ended) pause(); });

  const ring = document.querySelector('#playIcon .progress-ring');
  if (!audio || !ring) return;

  const radius = ring.r.baseVal.value;         // 48
  const circumference = 2 * Math.PI * radius;        // ≈301
  ring.style.strokeDasharray = `${circumference}`;
  ring.style.strokeDashoffset = `${circumference}`;

  /* drive the ring each frame */
  function tick() {
    if (audio.duration) {
      const pct = audio.currentTime / audio.duration; // 0→1
      ring.style.strokeDashoffset = circumference * (1 - pct);
    }
    requestAnimationFrame(tick);
  }
  tick();
})();
