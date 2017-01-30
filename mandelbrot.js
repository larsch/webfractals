let canvas = document.getElementById("canvas");
let bgCanvas = document.getElementById("scaled");
let ctx = canvas.getContext("2d");
let bgCtx = bgCanvas.getContext("2d");
let progressCanvas = document.getElementById("progress");
let progressCtx = progressCanvas.getContext("2d");

let offscreenCanvas = document.getElementById("offscreen");
let offscreenCtx = offscreenCanvas.getContext("2d");
progressCanvas.width = 40;
progressCanvas.height = 40;
progressCanvas.style.top = "20px";
progressCanvas.style.left = "20px";

let benchmarkMode = false;
let benchmarkRecord = null;
let benchmarkSum = null;
let benchmarkCount = null;
let showPerformance = false;

// viewport
let xmin = -2.25;
let xmax = 1.5;
let ymin = -1.5;
let ymax = 1.5;
let w = 200 * (xmax - xmin);
let h = 200 * (ymax - ymin);
let h2;
let bits;
let xsize = xmax - xmin;
let ysize = ymax - ymin;
let xscale;
let yscale;
let steps = 24;
let substep = 0;
let substeps = [
  [0.0,0.0],
  [0.5,0.5],
  [0.5,0.0],
  [0.0,0.5],
  [0.25,0.25],
  [-0.25,-0.25],
  [-0.25,0.25],
  [0.25,-0.25]
];

function resetZoom() {
  let newAspect = w / h;
  xmin = -2.25;
  xmax = 1.5;
  ymin = 1.5;
  ymax = -1.5;
  let cx = (xmax + xmin) / 2;
  let cy = (ymax + ymin) / 2;
  let area = Math.abs((xmax - xmin) * (ymax - ymin));
  setZoom(cx, cy, area);
  saveState();
  invalidate();
}

function setZoom(cx, cy, area) {
  let aspect = w / h;
  xsize = Math.sqrt(area * aspect);
  ysize = xsize / aspect;
  xmin = cx - xsize / 2;
  xmax = cx + xsize / 2;
  ymin = cy - ysize / 2;
  ymax = cy + ysize / 2;
  xscale = xsize / w;
  yscale = ysize / h;
  document.getElementById("zoom-limit").style.display = (area < 1e-26) ? 'block' : 'none';
  steps = getAutoSteps();
}

function loadState() {
  let hash = location.hash.substr(1);
  let parts = hash.split(';');
  let cx = null, cy = null, area = null;
  for (let i = 0; i < parts.length; ++i) {
    let part = parts[i];
    let kv = part.split('=');
    let key = kv[0];
    let value = kv[1];
    if (key == 'x') cx = parseFloat(value);
    if (key == 'y') cy = parseFloat(value);
    if (key == 'a') area = parseFloat(value);
  }
  if (cx !== null && cy !== null && area !== null) {
    setZoom(cx, cy, area);
  }
}
loadState();


let rowImage;
let rowData;

function getZoom() {
  let cx = (xmin + xmax) / 2;
  let cy = (ymin + ymax) / 2;
  let area = xsize * ysize;
  return [cx, cy, area];
}

function resize() {
  let newWidth = benchmarkMode ? 1024 : window.innerWidth;
  let newHeight = benchmarkMode ? 768 : window.innerHeight;
  if (w == newWidth && h == newHeight)
    return;

  w = newWidth;
  h = newHeight;

  let oldxscale = xscale,
      oldyscale = yscale,
      oldxmin = xmin,
      oldymin = ymin;

  // adjust viewport, keeping area and centre constant
  let zoom = getZoom();
  setZoom(zoom[0], zoom[1], zoom[2]);

  steps = getAutoSteps();
  saveState();

  // apply current overload to background
  bgCtx.drawImage(canvas, 0, 0);
  // resize front canvas (clears it)
  canvas.width = w;
  canvas.height = h;
  // draw scaled image on front canvas
  ctx.translate((oldxmin - xmin) / xscale, (oldymin - ymin) / yscale);
  ctx.scale(oldxscale / xscale, oldyscale / yscale);
  ctx.drawImage(bgCanvas, 0, 0);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  // resize back canvas (clears it)
  bgCanvas.width = w;
  bgCanvas.height = h;

  offscreenCanvas.width = w;

  let def = hsv2rgb(0, 0.5, 0.5);
  bgCtx.fillStyle = "rgb(" + def[0] + "," + def[1] + "," + def[2] + ")";
  bgCtx.fillRect(0,0,bgCanvas.width,bgCanvas.height);

  // find slice count and rendering height (multiple of 16)
  bits = Math.ceil(Math.log(h) / Math.log(2));
  h2 = 1 << bits;
  // allocate new row image
  rowImage = new ImageData(w, 1);
  rowData = rowImage.data;

  invalidate();
}

