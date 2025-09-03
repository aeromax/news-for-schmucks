const scrollSpeedFactor = 0.5; // retained for potential speed tweaks (not used by CSS)
const manualSensitivity = 2.0; // increase to make manual scroll feel snappier
let duration;
const audio = document.querySelector("audio");
const timeCounter = document.querySelector(".counter");
let totalDuration = 0;
let resumeTimeout = null; // for manual scroll resume
let userScrollingCaptions = false;
// Virtual scroll state (in pixels) – drives transform: translateY
let captionPosPx = 0;
let captionTargetPx = 0;
let maxScrollPx = 0; // contentHeight - containerHeight
let lastTick = 0;

const formatBoldCaptions = (text) =>
  text.replace(/\*\*(.+?)\*\*/g, '<span class="bold-caption">$1</span>');

document.addEventListener("DOMContentLoaded", () => {
  loadCaptionsFromJSON(`/data/transcript.json?nocache=${Date.now()}`);
  initLinearProgress();
});

async function loadCaptionsFromJSON(jsonUrl) {
  let data;
  try {
    const res = await fetch(jsonUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
  } catch (err) {
    console.error("❌ Failed to load captions JSON", { jsonUrl, err });
    return;
  }

  const captionsObj = data?.captions;
  if (!captionsObj) {
    console.error("❌ Invalid structure. 'captions' object missing.", { data });
    return;
  }

  const captions = Array.isArray(captionsObj.text) ? captionsObj.text : [];
  let rawDuration = captionsObj.duration;
  let parsedDuration =
    typeof rawDuration === "number" ? rawDuration : parseFloat(rawDuration);
  duration = Number.isFinite(parsedDuration) ? parsedDuration : NaN;

  // Set initial counter with whatever we know now
  if (timeCounter) {
    const knownDur = Number.isFinite(duration)
      ? duration
      : (Number.isFinite(audio?.duration) ? audio.duration : 0);
    timeCounter.textContent = `${fmtTime(knownDur)}`;
  }

  if (captions.length === 0) {
    console.error("❌ Invalid structure. 'captions.text' missing or empty.", {
      captions: captionsObj.text,
    });
    return;
  }

  // If duration is unknown in JSON, don't bail; we will initialize once audio metadata loads.

  const container = document.querySelector(".caption-box");
  if (!container) return;

  const scrollDiv = document.createElement("div");
  scrollDiv.classList.add("caption-scroll");
  scrollDiv.style.visibility = "hidden";
  scrollDiv.innerHTML = captions
    .map((line) => `<div>${formatBoldCaptions(line)}</div>`)
    .join("");

  container.innerHTML = "";
  container.appendChild(scrollDiv);

  // Initialize JS-driven transform scroll (no CSS animation)
  requestAnimationFrame(() => {
    scrollDiv.style.width = "100%";
    scrollDiv.style.visibility = "visible";
    recalcCaptionMetrics();
    // Start at current audio position
    updateScrollForTime(audio?.currentTime || 0, true);

    if (audio) {
      audio.addEventListener("play", () => {
        if (userScrollingCaptions) return;
        startCaptionRaf();
      });
      audio.addEventListener("pause", () => {
        stopCaptionRaf();
      });
    }
  });

  // Manual scroll support via wheel/drag/touch on the container
  setupManualCaptionScroll(container, scrollDiv);
  window.addEventListener("resize", () => {
    const prevMax = maxScrollPx;
    recalcCaptionMetrics();
    // Keep position proportionally in place when layout changes
    if (prevMax > 0 && maxScrollPx > 0) {
      const pct = captionPosPx / prevMax;
      setCaptionPos(pct * maxScrollPx);
    } else {
      setCaptionPos(Math.min(captionPosPx, maxScrollPx));
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

  const fill = document.querySelector(".progress-fill");
  const head = document.querySelector(".progress-head");
  const wrap = document.querySelector(".progress-wrap");

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
  const maxT = totalDuration || audio?.duration || 0;
  t = Math.max(0, Math.min(maxT, t));
  if (audio) {
    audio.currentTime = t;
    if (typeof updateScrollForTime === "function") updateScrollForTime(t, true);
  }
  const pct = maxT && maxT > 0 ? t / maxT : 0;
  setProgressUI(pct);
  setTimeCounter(t);
}

function updateScrollForTime(t, forceImmediate = false) {
  const container = document.querySelector(".caption-box");
  const scrollDiv = document.querySelector(".caption-scroll");
  if (!container || !scrollDiv) return;
  const dur = Number.isFinite(duration)
    ? duration
    : (Number.isFinite(audio?.duration) ? audio.duration : 0);
  if (!(dur > 0)) return;
  recalcCaptionMetrics();
  const pct = Math.max(0, Math.min(1, (t || 0) / dur));
  captionTargetPx = pct * maxScrollPx;
  if (!userScrollingCaptions || forceImmediate) {
    setCaptionPos(captionTargetPx);
  }
}

if (audio) {
  audio.addEventListener("loadedmetadata", () => {
    totalDuration = isFinite(audio.duration) ? audio.duration : 0;
    // If JSON had no duration, adopt audio duration now
    if (!Number.isFinite(duration) && Number.isFinite(audio.duration)) {
      duration = audio.duration;
      if (timeCounter) timeCounter.textContent = `${fmtTime(duration)}`;
      updateScrollForTime(audio.currentTime || 0, true);
    }
    setTimeCounter(audio.currentTime || 0);
    setProgressUI(
      (audio.currentTime || 0) /
      (totalDuration || audio.duration || 1)
    );
  });

  audio.addEventListener("timeupdate", () => {
    const headEl = document.querySelector(".progress-head");
    const isUserDragging =
      headEl && headEl.getAttribute("data-dragging") === "true";
    if (isUserDragging) return;
    const pct =
      (audio.currentTime || 0) / (totalDuration || audio.duration || 1);
    setProgressUI(pct);
    setTimeCounter(audio.currentTime || 0);
    if (!userScrollingCaptions) updateScrollForTime(audio.currentTime || 0);
  });
}

function initLinearProgress() {
  const wrap = document.querySelector(".progress-wrap");
  const fill = document.querySelector(".progress-fill");
  const head = document.querySelector(".progress-head");

  if (!wrap || !fill || !head) {
    console.warn(
      "[Progress] linear UI elements not found (.progress-wrap/.progress-fill/.progress-head)"
    );
    return;
  }

  wrap.setAttribute("tabindex", "0");
  wrap.setAttribute("role", "slider");
  wrap.setAttribute("aria-valuemin", "0");
  wrap.setAttribute("aria-valuemax", "100");
  head.setAttribute("tabindex", "0");
  head.setAttribute("role", "slider");
  head.setAttribute("aria-valuemin", "0");
  head.setAttribute("aria-valuemax", "100");

  function rectToPct(clientX) {
    const rect = wrap.getBoundingClientRect();
    const x = clientX - rect.left;
    return Math.max(0, Math.min(1, rect.width ? x / rect.width : 0));
  }

  function timeFromClientX(clientX) {
    const pct = rectToPct(clientX);
    return pct * (totalDuration || audio?.duration || 0);
  }

  wrap.addEventListener("pointerdown", (ev) => {
    if (ev.target === head) return;
    seekToTime(timeFromClientX(ev.clientX));
  });

  let dragging = false;

  function onPointerMove(e) {
    if (!dragging) return;
    const clientX =
      (e.touches && e.touches[0]) ? e.touches[0].clientX : e.clientX;
    seekToTime(timeFromClientX(clientX));
    e.preventDefault();
  }

  function onPointerUp(e) {
    if (!dragging) return;
    dragging = false;
    head.removeAttribute("data-dragging");
    try {
      head.releasePointerCapture && head.releasePointerCapture(e.pointerId);
    } catch (err) { }
    document.removeEventListener("pointermove", onPointerMove);
    document.removeEventListener("pointerup", onPointerUp);
    document.removeEventListener("mousemove", onPointerMove);
    document.removeEventListener("mouseup", onPointerUp);
    document.removeEventListener("touchmove", onPointerMove);
    document.removeEventListener("touchend", onPointerUp);
  }

  head.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    dragging = true;
    head.setAttribute("data-dragging", "true");
    try {
      head.setPointerCapture && head.setPointerCapture(e.pointerId);
    } catch (err) { }
    document.addEventListener("pointermove", onPointerMove, { passive: false });
    document.addEventListener("pointerup", onPointerUp);
    onPointerMove(e);
    e.preventDefault();
  });

  head.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    dragging = true;
    head.setAttribute("data-dragging", "true");
    document.addEventListener("mousemove", onPointerMove);
    document.addEventListener("mouseup", onPointerUp);
    onPointerMove(e);
    e.preventDefault();
  });

  head.addEventListener(
    "touchstart",
    (e) => {
      dragging = true;
      head.setAttribute("data-dragging", "true");
      document.addEventListener("touchmove", onPointerMove, { passive: false });
      document.addEventListener("touchend", onPointerUp);
      onPointerMove(e);
      e.preventDefault();
    },
    { passive: false }
  );

  function handleKey(e) {
    if (!audio || !(isFinite(totalDuration) && totalDuration > 0)) return;
    const step = 5;
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

function setupManualCaptionScroll(container, scrollDiv) {
  let lastY = 0;
  let pointerDown = false;

  function beginManual() {
    userScrollingCaptions = true;
    clearResumeTimer();
    stopCaptionRaf();
  }

  function clearResumeTimer() {
    if (resumeTimeout) {
      clearTimeout(resumeTimeout);
      resumeTimeout = null;
    }
  }

  function scheduleResume() {
    clearResumeTimer();
    resumeTimeout = setTimeout(() => {
      if (pointerDown) return; // wait until release
      userScrollingCaptions = false;
      // snap target to current audio and resume smooth follow
      updateScrollForTime(audio?.currentTime || 0);
      if (audio && !audio.paused) startCaptionRaf();
    }, 2000);
  }

  function adjustByDeltaY(deltaY) {
    beginManual();
    recalcCaptionMetrics();
    setCaptionPos(captionPosPx + deltaY);
    scheduleResume();
  }

  function onWheel(e) {
    // prevent page scroll and make trackpad responsive
    e.preventDefault();
    let delta = e.deltaY;
    if (e.deltaMode === 1) delta *= 16; // lines -> px
    else if (e.deltaMode === 2) delta *= container.clientHeight || 600; // pages
    adjustByDeltaY(delta * manualSensitivity);
  }

  function onPointerDown(e) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    pointerDown = true;
    beginManual();
    lastY = e.clientY;
  }

  function onPointerMove(e) {
    if (!pointerDown) return;
    const y = e.clientY;
    const dy = y - lastY;
    lastY = y;
    e.preventDefault();
    // Dragging up should move content down (natural feel): invert dy
    adjustByDeltaY(dy * manualSensitivity * -1);
  }

  function onPointerUp() {
    pointerDown = false;
    scheduleResume();
  }

  function onTouchStart(e) {
    pointerDown = true;
    beginManual();
    lastY = e.touches[0]?.clientY || lastY;
  }

  function onTouchMove(e) {
    if (!pointerDown) return;
    const y = e.touches[0]?.clientY || lastY;
    const dy = y - lastY;
    lastY = y;
    e.preventDefault();
    adjustByDeltaY(dy * manualSensitivity * -1);
  }

  function onTouchEnd() {
    pointerDown = false;
    scheduleResume();
  }

  container.addEventListener("wheel", onWheel, { passive: false });
  container.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove, { passive: false });
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerUp);
  container.addEventListener("touchstart", onTouchStart, { passive: false });
  container.addEventListener("touchmove", onTouchMove, { passive: false });
  container.addEventListener("touchend", onTouchEnd);
  container.addEventListener("touchcancel", onTouchEnd);
}

