// The hourglass owns its countdown state and input handling independently
// from the Study Room layout and the main Pomodoro timer.
export function mountHourglass({ getRemainingSeconds, root = document } = {}) {
  if (typeof getRemainingSeconds !== 'function') throw new TypeError('getRemainingSeconds must be a function');
  const $ = id => root.getElementById(id);
  const button = $('hourglassStart');
  if (!button) throw new Error('hourglassStart button was not found');
  let duration = 300, remaining = 300, deadline = 0, interval = null;
  let running = false, pressTimer = null, longPressed = false, pageVisible = true, destroyed = false;
  function render() {
    const seconds = Math.max(0, remaining);
    $('hourglassTime').textContent = String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0');
    $('hourglassArt').classList.toggle('is-running', running);
    button.setAttribute('aria-label', running ? '5分休憩を一時停止する' : seconds === 0 ? 'もう一度5分休憩する' : '5分間の休憩を始める');
    $('hourglassState').textContent = seconds === 0 ? '終了 · 長押しで戻す' : running ? '休憩中 · タップで停止' : 'タップで休憩 · 長押しで戻す';
    const fraction = duration ? remaining / duration : 0;
    $('hourglassSandTop').style.transform = 'scaleY(' + Math.max(0, fraction) + ')';
    $('hourglassSandBottom').style.transform = 'scaleY(' + Math.max(0, 1 - fraction) + ')';
    $('hourglassTime').setAttribute('aria-label', '残り ' + Math.floor(seconds / 60) + ' 分 ' + (seconds % 60) + ' 秒');
  }
  function scheduleTick() {
    if (!destroyed && pageVisible && running && interval === null) interval = window.setInterval(tick, 1000);
  }
  function stop() {
    if (interval !== null) { window.clearInterval(interval); interval = null; }
    running = false;
  }
  function tick() {
    if (!running) return;
    remaining = getRemainingSeconds(deadline);
    if (remaining <= 0) { remaining = 0; stop(); }
    render();
  }
  function start() {
    if (destroyed) return;
    if (remaining <= 0) remaining = duration;
    deadline = Date.now() + remaining * 1000;
    running = true;
    if (interval !== null) window.clearInterval(interval);
    interval = null;
    scheduleTick();
    render();
  }
  function setVisible(visible) {
    if (destroyed) return;
    pageVisible = !!visible;
    if (!pageVisible) {
      tick();
      if (interval !== null) { window.clearInterval(interval); interval = null; }
      return;
    }
    tick();
    scheduleTick();
  }
  function reset() {
    if (destroyed) return;
    stop(); duration = 300; remaining = duration; deadline = 0; render();
  }
  function handleClick() {
    if (longPressed) { longPressed = false; return; }
    if (running) { tick(); if (remaining > 0) { stop(); render(); } }
    else start();
  }
  function handleKeydown(event) {
    if (event.key.toLowerCase() !== 'r' || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
    event.preventDefault();
    reset();
    $('hourglassState').textContent = '5分に戻しました';
  }
  function handlePointerDown(event) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    longPressed = false;
    if (pressTimer !== null) window.clearTimeout(pressTimer);
    pressTimer = window.setTimeout(() => {
      pressTimer = null;
      longPressed = true; reset();
      $('hourglassState').textContent = '5分に戻しました';
    }, 700);
  }
  function clearPressTimer() {
    if (pressTimer !== null) window.clearTimeout(pressTimer);
    pressTimer = null;
  }
  function handleContextMenu(event) { event.preventDefault(); }
  const pointerEndEvents = ['pointerup', 'pointerleave', 'pointercancel'];
  button.addEventListener('click', handleClick);
  button.addEventListener('keydown', handleKeydown);
  button.addEventListener('pointerdown', handlePointerDown);
  pointerEndEvents.forEach(type => button.addEventListener(type, clearPressTimer));
  button.addEventListener('contextmenu', handleContextMenu);
  render();
  return {
    tick, reset, setVisible,
    getState: () => ({ duration, remaining, running, deadline }),
    destroy() {
      if (destroyed) return;
      destroyed = true;
      stop();
      clearPressTimer();
      button.removeEventListener('click', handleClick);
      button.removeEventListener('keydown', handleKeydown);
      button.removeEventListener('pointerdown', handlePointerDown);
      pointerEndEvents.forEach(type => button.removeEventListener(type, clearPressTimer));
      button.removeEventListener('contextmenu', handleContextMenu);
    }
  };
}
