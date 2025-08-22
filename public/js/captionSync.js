// Reverted version: captionSync.js with working circular glow progress ring
const scrollSpeedFactor = 0.5;
let duration;

const formatBoldCaptions = (text) => text.replace(/\*\*(.+?)\*\*/g, '<span class="bold-caption">$1</span>');

document.addEventListener('DOMContentLoaded', () => {
  loadCaptionsFromJSON('./transcript.json');
});

async function loadCaptionsFromJSON(jsonUrl) {
  const res = await fetch(jsonUrl);
  const data = await res.json();
  duration = parseFloat(data.captions.duration);
  const captions = Array.isArray(data.captions.text) ? data.captions.text : [];
  if (!duration || captions.length === 0) {
    console.error('❌ Invalid structure. Duration or captions missing.', { duration, captions });
    return;
  }

  const container = document.getElementById('caption-box');
  if (!container) return;

  const scrollDiv = document.createElement('div');
  scrollDiv.id = 'caption-scroll';
  scrollDiv.style.visibility = 'hidden';
  scrollDiv.innerHTML = captions.map(line => `<div>${formatBoldCaptions(line)}</div>`).join('');

  container.innerHTML = '';
  container.appendChild(scrollDiv);

  const updateAnimState = () => {
    const state = scrollDiv.getAttribute('data-state');
    scrollDiv.style.animationPlayState = state === 'playing' ? 'running' : 'paused';
  };

  new MutationObserver(updateAnimState).observe(scrollDiv, {
    attributes: true,
    attributeFilter: ['data-state']
  });

  requestAnimationFrame(() => {
    scrollDiv.style.width = '100%';
    scrollDiv.style.animation = `scroll-up ${duration * scrollSpeedFactor}s linear forwards`;
    scrollDiv.setAttribute('data-state', 'paused');
    scrollDiv.style.visibility = 'visible';

    const audio = document.querySelector('audio');
    if (audio) {
      audio.addEventListener('play', () => {
        scrollDiv.setAttribute('data-state', 'playing');
      });
      audio.addEventListener('pause', () => {
        scrollDiv.setAttribute('data-state', 'paused');
      });
    }
  });
}

const audio = document.querySelector("audio");
const timeCounter = document.getElementById("timeCounter");
const ring = document.querySelector(".progress-ring");

let totalDuration = 0;

