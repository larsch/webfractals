# JavaScript/HTML5 Canvas/Web Worker Mandelbrot Fractal Renderer

This project is a fast, fluid and smooth Mandelbrot fractal generator
written entirely in JavaScript, utilising HTML5 Canvas for rendering,
Web Worker for multi-core/concurrent processing and a fully
interruptible rendering algorithm to make the experience smooth when
zooming and dragging.

The project was written from scratch by me with inspiration from many
others. Specially thanks to [cslarsen](https://github.com/cslarsen/)'s
and his [mandelbrot-js](https://github.com/cslarsen/mandelbrot-js)
project with a great write-up of some of the techniques applied.

## Multi-core rendering

Multi-core rendering is achieved in the browser using [Web
Workers](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers). Two
workers are spawned per available processor core, to ensure maximum
utilisation. The main script dispatches rendering jobs to the workers
and draws the results on the canvas. Each job is a single horizontal
line of the canvas. This keeps the jobs non-trivial (less overhead)
and local (better CPU cache locality).

## Progressive rendering

Progressive rendering is achieved by rendering all the rows of the
image in a non-linear order. In fact, they are rendered in order of
the line number with its bits reversed.

Sub-pixel rendering (anti-aliasing) is also done progressively. A
uniform set of sub-pixel offsets is used. The first pass writes
resulting color values directly to the canvas. Subsequent passes are
first written to an off-screen canvas. Then the off-screen canvas is
drawn onto the visible canvas with the global alpha level set
appropriately. The second pass is drawn with alpha 0.5, third pass
with alpha 1/3, fourth pass with alpha 1/4 and so on. It may not be
perfectly accurate at later passes since results are rounded to 8-bit
integers, but it's certainly good for this project.

## Smooth interaction

Zooming, dragging and resizing the canvas is made a smooth as possible
by two techniques. First, the currently shown image is re-drawn on the
canvas with the new position and scaling. Secondly, a render already
in progress is interrupted, and rendering is started on the new
viewport, continuing from the last row already displayed. This means
that the last row to be displayed will then get to the back of the
queue and be the last to be updated in the next rendering. All lines
will eventually be rendered even when continously interrupting the
rendering by scrolling/dragging.

## Event throttling

Drag, zoom and window sizes all cause a lot of events. In order to not
let the event handling completely starve the rendering processes,
handling of these events are throttled to a specific rate. See the
[addThrottledEventHandler](https://gist.github.com/larsch/b1509e7f66fb17b0cc394d02af5985fa)
function and its use for details.
