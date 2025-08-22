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
  timeCounter.textContent = fmtTime(remain);
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