let captionRaf = null;
function startCaptionRaf() {
  if (captionRaf) return;
  lastTick = performance.now();
  const tick = (now) => {
    captionRaf = requestAnimationFrame(tick);
    if (!audio) return;
    const dt = Math.max(0, (now - lastTick) / 1000);
    lastTick = now;

    if (!userScrollingCaptions) {
      // Follow audio position smoothly
      const t = audio.currentTime || 0;
      updateScrollForTime(t);
      // Smoothly move toward target
      const rate = 12; // higher is snappier
      const alpha = 1 - Math.exp(-rate * dt);
      setCaptionPos(captionPosPx + (captionTargetPx - captionPosPx) * alpha);
    }
  };
  captionRaf = requestAnimationFrame(tick);
}

function stopCaptionRaf() {
  if (captionRaf) {
    cancelAnimationFrame(captionRaf);
    captionRaf = null;
  }
}

function recalcCaptionMetrics() {
  const container = document.querySelector(".caption-box");
  const scrollDiv = document.querySelector(".caption-scroll");
  if (!container || !scrollDiv) return;
  const ch = container.clientHeight || 0;
  const sh = scrollDiv.scrollHeight || 0;
  // Start just below the bottom of the visible box
  const startOffset = ch; // dynamic, matches container height
  maxScrollPx = Math.max(0, (sh - ch) + startOffset);
}

