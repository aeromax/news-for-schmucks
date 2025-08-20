// captionSync.js — refactored to use data-state instead of animationPlayState directly
const scrollSpeedFactor = 0.5;
let duration;

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

  let scrollDiv = document.createElement('div');
  scrollDiv.id = 'caption-scroll';

  scrollDiv.style.visibility = 'hidden';
  scrollDiv.innerHTML = captions.map(line => `<div>${formatBoldCaptions(line)}</div>`).join('');

  container.innerHTML = '';
  container.appendChild(scrollDiv);

  // Observer to reflect data-state to animationPlayState
  const updateAnimState = () => {
    const state = scrollDiv.getAttribute('data-state');
    scrollDiv.style.animationPlayState = state === 'playing' ? 'running' : 'paused';
  };
  const observer = new MutationObserver(updateAnimState);
  observer.observe(scrollDiv, { attributes: true, attributeFilter: ['data-state'] });

  requestAnimationFrame(() => {
    scrollDiv.style.width = '100%';
    scrollDiv.style.animation = `scroll-up ${duration * scrollSpeedFactor}s linear forwards`;
    scrollDiv.setAttribute('data-state', 'paused');
    scrollDiv.style.visibility = 'visible';

    const audio = document.querySelector('audio');
    if (audio) {
      audio.addEventListener('play', () => {
        scrollDiv.setAttribute('data-state', 'playing');
        if (!scrollDiv.hasAttribute('data-faded-in')) {
          scrollDiv.setAttribute('data-faded-in', 'true');
        }
      });

      audio.addEventListener('pause', () => {
        scrollDiv.setAttribute('data-state', 'paused');
      });
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  loadCaptionsFromJSON('./transcript.json');
});

// === Playhead + Scrubbing ===
const wrap = document.getElementById("progressWrap");
const fill = document.getElementById("progressFill");
const head = document.getElementById("progressHead");
const timeCounter = document.getElementById("timeCounter");
const audio = document.querySelector("audio");

let isDragging = false;
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
  timeCounter.textContent = fmtTime(remain);
}

function setProgressUI(pct) {
  pct = Math.max(0, Math.min(1, pct));
  if (fill) fill.style.width = `${pct * 100}%`;
  if (head) head.style.left = `${pct * 100}%`;
  if (wrap) wrap.setAttribute("aria-valuenow", Math.round(pct * 100));
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
  void scrollDiv.offsetWidth; // force reflow
  scrollDiv.style.animation = `scroll-up ${duration * scrollSpeedFactor}s linear forwards`;
  scrollDiv.style.animationDelay = `-${t}s`;
  scrollDiv.setAttribute('data-state', audio?.paused ? 'paused' : 'playing');
}

function timeFromClientX(clientX) {
  const rect = wrap.getBoundingClientRect();
  const x = clientX - rect.left;
  const pct = rect.width ? x / rect.width : 0;
  return pct * totalDuration;
}

if (audio) {
  audio.addEventListener("loadedmetadata", () => {
    totalDuration = isFinite(audio.duration) ? audio.duration : 0;
    setTimeCounter(audio.currentTime || 0);
    setProgressUI((audio.currentTime || 0) / totalDuration);
  });

  audio.addEventListener("timeupdate", () => {
    if (isDragging) return;
    const pct = (audio.currentTime || 0) / totalDuration;
    setProgressUI(pct);
    setTimeCounter(audio.currentTime || 0);
  });
}

if (wrap) {
  const stopDragging = () => {
    if (!isDragging) return;
    isDragging = false;
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", stopDragging);
  };

  const onMove = (e) => {
    if (!isDragging) return;
    const t = timeFromClientX(e.clientX);
    seekToTime(t);
    e.preventDefault();
  };

  wrap.addEventListener("mousedown", (e) => {
    isDragging = true;
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", stopDragging);
    seekToTime(timeFromClientX(e.clientX));
  });

  wrap.addEventListener("keydown", (e) => {
    if (!audio) return;
    const step = 5;
    if (["ArrowRight", "ArrowUp"].includes(e.key)) {
      seekToTime(audio.currentTime + step);
    } else if (["ArrowLeft", "ArrowDown"].includes(e.key)) {
      seekToTime(audio.currentTime - step);
    } else if (e.key === "Home") {
      seekToTime(0);
    } else if (e.key === "End") {
      seekToTime(totalDuration);
    }
  });

}
const formatBoldCaptions = (text) => text.replace(/\*\*(.+?)\*\*/g, '<span class="bold-caption">$1</span>');