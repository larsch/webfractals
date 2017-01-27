'use strict';
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
let sliceCount;
let xmin = -2.25;
let xmax = 1.5;
let ymin = 1.5;
let ymax = -1.5;
let w = 200 * (xmax - xmin);
let h = 200 * (ymax - ymin);
let h2;
let xsize = xmax - xmin;
let ysize = ymax - ymin;
let xscale;
let yscale;

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
  console.log(cx, cy, area);
  if (cx !== null && cy !== null && area !== null) {
    let newAspect = w / h;
    xsize = Math.sqrt(area * newAspect);
    ysize = xsize / newAspect;
    xmin = cx - xsize / 2;
    xmax = cx + xsize / 2;
    ymin = cy - ysize / 2;
    ymax = cy + ysize / 2;
    xscale = xsize / w;
    yscale = ysize / h;
    console.log('loaded state', xmin, xmax, ymin, ymax, xsize, ysize);
  }
}
loadState();


let rowImage;
let rowData;

function resize() {
  if (w == window.innerWidth && h == window.innerHeight)
    return;

  w = window.innerWidth;
  h = window.innerHeight;

  // adjust viewport, keeping area and centre constant
  let cx = (xmin + xmax) / 2;
  let cy = (ymin + ymax) / 2;
  let area = xsize * ysize;
  let oldAspect = xsize / ysize;
  let newAspect = w / -h;
  let xsize1 = Math.sqrt(area * newAspect);
  let ysize1 = xsize1 / newAspect;
  let xmin1 = cx - xsize1 / 2;
  let xmax1 = cx + xsize1 / 2;
  let ymin1 = cy - ysize1 / 2;
  let ymax1 = cy + ysize1 / 2;
  let xscale1 = xsize1 / w;
  let yscale1 = ysize1 / h;

  // find transform
  const sx = xscale / xscale1;
  const sy = yscale / yscale1;
  const dx = (xmin - xmin1) / xscale1;
  const dy = (ymin - ymin1) / yscale1;

  xmin = xmin1;
  xmax = xmax1;
  ymin = ymin1;
  ymax = ymax1;
  xsize = xsize1;
  ysize = ysize1;
  xscale = xscale1;
  yscale = yscale1;
  saveState();

  // apply current overload to background
  bgCtx.drawImage(canvas, 0, 0);
  // resize front canvas (clears it)
  canvas.width = w;
  canvas.height = h;
  // draw scaled image on front canvas
  ctx.translate(dx, dy);
  ctx.scale(sx, sy);
  ctx.drawImage(bgCanvas, 0, 0);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  // resize back canvas (clears it)
  bgCanvas.width = w;
  bgCanvas.height = h;

  let def = hsv2rgb(0, 0.5, 0.5);
  bgCtx.fillStyle = "rgb(" + def[0] + "," + def[1] + "," + def[2] + ")";
  bgCtx.fillRect(0,0,bgCanvas.width,bgCanvas.height);

  // find slice count and rendering height (multiple of 16)
  sliceCount = Math.floor((h + 15) / 16);
  h2 = sliceCount * 16;
  // allocate new row image
  rowImage = new ImageData(w, 1);
  rowData = rowImage.data;

  invalidate();
}

let y = 0;
let yGoal = 0;

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
  let rgb = hsv2rgb(((i * 360 * 4) / 256) % 360, 1.0, 0.5);
  palette[i*4+0] = rgb[0];
  palette[i*4+1] = rgb[1];
  palette[i*4+2] = rgb[2];
  palette[i*4+3] = 255;
}

let renderStartTime = null;

function drawProgress() {
  let progress = ((yGoal + h2 - y) % h2) / h2;
  progressCtx.clearRect(0,0,progressCanvas.width,progressCanvas.height);
  progressCtx.fillStyle = "rgba(255,255,255,0.35)";
  progressCtx.beginPath();
  progressCtx.moveTo(20,20);
  progressCtx.arc(20,20,16,3/2*Math.PI,3/2*Math.PI - 2 * Math.PI * progress, true);
  progressCtx.fill();
  progressCtx.fillStyle = 'white';
  progressCtx.textAlign = 'center';
  progressCtx.textBaseline = 'middle';
  progressCtx.fillText(Date.now() - renderStartTime, 20, 20);
}

function clearProgress() {
  progressCtx.clearRect(0,0,progressCanvas.width,progressCanvas.height);
  progressCtx.fillStyle = 'white';
  progressCtx.textAlign = 'center';
  progressCtx.textBaseline = 'middle';
  progressCtx.fillText(Date.now() - renderStartTime, 20, 20);
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
  }
  document.getElementById("renderTime").textContent = Date.now() - renderStartTime;
}

function startRender() {
  y = 0;
  yGoal = 0;
  xsize = (xmax - xmin);
  ysize = (ymax - ymin);
  requestAnimationFrame(anim);
  renderStartTime = Date.now();
}

function invalidate() {
  if (y == yGoal)
    startRender();
  else
    yGoal = y;
}

canvas.addEventListener('contextmenu', function(e){
  e.preventDefault();
  var rect = canvas.getBoundingClientRect();
  var mx = e.clientX - rect.left;
  var my = e.clientY - rect.top;
  zoom(mx, my, -0.2);
});

canvas.addEventListener('click', function(e){
  e.preventDefault();
  var rect = canvas.getBoundingClientRect();
  var mx = e.clientX - rect.left;
  var my = e.clientY - rect.top;
  zoom(mx, my, 0.2);
});

function zoom(mx, my, zoom) {
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

  invalidate();

  xsize = xsize1;
  ysize = ysize1;
  xscale = xsize / w;
  yscale = ysize / h;
  saveState();

  return false;
};

function iter(cx, cy) {
  let zy = cy;
  let zx = cx;
  let n = 0;
  let zx2, zy2;
  while ((zx2 = zx * zx) + (zy2 = zy * zy) <= 4.0 && ++n < 4096) {
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
    if (n == 4096) {
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
  let cx = (xmin + xmax) / 2;
  let cy = (ymin + ymax) / 2;
  let sz = xsize * ysize;
  location.hash = 'x=' + cx + ';y=' + cy + ';a=' + sz;
}

function rowMapping(y) {
  return (Math.floor(y / sliceCount) * 11) % 16 + (y % sliceCount) * 16;
}

function renderRow(y) {
  let y2 = rowMapping(y);
  if (y2 < h) {
    let cy = ymin + yscale * y2;
    renderRowData(cy, xmin, xscale, w, rowData);
    ctx.putImageData(rowImage, 0, y2);
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
  }, 0);
});

// Set initialize and kick off rendering
resize();
