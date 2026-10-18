const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

$('#year').textContent = new Date().getFullYear();

const menuToggle = $('#menuToggle');
const nav = $('#nav');
menuToggle.addEventListener('click', () => {
  const open = nav.classList.toggle('open');
  menuToggle.setAttribute('aria-expanded', String(open));
});
$$('#nav a').forEach(link => link.addEventListener('click', () => {
  nav.classList.remove('open');
  menuToggle.setAttribute('aria-expanded', 'false');
}));

function showNotice(message, isError = false) {
  const box = $('#analyzeResult');
  box.textContent = message;
  box.classList.remove('hidden', 'error');
  if (isError) box.classList.add('error');
}

$('#analyzeBtn').addEventListener('click', async () => {
  const input = $('#mediaUrl');
  const button = $('#analyzeBtn');
  const url = input.value.trim();
  if (!url) return showNotice('Paste a supported social media link first.', true);
  button.disabled = true;
  button.innerHTML = 'Checking… <span>↻</span>';
  showNotice('Checking the link and identifying its platform…');
  try {
    const response = await fetch('/api/analyze', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not analyze this link.');
    showNotice(`${data.platform}: ${data.message}`);
  } catch (error) {
    showNotice(error.message || 'Could not connect to the server. Please try again.', true);
  } finally {
    button.disabled = false;
    button.innerHTML = 'Analyze link <span>→</span>';
  }
});
$('#mediaUrl').addEventListener('keydown', event => {
  if (event.key === 'Enter') $('#analyzeBtn').click();
});

for (const [inputId, labelId] of [['audioFile', 'audioFileLabel'], ['videoFile', 'videoFileLabel']]) {
  $('#' + inputId).addEventListener('change', event => {
    const file = event.target.files?.[0];
    $('#' + labelId).textContent = file ? file.name : (inputId === 'audioFile' ? 'Choose video or audio file' : 'Choose a video file');
  });
}

function humanSize(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

async function processForm(form, mode) {
  const status = $('.form-status', form);
  const button = $('button[type="submit"]', form);
  const file = $('input[type="file"]', form).files?.[0];
  if (!file) {
    status.className = 'form-status error';
    status.textContent = 'Choose a file before continuing.';
    return;
  }
  const maxBytes = 500 * 1024 * 1024;
  if (file.size > maxBytes) {
    status.className = 'form-status error';
    status.textContent = 'This file is larger than the current 500 MB browser limit.';
    return;
  }

  const data = new FormData(form);
  data.set('mode', mode);
  button.disabled = true;
  button.innerHTML = 'Processing… <span>↻</span>';
  status.className = 'form-status';
  status.textContent = 'Uploading and processing your file. Larger files may take a while…';
  try {
    const response = await fetch('/api/process', { method: 'POST', body: data });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Processing failed.');
    status.className = 'form-status success';
    status.textContent = `Ready · ${result.sizeLabel}`;
    const link = document.createElement('a');
    link.className = 'download-link';
    link.href = result.downloadUrl;
    link.download = result.filename;
    link.textContent = `Download ${result.filename} ↓`;
    status.append(document.createElement('br'), link);
  } catch (error) {
    status.className = 'form-status error';
    status.textContent = error.message || 'Processing failed. Try a different file.';
  } finally {
    button.disabled = false;
    button.innerHTML = (mode === 'audio' ? 'Convert audio' : 'Compress video') + ' <span>→</span>';
  }
}

$('#audioForm').addEventListener('submit', event => {
  event.preventDefault();
  processForm(event.currentTarget, 'audio');
});
$('#videoForm').addEventListener('submit', event => {
  event.preventDefault();
  processForm(event.currentTarget, 'video');
});
