(function () {
  'use strict';
  document.querySelectorAll('[data-trpg-player]').forEach(function (root) {
    var audio = root.querySelector('[data-audio]');
    var tracks = JSON.parse(root.querySelector('[data-playlist-data]').textContent || '[]');
    var index = 0, repeatMode = 0;
    var title = root.querySelector('[data-track-title]'), scene = root.querySelector('[data-scene-name]');
    var number = root.querySelector('[data-track-number]'), icon = root.querySelector('[data-play-icon]');
    var current = root.querySelector('[data-current-time]'), duration = root.querySelector('[data-duration]');
    var progress = root.querySelector('[data-progress]'), list = root.querySelector('[data-playlist]');
    var panel = root.querySelector('[data-panel]'), more = root.querySelector('[data-action="more"]');
    function time(value) { if (!isFinite(value)) return '0:00'; return Math.floor(value / 60) + ':' + String(Math.floor(value % 60)).padStart(2, '0'); }
    function select(next, autoplay) {
      if (!tracks.length) return;
      index = (next + tracks.length) % tracks.length;
      audio.src = tracks[index].src; title.textContent = tracks[index].title; scene.textContent = tracks[index].scene;
      number.textContent = String(index + 1).padStart(2, '0');
      list.querySelectorAll('button').forEach(function (button, i) { button.classList.toggle('is-current', i === index); });
      if (autoplay) audio.play().catch(function () {});
    }
    tracks.forEach(function (track, i) {
      var li = document.createElement('li'), button = document.createElement('button'); button.type = 'button';
      button.innerHTML = '<span>' + String(i + 1).padStart(2, '0') + '</span><strong></strong><small></small>';
      button.querySelector('strong').textContent = track.title; button.querySelector('small').textContent = track.scene;
      button.addEventListener('click', function () { select(i, true); panel.hidden = true; root.classList.remove('is-open'); more.textContent = '＋'; more.setAttribute('aria-expanded', 'false'); });
      li.appendChild(button); list.appendChild(li);
    });
    root.querySelector('[data-empty]').hidden = tracks.length > 0;
    root.addEventListener('click', function (event) {
      var button = event.target.closest('[data-action]'); if (!button) return;
      var action = button.dataset.action;
      if (action === 'toggle') { if (!tracks.length) { panel.hidden = false; root.classList.add('is-open'); more.textContent = '×'; return; } if (!audio.src) select(index, false); audio.paused ? audio.play().catch(function () {}) : audio.pause(); }
      if (action === 'stop') { audio.pause(); audio.currentTime = 0; }
      if (action === 'prev') select(index - 1, true);
      if (action === 'next') select(index + 1, true);
      if (action === 'repeat-cycle') {
        repeatMode = (repeatMode + 1) % 3; audio.loop = repeatMode === 1;
        var modes = ['none', 'one', 'all'], labels = ['반복 없음', '현재곡 반복', '전체 곡 반복'], marks = ['×', '1', 'A'];
        button.dataset.repeatMode = modes[repeatMode]; button.setAttribute('aria-label', labels[repeatMode]); button.title = labels[repeatMode]; button.querySelector('[data-repeat-mark]').textContent = marks[repeatMode];
      }
      if (action === 'more') { var open = panel.hidden; panel.hidden = !open; root.classList.toggle('is-open', open); button.textContent = open ? '×' : '＋'; button.setAttribute('aria-expanded', String(open)); button.setAttribute('aria-label', open ? '상세 기능 접기' : '상세 기능 펼치기'); }
    });
    root.querySelector('[data-volume]').addEventListener('input', function (event) { audio.volume = event.target.value; root.querySelector('[data-volume-value]').textContent = Math.round(event.target.value * 100) + '%'; });
    audio.volume = .7;
    audio.addEventListener('play', function () { root.classList.add('is-playing'); icon.textContent = '❚❚'; root.querySelector('[data-action="toggle"]').setAttribute('aria-label', '일시정지'); });
    audio.addEventListener('pause', function () { root.classList.remove('is-playing'); icon.textContent = '▶'; root.querySelector('[data-action="toggle"]').setAttribute('aria-label', '재생'); });
    audio.addEventListener('loadedmetadata', function () { duration.textContent = time(audio.duration); });
    audio.addEventListener('timeupdate', function () { current.textContent = time(audio.currentTime); progress.style.width = (audio.duration ? audio.currentTime / audio.duration * 100 : 0) + '%'; });
    audio.addEventListener('ended', function () { if (!audio.loop && (index < tracks.length - 1 || repeatMode === 2)) select(index + 1, true); });
    if (tracks.length) select(0, false);
  });
})();
