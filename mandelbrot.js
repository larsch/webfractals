'use strict';
let ca = document.getElementById("canvas");
let cas = document.getElementById("scaled");
cas.width = ca.width = window.innerWidth - 20;
cas.height = ca.height = window.innerHeight - 20;

let ct = ca.getContext("2d");
let cts = cas.getContext("2d");
let w = ca.width;
let h = ca.height;

let pca = document.getElementById("progress");
pca.width = 40;
pca.height = 40;
pca.style.top = "20px";
pca.style.left = "20px";
let pct = pca.getContext("2d");

let ss = 16;
let sl = Math.floor((h + ss - 1) / ss);
let h2 = sl * ss;
let xmin = -2.5;
let xmax = 1.5;
let ymin = 1.5;
let ymax = -1.5;
let xsize = xmax - xmin;
let ysize = ymax - ymin;
let xscale = xsize / w;
let yscale = ysize / h;
let y = 0;
let yGoal = 0;

cts.fillStyle = "rgb(0,128,0)";
cts.fillRect(200, 200, w - 200, h - 200);

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
for (let i = 0; i < 256; i++) {
  scale[i] = hsv2rgb(((i * 360 * 4) / 256) % 360, 1.0, 0.5);
}

let renderStartTime = null;

function drawProgress() {
  let progress = ((yGoal + h2 - y) % h2) / h2;
  pct.clearRect(0,0,pca.width,pca.height);
  pct.fillStyle = "rgba(255,255,255,0.35)";
  pct.beginPath();
  pct.moveTo(20,20);
  pct.arc(20,20,16,3/2*Math.PI,3/2*Math.PI - 2 * Math.PI * progress, true);
  pct.fill();
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
    pct.clearRect(0,0,pca.width,pca.height);
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

ca.onclick = function(e) {
  // get cursor position
  var rect = ca.getBoundingClientRect();
  var mx = e.clientX - rect.left;
  var my = e.clientY - rect.top;

  // scale viewing area
  xmin = xmin + 0.2 * mx * xscale;
  xmax = xmax - 0.2 * (w - mx) * xscale;
  ymin = ymin + 0.2 * my * yscale;
  ymax = ymax - 0.2 * (h - my) * yscale;

  // find transform (translate and scale)
  const xsize1 = xmax - xmin;
  const ysize1 = ymax - ymin;
  const sx = xsize / xsize1;
  const sy = ysize / ysize1;
  const dx = mx - mx * sx;
  const dy = my - my * sy;

  // draw scaled image
  cts.drawImage(ca, 0, 0);
  cts.translate(dx, dy);
  cts.scale(sx, sy);
  cts.drawImage(cas, 0, 0);
  cts.setTransform(1, 0, 0, 1, 0, 0);
  ct.clearRect(0,0,w,h);
  if (y == yGoal)
    startRender();
  else
    yGoal = y;

  xsize = xsize1;
  ysize = ysize1;
  xscale = xsize / w;
  yscale = ysize / h;
};

let img = new ImageData(w, 1);
let data = img.data;

function iter(cx, cy) {
  let zy = cy;
  let zx = cx;
  let n = 0;
  let zx2, zy2;
  while ((zx2 = zx * zx) + (zy2 = zy * zy) <= 4.0) {
    zy = 2 * zx * zy + cy;
    zx = zx2 - zy2 + cx;
    if (++n == 4096) break;
  }
  return n;
}

function renderRowData(cy, xmin, xscale, w, data) {
  for (let x = 0; x < w; ++x) {
    let cx = xmin + xscale * x;
    let n = iter(cx, cy);
    let p = x * 4;
    if (n == 4096) {
      data[p + 0] = data[p + 1] = data[p + 2] = 0;
    } else {
      n = n % 256;
      data[p + 0] = scale[n][0];
      data[p + 1] = scale[n][1];
      data[p + 2] = scale[n][2];
    }
    data[p + 3] = 255;
  }
}

function renderRow(y) {
  // map y coordinate to non-linear order
  y = (Math.floor(y / sl) * 11) % ss + (y % sl) * ss;
  let cy = ymin + yscale * y;
  renderRowData(cy, xmin, xscale, w, data);
  ct.putImageData(img, 0, y);
}

ct.fillStyle = "rgb(" + scale[0][0] + "," + scale[0][1] + "," + scale[0][2] + ")";
ct.fillRect(0,0,w,h);
startRender();
