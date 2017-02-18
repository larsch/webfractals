/*!
 * Multi-core Mandelbrot Renderer
 * Copyright(c) 2017 Lars Christensen
 * MIT Licensed
 */

let canvas = document.getElementById('canvas');
let bgCanvas = document.getElementById('scaled');
let ctx = canvas.getContext('2d');
let bgCtx = bgCanvas.getContext('2d');
let progressCanvas = document.getElementById('progress');
let progressCtx = progressCanvas.getContext('2d');
let offscreenCanvas = document.getElementById('offscreen');
let offscreenCtx = offscreenCanvas.getContext('2d');
progressCanvas.width = 40;
progressCanvas.height = 40;
progressCanvas.style.top = '20px';
progressCanvas.style.left = '20px';

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

// rendering state
let renderInProgress = false;
let renderStartTime = null;
let renderCompleteTime = null;
let rowImage;
let rowData;
let y = 0;
let yGoal = 0;
let steps = 24;

let currentSubpixel = 0;
const subpixelIntervals = 3;
let subpixelOffsets = [];
for (let y = 0; y < subpixelIntervals; ++y) {
  for (let x = 0; x < subpixelIntervals; ++x) {
    let n = y * subpixelIntervals + x;
    let p = (n * 7) % (subpixelIntervals * subpixelIntervals);
    subpixelOffsets[p] = [x / subpixelIntervals, y / subpixelIntervals];
  }
}

// worker management
let useWorkers = true;
let workerCount = (navigator.hardwareConcurrency || 4);
let workers = new Array(workerCount);
let currentGeneration = 0;
let queueSize = 0;
let queueLimit = 2 * workerCount;
let nextWorker = 0;
let remainingRows = 0;
let totalRows = 0;

function goto (cx, cy, area) {
  setZoom(cx, cy, area);
  saveState();
  invalidate();
}

function resetZoom () {
  if (juliaMode) {
    goto(0.0, 0.0, 16.0);
  } else {
    goto(-0.75, 0.0, 16.0);
  }
}

function setZoom (cx, cy, area) {
  let aspect = w / h;
  xsize = Math.sqrt(area * aspect);
  ysize = xsize / aspect;
  xmin = cx - xsize / 2;
  xmax = cx + xsize / 2;
  ymin = cy - ysize / 2;
  ymax = cy + ysize / 2;
  xscale = xsize / w;
  yscale = ysize / h;
  steps = getAutoSteps();
}

function getZoom () {
  let cx = (xmin + xmax) / 2;
  let cy = (ymin + ymax) / 2;
  let area = xsize * ysize;
  return [cx, cy, area];
}

let makeImageData;
try {
  let array = new Uint8ClampedArray(4);
  new ImageData(array, 1, 1); // eslint-disable-line no-new
  makeImageData = function (array, w, h) {
    return new ImageData(array, w, h);
  };
} catch (e) {
  // inefficient cludge for IE
  makeImageData = function (array, w, h) {
    let img = ctx.createImageData(w, h);
    img.data.set(array);
    return img;
  };
}

function resizeCanvas () {
  let newWidth = benchmarkMode ? 1024 : window.innerWidth;
  let newHeight = benchmarkMode ? 768 : window.innerHeight;
  if (w === newWidth && h === newHeight) {
    return;
  }

  w = newWidth;
  h = newHeight;

  let oldxscale = xscale;
  let oldyscale = yscale;
  let oldxmin = xmin;
  let oldymin = ymin;

  // adjust viewport, keeping area and centre constant
  let zoom = getZoom();
  setZoom(zoom[0], zoom[1], zoom[2]);

  steps = getAutoSteps();

  // find slice count and rendering height (multiple of 16)
  bits = Math.ceil(Math.log(h) / Math.log(2));
  h2 = 1 << bits;

  // allocate new row image
  rowImage = ctx.createImageData(w, 1);
  rowData = rowImage.data;

  invalidate();

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
  bgCtx.fillStyle = 'rgb(' + def[0] + ',' + def[1] + ',' + def[2] + ')';
  bgCtx.fillRect(0, 0, bgCanvas.width, bgCanvas.height);
}