let y = 0;
let yGoal = 0;
let renderInProgress = false;

function hsv2rgb(h, s, v) {
  let hm = h / 60;
  let c = v * s;
  let x = c * (1 - Math.abs(hm % 2 - 1));
  c = Math.floor(255.999 * c);
  x = Math.floor(255.999 * x);
  if (hm <= 1.0) return [c, x, 0];
  if (hm <= 2.0) return [x, c, 0];
  if (hm <= 3.0) return [0, c, x];
  if (hm <= 4.0) return [0, x, c];
  if (hm <= 5.0) return [x, 0, c];
  return [c, 0, x];
}

let scale = new Array(256);
let palette = new Uint8ClampedArray(256 * 4);
let background = new Uint8ClampedArray(4);
background[0] = 0;
background[1] = 0;
background[2] = 0;
background[3] = 255;
for (let i = 0; i < 256; i++) {
  let h = ((i * 360) / 64) % 360;
  let v = 0.6 + 0.3 * Math.sin(i / 16 * Math.PI);
  let s = 0.75 + 0.23 * Math.cos(i / 8 * Math.PI);
  let rgb = hsv2rgb(h, s, v);
  palette[i*4+0] = rgb[0];
  palette[i*4+1] = rgb[1];
  palette[i*4+2] = rgb[2];
  palette[i*4+3] = 255;
}

let renderStartTime = null;

function drawProgressTime(time) {
  progressCtx.fillStyle = 'white';
  progressCtx.textAlign = 'center';
  progressCtx.textBaseline = 'middle';
  progressCtx.fillText(time, 20, 20);
}

function drawProgressWheel(progress) {
  progressCtx.clearRect(0,0,progressCanvas.width,progressCanvas.height);
  progressCtx.fillStyle = "rgba(255,255,255,0.35)";
  progressCtx.beginPath();
  progressCtx.moveTo(20,20);
  progressCtx.arc(20,20,16,3/2*Math.PI,3/2*Math.PI - 2 * Math.PI * progress, true);
  progressCtx.fill();
  drawProgressTime(Date.now() - renderStartTime);
}

function drawProgress() {
  let progress = remainingRows / totalRows;
  drawProgressWheel(progress);
}

function clearProgress() {
  progressCtx.clearRect(0,0,progressCanvas.width,progressCanvas.height);
  drawProgressTime(Date.now() - renderStartTime);
}

function anim(t) {
  let renderEndTime = Date.now() + 25;
  let before = y;
  do {
    renderRow(y);
    y = (y + 1) % h2;
  } while (y != yGoal && Date.now() < renderEndTime);

  if (y != yGoal) {
    drawProgress();
    requestAnimationFrame(anim);
  } else {
    clearProgress();
    renderInProgress = false;
  }
  document.getElementById("renderTime").textContent = Date.now() - renderStartTime;
}

let useWorkers = true;
let workerCount = 2 * navigator.hardwareConcurrency;
if (!workerCount)
  workerCount = 8;
let workers = new Array(workerCount);
let generation = 0;
let queueSize = 0;
let queueLimit = 2 * workerCount;
let nextWorker = 0;