function setCaptionPos(px) {
  const container = document.querySelector(".caption-box");
  const scrollDiv = document.querySelector(".caption-scroll");
  if (!container || !scrollDiv) return;
  recalcCaptionMetrics();
  captionPosPx = Math.max(0, Math.min(maxScrollPx, px || 0));
  // Positive translate moves content down; offset keeps initial position below the box
  const startOffset = container.clientHeight || 0;
  // Nudge up by 20px overall (decrease translateY by 20)
  scrollDiv.style.transform = `translateY(${startOffset - captionPosPx - 20}px)`;
}

// Removed CSS animation init; JS-driven transform handles all scrolling now.

(function globalShortcutsSeekBracketsSimple() {
  const audioEl = document.querySelector("audio");
  if (!audioEl) return;

  function isTyping() {
    const el = document.activeElement;
    return (
      !!el &&
      (el.tagName === "INPUT" ||
        el.tagName === "TEXTAREA" ||
        el.isContentEditable)
    );
  }

  window.addEventListener("keydown", (ev) => {
    if (isTyping()) return;
    const code = ev.code;
    if (code !== "BracketLeft" && code !== "BracketRight") return;
    ev.preventDefault();

    if (
      (!isFinite(totalDuration) || totalDuration <= 0) &&
      isFinite(audioEl.duration)
    ) {
      totalDuration = audioEl.duration;
    }

    const amount = 10;
    let newTime =
      (audioEl.currentTime || 0) +
      (code === "BracketRight" ? amount : -amount);
    const maxT =
      totalDuration && totalDuration > 0
        ? totalDuration
        : isFinite(audioEl.duration)
          ? audioEl.duration
          : Infinity;

    newTime = Math.max(0, Math.min(newTime, maxT));
    audioEl.currentTime = newTime;
    const pct = maxT && maxT > 0 ? newTime / maxT : 0;
    setProgressUI(pct);
    setTimeCounter(newTime);
    if (typeof updateScrollForTime === "function") updateScrollForTime(newTime);

    const wrap = document.querySelector(".progress-wrap");
    if (wrap) wrap.setAttribute("aria-valuenow", String(Math.round(pct * 100)));

    console.log(
      `[Shortcuts] ${code} -> seek to ${newTime}s (pct ${Math.round(pct * 100)}%)`
    );
  });
})();