function hsv2rgb (h, s, v) {
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
  palette[i * 4 + 0] = rgb[0];
  palette[i * 4 + 1] = rgb[1];
  palette[i * 4 + 2] = rgb[2];
  palette[i * 4 + 3] = 255;
}

function drawProgressTime (time) {
  progressCtx.fillStyle = 'white';
  progressCtx.textAlign = 'center';
  progressCtx.textBaseline = 'middle';
  progressCtx.fillText(time, 20, 20);
}

function getRenderingTime () {
  if (remainingRows > 0) {
    return Math.floor(window.performance.now() - renderStartTime);
  } else {
    return Math.floor(renderCompleteTime - renderStartTime);
  }
}

function drawProgressWheel (progress) {
  progressCtx.clearRect(0, 0, progressCanvas.width, progressCanvas.height);
  progressCtx.fillStyle = 'rgba(255,255,255,0.35)';
  progressCtx.beginPath();
  progressCtx.moveTo(20, 20);
  progressCtx.arc(20, 20, 16, 3 / 2 * Math.PI, 3 / 2 * Math.PI - 2 * Math.PI * progress, true);
  progressCtx.fill();
  drawProgressTime(getRenderingTime());
}

function drawProgress () {
  let progress = remainingRows / totalRows;
  drawProgressWheel(progress);
}

function clearProgress () {
  progressCtx.clearRect(0, 0, progressCanvas.width, progressCanvas.height);
  drawProgressTime(window.performance.now() - renderStartTime);
}

function anim (t) {
  let renderEndTime = window.performance.now() + 25;
  do {
    renderRow(y);
    y = (y + 1) % h2;
  } while (y !== yGoal && window.performance.now() < renderEndTime);

  if (y !== yGoal) {
    drawProgress();
    window.requestAnimationFrame(anim);
  } else {
    clearProgress();
    renderInProgress = false;
  }
}

function initializeWorkers () {
  for (let i = 0; i < workerCount; ++i) {
    workers[i] = new Worker('./worker.js?' + window.performance.now());
    workers[i].postMessage(palette);
    workers[i].onmessage = handleMessageFromWorker;
  }
}

function drawRow (y, data, generation, subpixel) {
  if (generation === currentGeneration) {
    if (subpixel === 0) {
      ctx.globalAlpha = 1.0;
      ctx.putImageData(makeImageData(data, w, 1), 0, y);
    } else {
      offscreenCtx.putImageData(makeImageData(data, w, 1), 0, 0);
      ctx.globalAlpha = 1.0 / (subpixel + 1);
      ctx.drawImage(offscreenCanvas, 0, y);
    }
    if (--remainingRows === 0) {
      onDrawingComplete();
    }
  }
}

// Array of rows received from workers ready to be draw on the canvas
// on the next animation frame
let drawQueue = [];

// Animation frame function
function animate (t) {
  let msg;
  while ((msg = drawQueue.shift())) { drawRow(msg[0], msg[1], msg[2], msg[3]); }
  if (showPerformance) {
    drawProgressWheel(remainingRows / totalRows);
  }
  window.requestAnimationFrame(animate);
}

window.requestAnimationFrame(animate);

function handleMessageFromWorker (ev) {
  --queueSize;
  drawQueue.push(ev.data);
  if (renderInProgress) {
    startMoreJobs();
  }
}

function broadcastMessage (msg) {
  for (let i = 0; i < workerCount; ++i) {
    workers[i].postMessage(msg);
  }
}

// Request the next row to be drawn by sending a message to the next
// worker.
function startJob () {
  let y2 = rowMapping(y);
  if (y2 < h) {
    workers[nextWorker].postMessage(y2);
    nextWorker = (nextWorker + 1) % workerCount;
    ++queueSize;
  }
  y = (y + 1) % h2;
}

