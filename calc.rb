h = 1080
p ss: ss = 16
p sl: sl = (1080 + ss - 1) / ss
p h2: h2 = sl * ss
ord = (0...h2).map { |y|
  ((y / sl) * 11) % ss +
    (y % sl) * ss
}
p ord
p ord.sort.uniq
p ord.size
