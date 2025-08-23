
const scrollSpeedFactor = 0.5;
let duration;
const audio = document.querySelector("audio");
const timeCounter = document.getElementById("time-counter");
let totalDuration = 0;




const formatBoldCaptions = (text) => text.replace(/\*\*(.+?)\*\*/g, '<span class="bold-caption">$1</span>');

document.addEventListener('DOMContentLoaded', () => {
  loadCaptionsFromJSON('./transcript.json');
  initLinearProgress();
});

async function loadCaptionsFromJSON(jsonUrl) {
  const res = await fetch(jsonUrl);
  const data = await res.json();
  duration = parseFloat(data.captions.duration);
  timeCounter.textContent = `${fmtTime(duration)}`;
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


function fmtTime(seconds) {
  seconds = Math.max(0, Math.floor(seconds));
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function setTimeCounter(t) {
  if (!timeCounter) return;
  const remain = Math.max(0, (totalDuration || audio?.duration || 0) - t);
  timeCounter.textContent = `${fmtTime(remain)}`;
}


function setProgressUI(pct) {
  pct = Math.max(0, Math.min(1, pct || 0));
  const pctStr = `${pct * 100}%`;

  // linear elements (preferred)
  const fill = document.getElementById("progress-fill");
  const head = document.getElementById("progress-head");
  const wrap = document.getElementById("progress-wrap");

  if (fill) fill.style.width = pctStr;
  if (head) head.style.left = pctStr;
  if (wrap) wrap.setAttribute("aria-valuenow", Math.round(pct * 100));

  // fallback: circular ring if still present (old markup)
  const ring = document.querySelector(".progress-ring");
  if (ring && !fill && !head) {
    const degrees = 360 * pct;
    ring.style.background = `conic-gradient(#fff 0deg ${degrees}deg, transparent ${degrees}deg 360deg)`;
  }
}


function seekToTime(t) {
  const maxT = totalDuration || (audio?.duration || 0);
  t = Math.max(0, Math.min(maxT, t));
  if (audio) {
    audio.currentTime = t;
    if (typeof updateScrollForTime === "function") updateScrollForTime(t);
  }
  const pct = (maxT && maxT > 0) ? (t / maxT) : 0;
  setProgressUI(pct);
  setTimeCounter(t);
}

function updateScrollForTime(t) {
  const scrollDiv = document.getElementById("caption-scroll");
  if (!scrollDiv || !isFinite(duration)) return;
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
    setProgressUI((audio.currentTime || 0) / (totalDuration || audio.duration || 1));
  });

  audio.addEventListener("timeupdate", () => {
    const headEl = document.getElementById("progress-head");
    const isUserDragging = headEl && headEl.getAttribute('data-dragging') === 'true';
    if (isUserDragging) return;
    const pct = (audio.currentTime || 0) / (totalDuration || audio.duration || 1);
    setProgressUI(pct);
    setTimeCounter(audio.currentTime || 0);
  });

}


