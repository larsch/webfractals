let canvas = document.getElementById("canvas");
let bgCanvas = document.getElementById("scaled");
let ctx = canvas.getContext("2d");
let bgCtx = bgCanvas.getContext("2d");
let progressCanvas = document.getElementById("progress");
let progressCtx = progressCanvas.getContext("2d");
progressCanvas.width = 40;
progressCanvas.height = 40;
progressCanvas.style.top = "20px";
progressCanvas.style.left = "20px";

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
  steps = getAutoSteps();
}

function loadState() {
  let hash = location.hash.substr(1);
  let parts = hash.split(';');
  let cx = null, cy = null, area = null;
  for (let i in parts) {
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
  if (w == window.innerWidth && h == window.innerHeight)
    return;

  w = window.innerWidth;
  h = window.innerHeight;

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
  let progress = ((yGoal + h2 - y) % h2) / h2;
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
let workerCount = navigator.hardwareConcurrency * 2;
if (!workerCount)
  workerCount = 8;
let workers = new Array(workerCount);
let generation = 0;
let queueSize = 0;
let queueLimit = 64;
let nextWorker = 0;


function handleMessage(e) {
  let msg = e.data;
  if (true || msg.generation == generation) {
    let img = new ImageData(msg.data, w, 1);
    ctx.putImageData(img, 0, msg.y);
    --remainingRows;
    drawProgressWheel(remainingRows / h);
  }
  --queueSize;
  if (renderInProgress)
    startJobs();
}

for (let i = 0; i < workerCount; ++i) {
  workers[i] = new Worker("./worker.js");
  workers[i].postMessage({palette: palette, id: i});
  workers[i].onmessage = handleMessage;
}

let remainingRows = 0;

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
      renderInProgress = false;
      break;
    }
  }
}

function startRender() {
  if (useWorkers) {
    ++generation;
    postAllWorkers({steps: steps, generation: generation, xmin: xmin, xscale: xscale, ymin: ymin, yscale: yscale, w: w});
    startJobs();
  } else {
    requestAnimationFrame(anim);
  }
  renderInProgress = true;
}

function invalidate() {
  if (renderInProgress) {
    ++generation;
    postAllWorkers({steps: steps, generation: generation, xmin: xmin, xscale: xscale, ymin: ymin, yscale: yscale, w: w});
    remainingRows = queueSize + h;
    yGoal = y;
  } else {
    remainingRows = h;
    startRender();
  }
  renderStartTime = Date.now();
}

function getMousePosition(ev) {
  var rect = canvas.getBoundingClientRect();
  var mx = ev.clientX - rect.left;
  var my = ev.clientY - rect.top;
  return [mx, my];
}

canvas.addEventListener('contextmenu', function(e){
  e.preventDefault();
  zoom(getMousePosition(e), -0.2);
});

canvas.addEventListener('click', function(e){
  e.preventDefault();
  zoom(getMousePosition(e), 0.2);
});

canvas.addEventListener('wheel', function(e){
  if (e.deltaY)
    zoom(getMousePosition(e), -0.2 * Math.sign(e.deltaY));
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
  xmin = xmin + zoom * mx * xscale;
  xmax = xmax - zoom * (w - mx) * xscale;
  ymin = ymin + zoom * my * yscale;
  ymax = ymax - zoom * (h - my) * yscale;

  // find transform (translate and scale)
  const xsize1 = xmax - xmin;
  const ysize1 = ymax - ymin;
  const sx = xsize / xsize1;
  const sy = ysize / ysize1;
  const dx = mx - mx * sx;
  const dy = my - my * sy;

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

document.body.focus();

// Set initialize and kick off rendering
resize();

window.addEventListener('keypress', function(e){
  if (e.ctrlKey || e.shiftKey || e.altKey || e.metaKey) return;
  if (e.key == 'f') {
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
  } else if (e.key == 'r') {
    resetZoom();
  } else if  (e.key == 'w') {
    useWorkers = !useWorkers;
    invalidate();
  }
});