function startSubpixelPass () {
  let step = subpixelOffsets[currentSubpixel];
  let options =
    [ steps, currentGeneration,
      xmin + step[0] * xscale, xscale,
      ymin + step[0] * yscale, yscale,
      w, currentSubpixel];
  if (juliaMode) {
    options.push(Cx);
    options.push(Cy);
  }
  broadcastMessage(null);
  broadcastMessage(options);
}

function onDrawingComplete () {
  renderCompleteTime = window.performance.now();
  if (benchmarkMode) {
    let renderTime = window.performance.now() - renderStartTime;
    if (benchmarkRecord === null || renderTime < benchmarkRecord) {
      benchmarkRecord = renderTime;
    }
    benchmarkSum += renderTime;
    ++benchmarkCount;
    let div = document.createElement('div');
    let average = benchmarkSum / benchmarkCount;
    div.textContent =
      Math.floor(renderTime) + ' msec, average ' +
      Math.floor(Math.round(average)) +
      ', min ' + Math.floor(benchmarkRecord) + ' msec' +
      (window.localStorage.benchmarkReference ? ' (' + Math.floor(average * 100 / window.localStorage.benchmarkReference) + '%)' : '');
    let perfLog = document.getElementById('perf-log');
    perfLog.appendChild(div);
    perfLog.scrollTop = perfLog.scrollHeight;
    invalidate();
  }
}

function onRenderComplete () {
  renderInProgress = false;
}

function onPassComplete () {
  if (currentSubpixel + 1 < subpixelOffsets.length) {
    ++currentSubpixel;
    startSubpixelPass();
  } else {
    onRenderComplete();
  }
}

function startMoreJobs () {
  if (renderInProgress) {
    while (queueSize < queueLimit) {
      startJob();
      if (y === yGoal) {
        onPassComplete();
      }
    }
  }
}

function initRender () {
  ++currentGeneration;
  totalRows = remainingRows = h * subpixelOffsets.length;
  currentSubpixel = 0;
  broadcastMessage(null);
  renderInProgress = true;
  startSubpixelPass();
}

function startRender () {
  if (useWorkers) {
    initRender();
    startMoreJobs();
  } else {
    window.requestAnimationFrame(anim);
  }
}

function restartRender () {
  yGoal = y; // keep going
  initRender();
}

function invalidate () {
  if (renderInProgress) {
    restartRender();
  } else {
    startRender();
  }
  renderStartTime = window.performance.now();
}

function getAutoSteps () {
  if (juliaMode) { return 8192; }
  var f = Math.sqrt(
    0.001 + 2.0 * Math.min(Math.abs(xsize), Math.abs(ysize)));
  return Math.floor(223.0 / f) + (juliaMode ? 200 : 25);
}

let zoomNotified = false;

function zoom (pos, zoom) {
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
  if (area < 1e-28) { return; }

  if (area < 1e-26 && !zoomNotified) {
    notify('Zoom limit reached');
    zoomNotified = true;
  } else if (area > 1e-24) {
    zoomNotified = false;
  }

  xmin = xmin1;
  xmax = xmax1;
  ymin = ymin1;
  ymax = ymax1;

  xsize = xsize1;
  ysize = ysize1;
  xscale = xsize / w;
  yscale = ysize / h;
  steps = getAutoSteps();
  saveState();

  invalidate();

  // scale current image
  bgCtx.drawImage(canvas, 0, 0);
  bgCtx.translate(dx, dy);
  bgCtx.scale(sx, sy);
  bgCtx.drawImage(bgCanvas, 0, 0);
  bgCtx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);

  return;
}