function initLinearProgress() {
  const wrap = document.getElementById("progress-wrap");
  const fill = document.getElementById("progress-fill");
  const head = document.getElementById("progress-head");

  if (!wrap || !fill || !head) {
    console.warn("[Progress] linear UI elements not found (progress-wrap/progress-fill/progress-head)");
    return;
  }

  // accessibility
  wrap.setAttribute("tabindex", "0");
  wrap.setAttribute("role", "slider");
  wrap.setAttribute("aria-valuemin", "0");
  wrap.setAttribute("aria-valuemax", "100");
  head.setAttribute("tabindex", "0");
  head.setAttribute("role", "slider");
  head.setAttribute("aria-valuemin", "0");
  head.setAttribute("aria-valuemax", "100");

  // helpers
  function rectToPct(clientX) {
    const rect = wrap.getBoundingClientRect();
    const x = clientX - rect.left;
    const pct = rect.width ? (x / rect.width) : 0;
    return Math.max(0, Math.min(1, pct));
  }

  function timeFromClientX(clientX) {
    const pct = rectToPct(clientX);
    return pct * (totalDuration || audio?.duration || 0);
  }

  // click on bar to jump
  wrap.addEventListener("pointerdown", (ev) => {
    // ignore if clicking the head (head handles its own pointerdown)
    if (ev.target === head) return;
    const t = timeFromClientX(ev.clientX);
    seekToTime(t);
  });

  // head dragging via pointer events with fallbacks
  let dragging = false;

  function onPointerMove(e) {
    if (!dragging) return;
    const clientX = (e.touches && e.touches[0]) ? e.touches[0].clientX : e.clientX;
    const t = timeFromClientX(clientX);
    seekToTime(t);
    e.preventDefault();
  }

  function onPointerUp(e) {
    if (!dragging) return;
    dragging = false;
    head.removeAttribute('data-dragging');
    try { head.releasePointerCapture && head.releasePointerCapture(e.pointerId); } catch (err) { }
    document.removeEventListener("pointermove", onPointerMove);
    document.removeEventListener("pointerup", onPointerUp);

    // remove fallbacks
    document.removeEventListener("mousemove", onPointerMove);
    document.removeEventListener("mouseup", onPointerUp);
    document.removeEventListener("touchmove", onPointerMove);
    document.removeEventListener("touchend", onPointerUp);
  }

  // Preferred pointer-based handler
  head.addEventListener("pointerdown", (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    dragging = true;
    head.setAttribute('data-dragging', 'true');
    try { head.setPointerCapture && head.setPointerCapture(e.pointerId); } catch (err) { }
    document.addEventListener("pointermove", onPointerMove, { passive: false });
    document.addEventListener("pointerup", onPointerUp);
    // initial update so head jumps immediately with the pointer
    onPointerMove(e);
    e.preventDefault();
  });

  // Mouse fallback for older browsers
  head.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    dragging = true;
    head.setAttribute('data-dragging', 'true');
    document.addEventListener("mousemove", onPointerMove);
    document.addEventListener("mouseup", onPointerUp);
    onPointerMove(e);
    e.preventDefault();
  });

  // Touch fallback
  head.addEventListener("touchstart", (e) => {
    dragging = true;
    head.setAttribute('data-dragging', 'true');
    document.addEventListener("touchmove", onPointerMove, { passive: false });
    document.addEventListener("touchend", onPointerUp);
    onPointerMove(e);
    e.preventDefault();
  }, { passive: false });

  // keyboard support for wrap & head
  function handleKey(e) {
    if (!audio || !(isFinite(totalDuration) && totalDuration > 0)) return;
    const step = 5; // seconds
    if (["ArrowRight", "ArrowUp"].includes(e.key)) {
      seekToTime((audio.currentTime || 0) + step);
      e.preventDefault();
    } else if (["ArrowLeft", "ArrowDown"].includes(e.key)) {
      seekToTime((audio.currentTime || 0) - step);
      e.preventDefault();
    } else if (e.key === "Home") {
      seekToTime(0);
      e.preventDefault();
    } else if (e.key === "End") {
      seekToTime(totalDuration);
      e.preventDefault();
    }
  }

  wrap.addEventListener("keydown", handleKey);
  head.addEventListener("keydown", handleKey);
}



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
    if (isTyping()) return;

    const code = ev.code;
    if (code !== 'BracketLeft' && code !== 'BracketRight') return;

    ev.preventDefault();

    if ((!isFinite(totalDuration) || totalDuration <= 0) && isFinite(audioEl.duration)) {
      totalDuration = audioEl.duration;
    }

    const amount = 10;

    let newTime = (audioEl.currentTime || 0) + (code === 'BracketRight' ? amount : -amount);

    const maxT = totalDuration && totalDuration > 0 ? totalDuration : (isFinite(audioEl.duration) ? audioEl.duration : Infinity);
    newTime = Math.max(0, Math.min(newTime, maxT));

    audioEl.currentTime = newTime;
    const pct = (maxT && maxT > 0) ? (newTime / maxT) : 0;
    setProgressUI(pct);
    setTimeCounter(newTime);
    if (typeof updateScrollForTime === 'function') updateScrollForTime(newTime);

    const wrap = document.getElementById('progress-wrap');
    if (wrap) wrap.setAttribute('aria-valuenow', String(Math.round(pct * 100)));


    console.log(`[Shortcuts] ${code} -> seek to ${newTime}s (pct ${Math.round(pct * 100)}%)`);
  });
})();