function handleMessage(e) {
  const msg = e.data;
  const msgY = msg[0];
  const msgData = msg[1];
  const msgGeneration = msg[2];
  const msgSubstep = msg[3];
  if (msgGeneration == generation) {
    if (msgSubstep === 0) {
      // Draw first step directly to context
      ctx.globalAlpha = 1.0;
      ctx.putImageData(new ImageData(msgData, w, 1), 0, msgY);
    } else {
      // Draw subpixel steps via offscreen canvas and apply with alpha
      offscreenCtx.putImageData(new ImageData(msgData, w, 1), 0, 0);
      ctx.globalAlpha = 1.0 / (msgSubstep + 1);
      ctx.drawImage(offscreenCanvas, 0, msgY);
    }
    --remainingRows;
    if (showPerformance)
      drawProgressWheel(remainingRows / totalRows);
  }
  --queueSize;
  if (renderInProgress)
    startJobs();
}

for (let i = 0; i < workerCount; ++i) {
  workers[i] = new Worker("./worker.js?" + Date.now());
  workers[i].postMessage(palette);
  workers[i].onmessage = handleMessage;
}

let remainingRows = 0;
let totalRows = 0;

function postAllWorkers(msg) {
  for (let i = 0 ; i < workerCount; ++i)
    workers[i].postMessage(msg);
}

function startJob() {
  let y2 = rowMapping(y);
  if (y2 < h) {
    let cy = ymin + yscale * y2;
    workers[nextWorker].postMessage(y2);
    nextWorker = (nextWorker + 1) % workerCount;
    ++queueSize;
  }
  y = (y + 1) % h2;
}


// function drawProgressInfo(){
//   ctx.fillStyle = 'white';
//   ctx.fillRect(20, h-40, 200, 20);
//   ctx.fillStyle = 'black';
//   ctx.textAlign = 'left';
//   ctx.textBaseline = 'middle';
//   ctx.fillText('y=' + y + ', yGoal=' + yGoal, 30, h - 30);
// }

function startJobs() {
  while (queueSize < queueLimit) {
    startJob();
    if (y == yGoal) {
      if (substep + 1 < substeps.length) {
        ++substep;
        let step = substeps[substep];
        postAllWorkers(null);
        postAllWorkers([steps, generation, xmin + step[0] * xscale, xscale, ymin + step[0] * yscale, yscale, w, substep]);
      } else {
        renderInProgress = false;
        if (benchmarkMode) {
          let renderTime = Date.now() - renderStartTime;
          if (benchmarkRecord === null || renderTime < benchmarkRecord)
            benchmarkRecord = renderTime;
          benchmarkSum += renderTime;
          ++benchmarkCount;
          let div = document.createElement("div");
          div.textContent = renderTime + " msec, average " + Math.round(benchmarkSum / benchmarkCount) + ", min " + benchmarkRecord + " msec";
          let perf = document.getElementById("performance");
          perf.appendChild(div);
          perf.scrollTo(0, perf.scrollHeight);
          invalidate();
        }
        break;
      }
    }
  }
}

function initRender() {
  ++generation;
  totalRows = remainingRows = h * substeps.length;
  postAllWorkers(null);
  postAllWorkers([steps, generation, xmin, xscale, ymin, yscale, w, 0]);
}

function startRender() {
  if (useWorkers) {
    initRender();
    startJobs();
  } else {
    requestAnimationFrame(anim);
  }
  renderInProgress = true;
}

function restartRender() {
  yGoal = y; // keep going
  initRender();
}

function invalidate() {
  substep = 0;
  if (renderInProgress)
    restartRender();
  else
    startRender();
  renderStartTime = Date.now();
}

function getMousePosition(ev) {
  var rect = canvas.getBoundingClientRect();
  var mx = ev.clientX - rect.left;
  var my = ev.clientY - rect.top;
  return [mx, my];
}

let isDepressed = false;
let lastPos = null;

canvas.addEventListener('mousedown', (e) => {
  e.preventDefault();
  isDepressed = true;
  lastPos = getMousePosition(e);
});

canvas.addEventListener('mouseup', (e) => {
  e.preventDefault();
  isDepressed = false;
});


