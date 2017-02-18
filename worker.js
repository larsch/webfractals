/*!
 * Multi-core Mandelbrot Renderer
 * Copyright(c) 2017 Lars Christensen
 * MIT Licensed
 */

/* global onmessage:true postMessage */
/* exported onmessage */

let palette = null;
let steps = 4096;
let xmin = null;
let w = null;
let xscale = null;
let ymin = null;
let yscale = null;
let data = null;
let generation = null;
let substep = null;
let Cx, Cy;

const log2Inverse = 1.0 / Math.log(2.0);
const logHalflog2Inverse = Math.log(0.5) * log2Inverse;
const log = Math.log;

let iterateFunction = null;

function fraction (zx2, zy2) {
  return 5 - logHalflog2Inverse - log(log(zx2 + zy2)) * log2Inverse;
}

function mandelIter (cx, cy) {
  let zy = cy;
  let zx = cx;
  let n = 0;
  let zx2, zy2;
  while ((zx2 = zx * zx) + (zy2 = zy * zy) <= 4.0 && ++n < steps) {
    zy = 2 * zx * zy + cy;
    zx = zx2 - zy2 + cx;
  }
  for (let i = 0; i < 4; ++i) {
    zy = 2 * zx * zy + cy;
    zx = zx2 - zy2 + cx;
    zx2 = zx * zx;
    zy2 = zy * zy;
  }
  return [n, zx2, zy2];
}

function juliaIter (cx, cy) {
  let zy = cy;
  let zx = cx;
  let n = 0;
  let zx2, zy2;
  while ((zx2 = zx * zx) + (zy2 = zy * zy) <= 4.0 && ++n < steps) {
    zy = 2 * zx * zy + Cy;
    zx = zx2 - zy2 + Cx;
  }
  for (let i = 0; i < 4; ++i) {
    zy = 2 * zx * zy + Cy;
    zx = zx2 - zy2 + Cx;
    zx2 = zx * zx;
    zy2 = zy * zy;
  }
  return [n, zx2, zy2];
}

function renderRowData (y) {
  let cy = ymin + yscale * y;
  for (let x = 0; x < w; ++x) {
    let cx = xmin + xscale * x;
    let res = iterateFunction(cx, cy);
    let n = res[0];
    let p = x * 4;
    if (n === steps) {
      data[p + 0] = 0;
      data[p + 1] = 0;
      data[p + 2] = 0;
      data[p + 3] = 255;
    } else {
      let zx2 = res[1];
      let zy2 = res[2];
      let sum = n + fraction(zx2, zy2);
      n = Math.floor(sum);
      let f2 = sum - n;
      let n1 = (n % 256) * 4;
      let f1 = 1.0 - f2;
      let n2 = ((n + 1) % 256) * 4;
      data[p + 0] = f1 * palette[n1 + 0] + f2 * palette[n2 + 0];
      data[p + 1] = f1 * palette[n1 + 1] + f2 * palette[n2 + 1];
      data[p + 2] = f1 * palette[n1 + 2] + f2 * palette[n2 + 2];
      data[p + 3] = 255;
    }
  }
}

function handlePalette (e) {
  palette = e.data;
  onmessage = handleRow;
}

function handleViewport (e) {
  let msg = e.data;
  if (msg === null) return;
  steps = msg[0];
  generation = msg[1];
  xmin = msg[2];
  xscale = msg[3];
  ymin = msg[4];
  yscale = msg[5];
  w = msg[6];
  substep = msg[7];
  Cx = msg[8];
  Cy = msg[9];
  iterateFunction = (Cx === undefined) ? mandelIter : juliaIter;
  data = new Uint8ClampedArray(w * 4);
  onmessage = handleRow;
}

function handleRow (e) {
  let y = e.data;
  if (y === null) {
    onmessage = handleViewport;
  } else {
    let y = e.data;
    renderRowData(y);
    postMessage([y, data, generation, substep]);
  }
}

onmessage = handlePalette;
