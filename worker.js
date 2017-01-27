let scale = null;
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

onmessage = function(e) {
  if (scale == null) {
    scale = e.data;
  } else {
    let data = new Uint8ClampedArray(e.data.w * 4);
    renderRowData(e.data.cy, e.data.xmin, e.data.xscale, e.data.w, data);
    postMessage({y: e.data.y, data: data});
  }
};