let dragTimer = null;
let dragPos = null;
function handleDrag() {
  let dx = dragPos[0] - lastPos[0];
  let dy = dragPos[1] - lastPos[1];
  xmin -= dx * xscale;
  xmax -= dx * xscale;
  ymin -= dy * yscale;
  ymax -= dy * yscale;
  saveState();
  ctx.globalAlpha = 1.0;
  ctx.drawImage(canvas, dx, dy);
  invalidate();
  lastPos = dragPos;
  dragTimer = null;
}

canvas.addEventListener('mousemove', (e) => {
  e.preventDefault();
  if (isDepressed) {
    dragPos = getMousePosition(e);
    if (dragTimer === null)
      dragTimer = setTimeout(handleDrag, 20);
  }
});

canvas.addEventListener('mouseleave', (e) => {
  e.preventDefault();
  isDepressed = false;
});

canvas.addEventListener('wheel', function(e){
  if (e.deltaY)
    zoom(getMousePosition(e), Math.pow(0.95, e.deltaY) - 1);
});

function getAutoSteps() {
  var f = Math.sqrt(
    0.001+2.0 * Math.min(
      Math.abs(xsize),
      Math.abs(ysize)));
  return Math.floor(223.0/f);
}

function zoom(pos, zoom) {
  let mx = pos[0];
  let my = pos[1];

  // scale viewing area
  let xmin1 = xmin + zoom * mx * xscale;
  let xmax1 = xmax - zoom * (w - mx) * xscale;
  let ymin1 = ymin + zoom * my * yscale;
  let ymax1 = ymax - zoom * (h - my) * yscale;

  // find transform (translate and scale)
  const xsize1 = xmax1 - xmin1;
  const ysize1 = ymax1 - ymin1;
  const sx = xsize / xsize1;
  const sy = ysize / ysize1;
  const dx = mx - mx * sx;
  const dy = my - my * sy;

  let area = xsize1 * ysize1;
  if (area < 1e-28)
    return;

  let zoomDisplay = (area < 1e-26) ? 'block' : 'none';
  let style = document.getElementById("zoom-limit").style;
  if (style.display != zoomDisplay)
    style.display = zoomDisplay;

  xmin = xmin1;
  xmax = xmax1;
  ymin = ymin1;
  ymax = ymax1;

  // draw scaled image
  bgCtx.drawImage(canvas, 0, 0);
  bgCtx.translate(dx, dy);
  bgCtx.scale(sx, sy);
  bgCtx.drawImage(bgCanvas, 0, 0);
  bgCtx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0,0,w,h);

  xsize = xsize1;
  ysize = ysize1;
  xscale = xsize / w;
  yscale = ysize / h;
  steps = getAutoSteps();
  saveState();

  invalidate();

  return false;
}

function iter(cx, cy) {
  let zy = cy;
  let zx = cx;
  let n = 0;
  let zx2, zy2;
  while ((zx2 = zx * zx) + (zy2 = zy * zy) <= 4.0 && ++n < steps) {
    zy = 2 * zx * zy + cy;
    zx = zx2 - zy2 + cx;
  }
  return n;
}

function renderRowData(cy, xmin, xscale, w, rowData) {
  for (let x = 0; x < w; ++x) {
    let cx = xmin + xscale * x;
    let n = iter(cx, cy);
    let p = x * 4;
    if (n == steps) {
      rowData[p+0] = 0;
      rowData[p+1] = 0;
      rowData[p+2] = 0;
      rowData[p+3] = 255;
    } else {
      n = (n % 256) * 4;
      rowData[p+0] = palette[n+0];
      rowData[p+1] = palette[n+1];
      rowData[p+2] = palette[n+2];
      rowData[p+3] = palette[n+3];
    }
  }
}

function saveState() {
  let state = getZoom();
  let cx = state[0], cy = state[1], sz = state[2];
  location.hash = 'x=' + cx + ';y=' + cy + ';a=' + sz;
}

function rowMapping(y) {
  let v;
  for (let i = 0; i < bits; ++i) {
    v = (v << 1) | (y & 1);
    y >>= 1;
  }
  return v;
}

