
// captionSync.js — reset version to load captions and duration from JSON file

async function loadCaptionsFromJSON(jsonUrl) {
  const res = await fetch(jsonUrl);
  const data = (await res.json());
  const duration = parseFloat(data.captions.duration) * .4;
  const captions = Array.isArray(data.captions.text) ? data.captions.text : [];
  if (!duration || captions.length === 0) {
    console.error('❌ Invalid structure. Duration or captions missing.', { duration, captions });
    return;
  }

  const container = document.getElementById('caption-box');
  if (!container) return;

  let scrollDiv = document.createElement('div');
  scrollDiv.id = 'caption-scroll';
  
  // We'll apply animation *after* layout measurement
  scrollDiv.style.visibility = 'hidden';
  scrollDiv.innerHTML = captions.map(line => `<div class="scroll-div-part">${formatLine(line)}</div>`).join('');

  container.innerHTML = '';
  container.appendChild(scrollDiv);

  // Wait for layout pass to calculate full height, then animate
  requestAnimationFrame(() => {
    const scrollHeight = scrollDiv.offsetHeight;
    scrollDiv.style.top = `${container.offsetHeight}px`;
    scrollDiv.style.width = '100%';
    scrollDiv.style.animation = `scroll-up ${duration}s linear forwards`;
    scrollDiv.style.animationPlayState = 'paused';
    scrollDiv.style.visibility = 'visible';

    const audio = document.querySelector('audio');
    if (audio) {
      audio.addEventListener('play', () => {
        scrollDiv.style.animationPlayState = 'running';
      });
      audio.addEventListener('pause', () => {
        scrollDiv.style.animationPlayState = 'paused';
      });
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  loadCaptionsFromJSON('./transcript.json');
});

function formatLine(line) {
  // Replace **something** with <strong>something</strong>
  return line.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
}