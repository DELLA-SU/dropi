// Presentation only: this illustration never opens or processes a visitor's file.
(() => {
  const stage = document.querySelector('[data-how-demo]');
  if (!stage) return;
  const input = stage.querySelector('.how-demo-file--input');
  const result = stage.querySelector('.how-demo-file--result');
  const cursor = stage.querySelector('.how-demo-cursor');
  const target = stage.querySelector('.how-demo-target');
  const toggle = stage.querySelector('.how-demo-toggle');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let playing = !reduced.matches;
  let visible = false;
  let animations = [];
  let lastSize = '';
  let resizeFrame = 0;

  function syncPlayback() {
    const active = playing && visible && !document.hidden;
    animations.forEach(animation => active ? animation.play() : animation.pause());
    toggle.textContent = playing ? '일시정지' : '재생';
    toggle.setAttribute('aria-label', `파일 드롭 시연 ${playing ? '일시정지' : '재생'}`);
  }

  function buildMotion() {
    animations.forEach(animation => animation.cancel());
    animations = [];
    if (!input.animate) {
      stage.classList.add('is-still');
      toggle.hidden = true;
      return;
    }
    stage.classList.toggle('is-still', !playing);
    const sr = stage.getBoundingClientRect();
    const fr = input.getBoundingClientRect();
    const tr = target.getBoundingClientRect();
    const sx = fr.left - sr.left + fr.width * .78;
    const sy = fr.top - sr.top + fr.height * .65;
    const dx = tr.left + tr.width / 2 - (fr.left + fr.width / 2);
    const dy = tr.top + tr.height / 2 - (fr.top + fr.height / 2);
    const original = 'translate(0,0) scale(1)';
    const dropped = `translate(${dx}px,${dy}px) scale(.84)`;
    const pointer = (x, y) => `translate(${x}px,${y}px)`;
    const options = { duration: 7200, iterations: Infinity, fill: 'both' };
    animations.push(input.animate([
      { offset: 0, transform: original, opacity: 1 },
      { offset: .19, transform: original, opacity: 1, easing: 'cubic-bezier(.45,0,.2,1)' },
      { offset: .43, transform: dropped, opacity: 1 },
      { offset: .47, transform: `translate(${dx}px,${dy + 5}px) scale(.55)`, opacity: 0 },
      { offset: .91, transform: original, opacity: 0 },
      { offset: .99, transform: original, opacity: 1 },
      { offset: 1, transform: original, opacity: 1 }
    ], options));
    animations.push(cursor.animate([
      { offset: 0, transform: pointer(sx + 30, sy - 20), opacity: 0 },
      { offset: .07, transform: pointer(sx + 30, sy - 20), opacity: 0 },
      { offset: .14, transform: pointer(sx, sy), opacity: 1 },
      { offset: .19, transform: pointer(sx, sy), opacity: 1, easing: 'cubic-bezier(.45,0,.2,1)' },
      { offset: .43, transform: pointer(sx + dx, sy + dy), opacity: 1 },
      { offset: .47, transform: pointer(sx + dx, sy + dy), opacity: 1 },
      { offset: .54, transform: pointer(sx + dx + 32, sy + dy + 25), opacity: 0 },
      { offset: 1, transform: pointer(sx + dx + 32, sy + dy + 25), opacity: 0 }
    ], options));
    animations.push(result.animate([
      { offset: 0, opacity: 0, transform: 'translateY(10px)' },
      { offset: .5, opacity: 0, transform: 'translateY(10px)' },
      { offset: .57, opacity: 1, transform: 'translateY(0)' },
      { offset: .87, opacity: 1, transform: 'translateY(0)' },
      { offset: .94, opacity: 0, transform: 'translateY(0)' },
      { offset: 1, opacity: 0, transform: 'translateY(10px)' }
    ], options));
    animations.push(target.animate([
      { offset: 0, backgroundColor: '#ffffff', borderColor: '#dce4ef', boxShadow: '0 0 0 0 #286be600' },
      { offset: .2, backgroundColor: '#ffffff', borderColor: '#dce4ef', boxShadow: '0 0 0 0 #286be600' },
      { offset: .27, backgroundColor: '#eaf2ff', borderColor: '#7ba6ef', boxShadow: '0 0 0 3px #286be612' },
      { offset: .48, backgroundColor: '#eaf2ff', borderColor: '#7ba6ef', boxShadow: '0 0 0 3px #286be612' },
      { offset: .57, backgroundColor: '#ffffff', borderColor: '#dce4ef', boxShadow: '0 0 0 0 #286be600' },
      { offset: 1, backgroundColor: '#ffffff', borderColor: '#dce4ef', boxShadow: '0 0 0 0 #286be600' }
    ], options));
    if (!playing) animations.forEach(animation => { animation.currentTime = 4600; });
    syncPlayback();
  }

  toggle.addEventListener('click', () => {
    playing = !playing;
    stage.classList.remove('is-still');
    syncPlayback();
  });
  document.addEventListener('visibilitychange', syncPlayback);
  reduced.addEventListener('change', () => { playing = !reduced.matches; buildMotion(); });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => { visible = entries[0].isIntersecting; syncPlayback(); }, { threshold: .1 }).observe(stage);
  } else visible = true;
  if ('ResizeObserver' in window) {
    new ResizeObserver(() => {
      const size = `${stage.clientWidth}:${stage.clientHeight}`;
      if (size === lastSize) return;
      lastSize = size;
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(buildMotion);
    }).observe(stage);
  }
  buildMotion();
})();
