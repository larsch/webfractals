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


const log2Inverse = 1.0 / Math.log(2.0);
const logHalflog2Inverse = Math.log(0.5)*log2Inverse;
function fraction(zx2, zy2)
{
  return 5 - logHalflog2Inverse - Math.log(Math.log(zx2+zy2)) * log2Inverse;
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
  for (let i = 0; i < 4; ++i) {
    zy = 2 * zx * zy + cy;
    zx = zx2 - zy2 + cx;
    zx2 = zx * zx;
    zy2 = zy * zy;
  }
  let f = fraction(zx2, zy2);
  return [n, f];
}

function renderRowData(y) {
  let cy = ymin + yscale * y;
  for (let x = 0; x < w; ++x) {
    let cx = xmin + xscale * x;
    let r = iter(cx, cy);
    let n = r[0];
    let p = x * 4;
    if (n == steps) {
      data[p+0] = 0;
      data[p+1] = 0;
      data[p+2] = 0;
      data[p+3] = 255;
    } else {
      let n1 = (n % 256) * 4;
      let f2 = r[1];
      let f1 = 1.0 - f2;
      let n2 = ((n + 1) % 256) * 4;
      data[p+0] = f1 * palette[n1+0] + f2 * palette[n2+0];
      data[p+1] = f1 * palette[n1+1] + f2 * palette[n2+1];
      data[p+2] = f1 * palette[n1+2] + f2 * palette[n2+2];
      data[p+3] = f1 * palette[n1+3] + f2 * palette[n2+3];
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