function fmtTime(seconds) {
  seconds = Math.max(0, Math.floor(seconds));
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function setTimeCounter(t) {
  if (!timeCounter) return;
  const remain = Math.max(0, totalDuration - t);
  timeCounter.textContent = `Bullshit remaining: ${fmtTime(remain)}`;
}

function setProgressUI(pct) {
  pct = Math.max(0, Math.min(1, pct));
  const degrees = 360 * pct;
  if (ring) {
    ring.style.background = `conic-gradient(#fff 0deg ${degrees}deg, transparent ${degrees}deg 360deg)`;
  }
}

function seekToTime(t) {
  t = Math.max(0, Math.min(totalDuration, t));
  if (audio) {
    audio.currentTime = t;
    audio.dispatchEvent(new Event('seeked'));
  }
  setProgressUI(t / totalDuration);
  setTimeCounter(t);
  updateScrollForTime(t);
}

function updateScrollForTime(t) {
  const scrollDiv = document.getElementById("caption-scroll");
  if (!scrollDiv) return;
  scrollDiv.setAttribute('data-state', 'paused');
  scrollDiv.style.animation = 'none';
  void scrollDiv.offsetWidth;
  scrollDiv.style.animation = `scroll-up ${duration * scrollSpeedFactor}s linear forwards`;
  scrollDiv.style.animationDelay = `-${t}s`;
  scrollDiv.setAttribute('data-state', audio?.paused ? 'paused' : 'playing');
}

if (audio) {
  audio.addEventListener("loadedmetadata", () => {
    totalDuration = isFinite(audio.duration) ? audio.duration : 0;
    setTimeCounter(audio.currentTime || 0);
    setProgressUI((audio.currentTime || 0) / totalDuration);
  });

  audio.addEventListener("timeupdate", () => {
    const pct = (audio.currentTime || 0) / totalDuration;
    setProgressUI(pct);
    setTimeCounter(audio.currentTime || 0);
  });
}

// === Make the progress ring itself draggable (no playhead) ===
(function attachRingScrub() {
  const container = document.getElementById('progress-ring-container');
  if (!container) return;

  // interactive affordances
  container.setAttribute('tabindex', '0');
  container.setAttribute('role', 'slider');
  container.setAttribute('aria-valuemin', '0');
  container.setAttribute('aria-valuemax', '100');
  container.setAttribute('aria-valuenow', '0');

  // parameters must match setProgressUI logic
  const maxDeg = 324;    // arc span
  const startAngle = 18; // visual starting offset

  let dragging = false;

  function getCenter() {
    const r = container.getBoundingClientRect();
    return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: r.width, h: r.height };
  }

  function angleFromPointer(clientX, clientY) {
    const c = getCenter();
    const dx = clientX - c.cx;
    const dy = clientY - c.cy;
    // atan2 yields angle where 0 is +X; convert to degrees [0,360)
    return (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
  }

  function angleToPct(angle) {
    let diff = (angle - startAngle + 360) % 360;
    if (diff > maxDeg) {
      // clamp to nearest end
      diff = Math.max(0, Math.min(diff, maxDeg));
    }
    return diff / maxDeg;
  }

  function setPctAndSeek(pct, opts = { seek: true }) {
    pct = Math.max(0, Math.min(1, pct));
    const t = (totalDuration || 0) * pct;
    // update visuals using existing functions
    setProgressUI(pct);
    setTimeCounter(t);
    container.setAttribute('aria-valuenow', String(Math.round(pct * 100)));
    if (opts.seek) seekToTime(t);
  }

  // pointer handlers
  function onPointerMove(clientX, clientY, doSeek = true) {
    const ang = angleFromPointer(clientX, clientY);
    const pct = angleToPct(ang);
    setPctAndSeek(pct, { seek: doSeek });
  }

  function startDrag(clientX, clientY) {
    dragging = true;
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', stopDrag);
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', stopDrag);
    onPointerMove(clientX, clientY, true);
  }

  function onMouseDown(e) {
    e.preventDefault();
    startDrag(e.clientX, e.clientY);
  }
  function onMouseMove(e) {
    if (!dragging) return;
    e.preventDefault();
    onPointerMove(e.clientX, e.clientY, true);
  }
  function onTouchStart(e) {
    if (!e.touches || !e.touches[0]) return;
    e.preventDefault();
    const t = e.touches[0];
    startDrag(t.clientX, t.clientY);
  }
  function onTouchMove(e) {
    if (!dragging || !e.touches || !e.touches[0]) return;
    e.preventDefault();
    const t = e.touches[0];
    onPointerMove(t.clientX, t.clientY, true);
  }

  function stopDrag() {
    dragging = false;
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', stopDrag);
    document.removeEventListener('touchmove', onTouchMove);
    document.removeEventListener('touchend', stopDrag);
  }

  // click to jump (no drag)
  function onClick(e) {
    // ignore if a drag just finished; small debounce
    if (dragging) return;
    onPointerMove(e.clientX, e.clientY, true);
  }

  // attach listeners
  container.addEventListener('mousedown', onMouseDown);
  container.addEventListener('touchstart', onTouchStart, { passive: false });
  container.addEventListener('click', onClick);


  // sync visuals with audio when not dragging
  if (audio) {
    audio.addEventListener('timeupdate', () => {
      if (dragging) return;
      const pct = totalDuration ? (audio.currentTime || 0) / totalDuration : 0;
      setProgressUI(pct);
      container.setAttribute('aria-valuenow', String(Math.round(pct * 100)));
    });
    audio.addEventListener('loadedmetadata', () => {
      const pct = totalDuration ? (audio.currentTime || 0) / totalDuration : 0;
      setProgressUI(pct);
      container.setAttribute('aria-valuenow', String(Math.round(pct * 100)));
    });
  }

  // ensure touch-action none via CSS ideally, but also prevent some defaults
  container.style.touchAction = 'none';
})();

// Global shortcuts: [ and ] to seek exactly 10 seconds (no Shift behavior)
(function globalShortcutsSeekBracketsSimple() {
  const audioEl = document.querySelector('audio');
  if (!audioEl) return;

  function isTyping() {
    const el = document.activeElement;
    return !!el && (
      el.tagName === 'INPUT' ||
      el.tagName === 'TEXTAREA' ||
      el.isContentEditable
    );
  }

  window.addEventListener('keydown', (ev) => {
    if (isTyping()) return; // don't hijack typing fields

    // Use physical key code for reliability
    const code = ev.code; // 'BracketLeft' or 'BracketRight'
    if (code !== 'BracketLeft' && code !== 'BracketRight') return;

    ev.preventDefault();

    // ensure totalDuration is available (fallback to audio.duration)
    if ((!isFinite(totalDuration) || totalDuration <= 0) && isFinite(audioEl.duration)) {
      totalDuration = audioEl.duration;
    }

    const amount = 10; // seconds, always

    let newTime = (audioEl.currentTime || 0) + (code === 'BracketRight' ? amount : -amount);

    // clamp to [0, max]
    const maxT = totalDuration && totalDuration > 0 ? totalDuration : (isFinite(audioEl.duration) ? audioEl.duration : Infinity);
    newTime = Math.max(0, Math.min(newTime, maxT));

    // perform seek
    audioEl.currentTime = newTime;

    // update visuals + captions
    const pct = (maxT && maxT > 0) ? (newTime / maxT) : 0;
    setProgressUI(pct);
    setTimeCounter(newTime);
    if (typeof updateScrollForTime === 'function') updateScrollForTime(newTime);

    // update aria value if present
    const ringContainer = document.getElementById('progress-ring-container');
    if (ringContainer) ringContainer.setAttribute('aria-valuenow', String(Math.round(pct * 100)));

    // small debug (remove after confirm)
    console.log(`[Shortcuts] ${code} -> seek to ${newTime}s (pct ${Math.round(pct * 100)}%)`);
  });
})();