function iter (cx, cy) {
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

function renderRowData (cy, xmin, xscale, w, rowData) {
  for (let x = 0; x < w; ++x) {
    let cx = xmin + xscale * x;
    let n = iter(cx, cy);
    let p = x * 4;
    if (n === steps) {
      rowData[p + 0] = 0;
      rowData[p + 1] = 0;
      rowData[p + 2] = 0;
      rowData[p + 3] = 255;
    } else {
      n = (n % 256) * 4;
      rowData[p + 0] = palette[n + 0];
      rowData[p + 1] = palette[n + 1];
      rowData[p + 2] = palette[n + 2];
      rowData[p + 3] = palette[n + 3];
    }
  }
}

function rowMapping (y) {
  let v;
  for (let i = 0; i < bits; ++i) {
    v = (v << 1) | (y & 1);
    y >>= 1;
  }
  return v;
}

function renderRow (y) {
  let y2 = rowMapping(y);
  if (y2 < h) {
    let cy = ymin + yscale * y2;
    renderRowData(cy, xmin, xscale, w, rowData);
    ctx.putImageData(rowImage, 0, y2);
    let ny = rowMapping(y2 ^ 1);
    let dthis = (h2 + yGoal - y) % h2;
    let dnext = (h2 + yGoal - ny) % h2;
    if (dnext < dthis) {
      ctx.putImageData(rowImage, 0, y2 ^ 1);
    }
  }
}

let juliaMode = false;
let Cx, Cy, Carea;
function toggleJulia () {
  if (juliaMode) {
    juliaMode = false;
    goto(Cx, Cy, Carea);
    notify('Mandelbrot');
  } else {
    juliaMode = true;
    Cx = (xmax + xmin) / 2;
    Cy = (ymax + ymin) / 2;
    Carea = (xmax - xmin) * (ymax - ymin);
    goto(0.0, 0.0, 16.0);
    notify('Julia');
  }
}

//
// Toolbar
//

let autoHideToolbar = false;
let toolbarHeight = 0;
let toolbarVisible = true;

function showToolbar () {
  if (toolbarVisible) return;
  let elem = document.getElementById('toolbar');
  elem.style.transitionTimingFunction = 'ease-out';
  elem.style.top = '0px';
  toolbarVisible = true;
}

function hideToolbar () {
  if (!toolbarVisible) return;
  let elem = document.getElementById('toolbar');
  elem.style.transitionTimingFunction = 'ease-in';
  elem.style.transition = 'top 0.5s';
  elem.style.top = -elem.clientHeight + 'px';
  toolbarHeight = elem.clientHeight;
  toolbarVisible = false;
}

function toggleToolbar () {
  let eye = document.getElementById('eye');
  autoHideToolbar = !autoHideToolbar;
  eye.className = autoHideToolbar ? 'fa fa-eye-slash' : 'fa fa-eye';
}

function getMousePosition (ev) {
  var rect = canvas.getBoundingClientRect();
  var mx = ev.clientX - rect.left;
  var my = ev.clientY - rect.top;
  return [mx, my];
}

//
// Drag handling
//

let mouseIsPressed = false;
let lastDragPos = null;
let dragPos = null;

function applyDrag () {
  if (dragPos === null || lastDragPos === null) return;
  let dx = dragPos[0] - lastDragPos[0];
  let dy = dragPos[1] - lastDragPos[1];
  if (dx === 0 && dy === 0) return;
  xmin -= dx * xscale;
  xmax -= dx * xscale;
  ymin -= dy * yscale;
  ymax -= dy * yscale;
  saveState();
  invalidate();
  ctx.globalAlpha = 1.0;
  ctx.drawImage(canvas, dx, dy);
  lastDragPos = dragPos;
}

function handleMouseMove (ev) {
  if (mouseIsPressed) {
    dragPos = getMousePosition(ev);
  }
  if (autoHideToolbar) {
    if (ev.clientY <= toolbarHeight) {
      showToolbar();
    } else {
      hideToolbar();
    }
  }
}

function handleMouseLeave (ev) {
  mouseIsPressed = false;
  if (autoHideToolbar) {
    hideToolbar();
  }
}

canvas.addEventListener('mousedown', (e) => {
  e.preventDefault();
  mouseIsPressed = true;
  dragPos = lastDragPos = getMousePosition(e);
});

canvas.addEventListener('mouseup', (e) => {
  e.preventDefault();
  mouseIsPressed = false;
});

addThrottledEventHandler(canvas, 'mousemove', handleMouseMove, applyDrag, 50);
document.body.addEventListener('mouseleave', handleMouseLeave);

//
// Mouse wheel zoom handling
//

function loadState () {
  let hash = window.location.hash.substr(1);
  let parts = hash.split(';');
  let cx = null;
  let cy = null;
  let area = null;
  for (let i = 0; i < parts.length; ++i) {
    let part = parts[i];
    let kv = part.split('=');
    let key = kv[0];
    let value = kv[1];
    if (key === 'x') cx = parseFloat(value);
    if (key === 'y') cy = parseFloat(value);
    if (key === 'a') area = parseFloat(value);
    if (key === 'cx') { Cx = parseFloat(value); juliaMode = true; }
    if (key === 'cy') { Cy = parseFloat(value); juliaMode = true; }
    if (key === 'ca') { Carea = parseFloat(value); juliaMode = true; }
  }
  if (cx !== null && cy !== null && area !== null) {
    setZoom(cx, cy, area);
  }
}

window.addEventListener('hashchange', (ev) => {
  loadState();
  invalidate();
});

function saveState () {
  let state = getZoom();
  let options = { x: state[0], y: state[1], a: state[2] };
  if (juliaMode) {
    options.cx = Cx;
    options.cy = Cy;
    options.ca = Carea;
  }
  window.history.replaceState('', '', '#' + Object.keys(options).map((k) => `${k}=${options[k]}`).join(';'));
}

loadState();

//
// Mouse wheel zoom handling
//

let zoomDelta = 0;
let zoomPosition = null;

/**
 * Attach an event listener to an object. Invokes the handle()
 * callback on every event, and the apply() handler eventually, but
 * with at least 'delay' milliseconds between each invokation.
 */
function addThrottledEventHandler (elem, event, handle, apply, delay) {
  let nextApply = window.performance.now();
  let timerId = null;
  function invokeApply () { apply(); timerId = null; }
  elem.addEventListener(event, (ev) => {
    if (handle !== null) {
      handle(ev);
    }
    let now = window.performance.now();
    if (now < nextApply) {
      if (timerId === null) {
        timerId = setTimeout(invokeApply, nextApply - now);
        nextApply += delay;
      }
    } else {
      apply();
      nextApply = now + delay;
    }
  });
}

function applyZoom () {
  if (zoomDelta !== 0) {
    zoom(zoomPosition, Math.pow(0.9, zoomDelta) - 1.0);
  }
  zoomDelta = 0;
}

function handleWheelEvent (ev) {
  if (ev.deltaY !== 0) {
    zoomDelta += ev.deltaY / Math.abs(ev.deltaY);
  }
  zoomPosition = getMousePosition(ev);
}

addThrottledEventHandler(canvas, 'wheel', handleWheelEvent, applyZoom, 50);

//
// Notification
//

function notify (message) {
  let elem = document.createElement('div');
  elem.textContent = message;
  elem.className = 'notification';
  elem.style.opacity = 0.0;
  document.body.appendChild(elem);
  elem.offsetWidth; // trigger reflow
  elem.style.transitionTimingFunction = 'ease-in';
  elem.style.transition = 'opacity 0.5s';
  elem.style.opacity = 0.75;
  setTimeout(function () {
    elem.style.transition = 'opacity 1.5s';
    elem.style.opacity = 0.0;
    elem.addEventListener('transitionend', function () {
      document.body.removeChild(elem);
    });
  }, 1500);
}

//
// Window resizing
//

addThrottledEventHandler(window, 'resize', null, resizeCanvas, 100);

canvas.focus();
initializeWorkers();
resizeCanvas();

function toggleFullscreen () {
  if (document.fullscreenElement || document.mozFullScreenElement || document.webkitFullscreenElement) {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    }
    if (document.mozCancelFullScreen) {
      document.mozCancelFullScreen();
    } else if (document.webkitCancelFullScreen) { document.webkitCancelFullScreen(); }
  } else {
    if (document.body.requestFullscreen) {
      document.body.requestFullscreen();
    } else if (document.body.webkitRequestFullScreen) {
      document.body.webkitRequestFullScreen();
    } else if (document.body.mozRequestFullScreen) {
      document.body.mozRequestFullScreen();
    }
  }
}

