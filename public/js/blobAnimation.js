(() => {
  const headlineDate = document.querySelector('.date');
  if (headlineDate) {
    headlineDate.textContent = `${new Date().toLocaleDateString(undefined, {
      year: 'numeric', month: 'long', day: 'numeric'
    })}`;
  }

  const audio = document.querySelector('.audio');
  const playIcon = document.querySelector('.play-icon');
  const blobs = Array.from(document.querySelectorAll('.blob'));

  let rafId = null;
  let visuals = null;

  (async () => {
    try {
      const res = await fetch('/storage/visuals.json', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data?.frames) && data.frames.length) {
        visuals = {
          interval: Number(data.interval) || 0.06,
          frames: data.frames
        };
      }
    } catch {}
  })();

  function stopAnim() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
  }

  function sampleVisuals(time) {
    if (!visuals) return null;
    const interval = visuals.interval;
    if (!interval) return null;
    const frames = visuals.frames;
    if (!frames || !frames.length) return null;
    const pos = time / interval;
    const base = Math.floor(pos);
    if (base < 0) return frames[0];
    if (base >= frames.length - 1) return frames[frames.length - 1];
    const mix = pos - base;
    const a = frames[base];
    const b = frames[base + 1];
    return {
      bass: a.bass + (b.bass - a.bass) * mix,
      mid: a.mid + (b.mid - a.mid) * mix,
      treble: a.treble + (b.treble - a.treble) * mix,
      full: a.full + (b.full - a.full) * mix
    };
  }

  function animateBlobs() {
    const t = audio?.currentTime || 0;
    const sample = sampleVisuals(t);
    let scales;
    if (sample) {
      const wobble = Math.sin(t * 1.2) * 0.05;
      scales = [
        1 + sample.full * 0.3 + wobble,
        1 + sample.mid * 0.45,
        1 + sample.treble * 0.35 + Math.cos(t * 0.9) * 0.03,
        1 + sample.bass * 0.4
      ];
    } else {
      scales = [0, 1, 2, 3].map((i) => 1 + Math.sin(t * (1.1 + i * 0.4)) * 0.05);
    }

    blobs.forEach((b, i) => {
      b.style.setProperty('--scale', scales[i].toFixed(3));
    });

    rafId = requestAnimationFrame(animateBlobs);
  }

  async function play() {
    if (!audio) return;
    try {
      await audio.play();
    } catch (err) {
      console.warn('[audio] play failed', err?.message || err);
    }
    if (playIcon) playIcon.classList.replace('play', 'pause');
    if (!rafId) animateBlobs();
  }

  function pause() {
    if (!audio) return;
    audio.pause();
    if (playIcon) playIcon.classList.replace('pause', 'play');
    stopAnim();
  }

  if (playIcon && audio) {
    playIcon.addEventListener('click', () => (audio.paused ? play() : pause()));
  }

  if (audio) {
    audio.addEventListener('ended', pause);
    audio.addEventListener('pause', () => { if (!audio.ended) pause(); });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        stopAnim();
      } else if (!audio.paused) {
        animateBlobs();
      }
    });
  }

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

  if ('mediaSession' in navigator && audio) {
    const dateText = (() => {
      try {
        return new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
      } catch {
        return '';
      }
    })();

    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: 'News for Schmucks',
        artist: dateText || 'Daily',
        album: 'news-for-schmucks'
      });
    } catch {}

    const seek = (delta) => {
      const dur = isFinite(audio.duration) ? audio.duration : 0;
      const pos = isFinite(audio.currentTime) ? audio.currentTime : 0;
      const next = Math.max(0, Math.min(dur || Infinity, pos + delta));
      audio.currentTime = next;
    };

    const updatePosition = () => {
      if (!('setPositionState' in navigator.mediaSession)) return;
      const dur = isFinite(audio.duration) ? audio.duration : 0;
      if (!dur) return;
      try {
        navigator.mediaSession.setPositionState({
          duration: dur,
          playbackRate: audio.playbackRate || 1,
          position: isFinite(audio.currentTime) ? audio.currentTime : 0
        });
      } catch {}
    };

    try { navigator.mediaSession.setActionHandler('play', () => play()); } catch {}
    try { navigator.mediaSession.setActionHandler('pause', () => pause()); } catch {}
    try { navigator.mediaSession.setActionHandler('seekbackward', () => seek(-10)); } catch {}
    try { navigator.mediaSession.setActionHandler('seekforward', () => seek(30)); } catch {}
    try { navigator.mediaSession.setActionHandler('stop', () => pause()); } catch {}
    try {
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (details && typeof details.seekTime === 'number') audio.currentTime = details.seekTime;
      });
    } catch {}

    audio.addEventListener('timeupdate', updatePosition);
    audio.addEventListener('loadedmetadata', updatePosition);
    audio.addEventListener('play', updatePosition);
  }
})();