function renderRow(y) {
  let y2 = rowMapping(y);
  if (y2 < h) {
    let cy = ymin + yscale * y2;
    renderRowData(cy, xmin, xscale, w, rowData);
    ctx.putImageData(rowImage, 0, y2);
    let ny = rowMapping(y2 ^ 1);
    let dthis = (h2 + yGoal - y) % h2;
    let dnext = (h2 + yGoal - ny) % h2;
    if(dnext < dthis)
      ctx.putImageData(rowImage, 0, y2 ^ 1);
  }
}

// Handle window resizing (throttled)
let resizeTimer = null;
window.addEventListener("resize", function(e) {
  if (resizeTimer !== null)
    clearTimeout(resizeTimer);
  resizeTimer = setTimeout(function(){
    resizeTimer = null;
    resize();
  }, 1);
});

canvas.focus();

// Set initialize and kick off rendering
resize();

function toggleFullscreen() {
  if (document.fullscreenElement || document.mozFullScreenElement || document.webkitFullscreenElement) {
    if (document.exitFullscreen)
      document.exitFullscreen();
    if (document.mozCancelFullScreen)
      document.mozCancelFullScreen();
    else if (document.webkitCancelFullScreen)
      document.webkitCancelFullScreen();
  } else {
    if (document.body.requestFullscreen)
      document.body.requestFullscreen();
    else if (document.body.webkitRequestFullScreen)
      document.body.webkitRequestFullScreen();
    else if (document.body.mozRequestFullScreen)
      document.body.mozRequestFullScreen();
  }
}

function toggleBenchmark() {
  benchmarkMode = !benchmarkMode;
  benchmarkRecord = null;
  benchmarkSum = 0;
  benchmarkCount = 0;
  let performance = document.getElementById("performance");
  while (performance.firstChild)
    performance.removeChild(performance.firstChild);
  performance.style.display = benchmarkMode ? 'block' : 'none';
  resize();
  invalidate();
}

window.addEventListener('keypress', function(e){
  if (e.ctrlKey || e.shiftKey || e.altKey || e.metaKey) return;
  if (e.key == 'f') {
    toggleFullscreen();
  } else if (e.key == 'r') {
    resetZoom();
  } else if  (e.key == 'w') {
    useWorkers = !useWorkers;
    invalidate();
  } else if (e.key == 'Tab') {
    e.preventDefault();
    toggleToolbar();
  } else if (e.key == 'a') {
    toggleAbout();
  } else if (e.key == 'b') {
    toggleBenchmark();
  } else if (e.key == 'p') {
    togglePerformance();
  }
});

let aboutVisible = false;

function toggleAbout() {
  let elem = document.getElementById("about");
  if (aboutVisible) {
    elem.style.display = 'none';
    aboutVisible = false;
  } else {
    elem.style.display = 'block';
    aboutVisible = true;
  }
}

let toolbarVisible = true;

function toggleToolbar() {
  let elem = document.getElementById("toolbar");
  let eye = document.getElementById("eye");
  if (toolbarVisible) {
    elem.className = "toolbar toolbar-hidden";
    eye.className = "fa fa-eye";
    toolbarVisible = false;
  } else {
    elem.className = "toolbar";
    eye.className = "fa fa-eye-slash";
    toolbarVisible = true;
  }
}

document.getElementById("close-about-button").addEventListener('click', (e) => {
  e.preventDefault();
  toggleAbout();
});

function togglePerformance() {
  showPerformance = !showPerformance;
  if (showPerformance)
    clearProgress();
  else
    progressCtx.clearRect(0,0,progressCanvas.width,progressCanvas.height);
}

document.getElementById("redraw-button").addEventListener('click', invalidate);
document.getElementById("reset-button").addEventListener('click', resetZoom);
document.getElementById("fullscreen-button").addEventListener('click', toggleFullscreen);
document.getElementById("about-button").addEventListener('click', toggleAbout);
document.getElementById("toolbar-button").addEventListener('click', toggleToolbar);
document.getElementById("performance-button").addEventListener('click', togglePerformance);