function toggleBenchmark () {
  benchmarkMode = !benchmarkMode;
  benchmarkRecord = null;
  benchmarkSum = 0;
  benchmarkCount = 0;
  let perfLog = document.getElementById('perf-log');
  while (perfLog.firstChild) {
    perfLog.removeChild(perfLog.firstChild);
  }
  let perfWidget = document.getElementById('perf-widget');
  perfWidget.style.display = benchmarkMode ? 'block' : 'none';
  resizeCanvas();
  invalidate();
}

const keyHandlers = {
  'f': toggleFullscreen,
  'Tab': toggleToolbar,
  'a': toggleAbout,
  'b': toggleBenchmark,
  'p': togglePerformance,
  'r': resetZoom,
  'd': invalidate,
  'j': toggleJulia,
  '1': () => goto(-0.8095982407565278, 0.20644475195559692, 7.070788159271757e-21),
  '2': () => goto(-1.2507228225085063, -0.012216480572110264, 4.56763840019647e-10),
  '3': () => goto(-0.7500080414782041, -0.0023020099052026063, 1.836076329402399e-12),
  '4': () => goto(-1.2584173216052297, -0.0434307591569108, 7.355699871595511e-14),
  '5': () => goto(-1.2584173733157713, -0.04343074372030864, 1.5584579561386576e-19),
  '6': () => goto(-1.7687321374923899, -0.0033593363507216766, 1.9263389078932266e-12),
  '7': () => goto(-0.7683215625255263, 0.10763553419258395, 2.5585128336826167e-8),
  '8': () => goto(-1.192221953636638, 0.28975874758269526, 2.859831064836286e-17),
  'ArrowRight': () => { Cx += 1e-3; saveState(); invalidate(); },
  'ArrowLeft': () => { Cx -= 1e-3; saveState(); invalidate(); },
  'ArrowUp': () => { Cy += 1e-3; saveState(); invalidate(); },
  'ArrowDown': () => { Cy -= 1e-3; saveState(); invalidate(); },
  '0': resetZoom
};

