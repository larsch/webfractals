'use strict';
let ca = document.getElementById("canvas");
let ct = ca.getContext("2d");
// ca.width = window.innerWidth - 20;
// ca.height = window.innerHeight - 20;
let w = ca.width;
let h = ca.height;
let xmin = -2.5;
let xmax = 1.5;
let ymin = 1.5;
let ymax = -1.5;
let xsize = xmax - xmin;
let ysize = ymax - ymin;
let xscale = xsize / w;
let yscale = ysize / h;
let y = 0;
let yGoal = h;

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
  scale[i] = hsv2rgb((i * 360) / 256, 1.0, 0.5);
}

let renderStartTime = null;

function anim(t) {
  let renderEndTime = Date.now() + 50;
  let before = y;
  do {
    renderRow(y);
    y = (y + 1) % h;
  } while (y != yGoal && Date.now() < renderEndTime);
  let delta = (y + h - before) % h;
  if (y != yGoal)
    requestAnimationFrame(anim);
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
  var rect = ca.getBoundingClientRect();
  var mx = e.clientX - rect.left;
  var my = e.clientY - rect.top;
  let cx = xmin + xsize * mx / w;
  let cy = ymin + ysize * my / h;

  let xmin1 = cx - (cx - xmin) * 0.8;
  let xmax1 = cx + (xmax - cx) * 0.8;
  let ymin1 = cy - (cy - ymin) * 0.8;
  let ymax1 = cy + (ymax - cy) * 0.8;
  let xsize1 = xmax1 - xmin1;
  let ysize1 = ymax1 - ymin1;

  let dw = w * xsize / xsize1;
  let dh = h * ysize / ysize1;
  let dx = mx - mx * (xsize / xsize1);
  let dy = my - my * (ysize / ysize1);

  let sx = (xsize / xsize1);
  let sy = (ysize / ysize1);
  let tx = -dx;
  let ty = -dy;
  var imageObject = new Image();
  imageObject.onload = function() {
    ct.translate(dx, dy);
    ct.scale(sx, sy);
    ct.drawImage(imageObject, 0, 0);
    ct.resetTransform();
    if (y == yGoal)
      startRender();
    else
      yGoal = y;
  }
  imageObject.src = ca.toDataURL();

  xmin = xmin1;
  xmax = xmax1;
  ymin = ymin1;
  ymax = ymax1;
  xsize = xsize1;
  ysize = ysize1;
  xscale = xsize / w;
  yscale = ysize / h;
}

let img = new ImageData(w, 1);
let data = img.data;

function renderRow(y) {
  // map y coordinate to non-linear order
  // y = (Math.floor(y / 32) * 11) % 15 + (y % 32) * 15;

  let cy = ymin + yscale * y;
  for (let x = 0; x < w; ++x) {
    let cx = xmin + xscale * x;
    let zy = cy;
    let zx = cx;
    let n = 0;
    let zx2, zy2;
    while ((zx2 = zx * zx) + (zy2 = zy * zy) <= 4.0) {
      zy = 2 * zx * zy + cy;
      zx = zx2 - zy2 + cx;
      if (++n == 4096) break;
    }
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
  ct.putImageData(img, 0, y);
}

startRender();
