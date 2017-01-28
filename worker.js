let palette = null;
let steps = 4096;
let xmin = null;
let w = null;
let xscale = null;
let ymin = null;
let yscale = null;
let data = null;
let generation = null;
let id = null;

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

function renderRowData(y) {
  let cy = ymin + yscale * y;
  for (let x = 0; x < w; ++x) {
    let cx = xmin + xscale * x;
    let n = iter(cx, cy);
    let p = x * 4;
    if (n == steps) {
      data[p+0] = 0;
      data[p+1] = 0;
      data[p+2] = 0;
      data[p+3] = 255;
    } else {
      n = (n % 256) * 4;
      data[p+0] = palette[n+0];
      data[p+1] = palette[n+1];
      data[p+2] = palette[n+2];
      data[p+3] = palette[n+3];
    }
    data[p + 3] = 255;
  }
}

onmessage = function(e) {
  let msg = e.data;
  if (typeof msg == 'object') {
    if (msg.palette) {
      palette = msg.palette;
      id = msg.id;
    } else if (msg.steps) {
      steps = msg.steps;
      xmin = msg.xmin;
      xscale = msg.xscale;
      ymin = msg.ymin;
      yscale = msg.yscale;
      generation = msg.generation;
      w = msg.w;
      data = new Uint8ClampedArray(w * 4);
    }
  } else {
    let y = msg;
    renderRowData(y);
    postMessage({y: y, data: data, generation: generation});
  }
};