window.addEventListener('keypress', function (e) {
  if (e.ctrlKey || e.shiftKey || e.altKey || e.metaKey) return;
  let handler = keyHandlers[e.key];
  if (handler) {
    e.preventDefault();
    handler();
  }
});

let aboutVisible = false;

function toggleAbout () {
  let elem = document.getElementById('about');
  if (aboutVisible) {
    elem.style.display = 'none';
    aboutVisible = false;
  } else {
    elem.style.display = 'block';
    aboutVisible = true;
  }
}

document.getElementById('close-about-button').addEventListener('click', (e) => {
  e.preventDefault();
  toggleAbout();
});

function togglePerformance () {
  showPerformance = !showPerformance;
  if (showPerformance) { clearProgress(); } else { progressCtx.clearRect(0, 0, progressCanvas.width, progressCanvas.height); }
}

function getCurrentBenchmark () {
  if (benchmarkCount > 0) {
    return benchmarkSum / benchmarkCount;
  } else {
    return null;
  }
}

function storeBenchmark () {
  window.localStorage.benchmarkReference = getCurrentBenchmark();
}

document.getElementById('julia-button').addEventListener('click', toggleJulia);
document.getElementById('reset-button').addEventListener('click', resetZoom);
document.getElementById('fullscreen-button').addEventListener('click', toggleFullscreen);
document.getElementById('about-button').addEventListener('click', toggleAbout);
document.getElementById('toolbar-button').addEventListener('click', toggleToolbar);
document.getElementById('performance-button').addEventListener('click', togglePerformance);
document.getElementById('perf-set-button').addEventListener('click', storeBenchmark);
