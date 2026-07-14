(function () {
  'use strict';
  document.querySelectorAll('[data-trpg-player]').forEach(function (root) {
    var audio = root.querySelector('[data-audio]');
    var tracks = JSON.parse(root.querySelector('[data-playlist-data]').textContent || '[]');
    var index = 0, repeatAll = false;
    var title = root.querySelector('[data-track-title]'), scene = root.querySelector('[data-scene-name]');
    var number = root.querySelector('[data-track-number]'), icon = root.querySelector('[data-play-icon]');
    var current = root.querySelector('[data-current-time]'), duration = root.querySelector('[data-duration]');
    var progress = root.querySelector('[data-progress]'), list = root.querySelector('[data-playlist]');
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
      button.addEventListener('click', function () { select(i, true); }); li.appendChild(button); list.appendChild(li);
    });
    root.querySelector('[data-track-count]').textContent = tracks.length + '곡';
    root.addEventListener('click', function (event) {
      var button = event.target.closest('[data-action]'); if (!button) return;
      var action = button.dataset.action;
      if (action === 'toggle') { if (!audio.src) select(index, false); audio.paused ? audio.play().catch(function () {}) : audio.pause(); }
      if (action === 'stop') { audio.pause(); audio.currentTime = 0; }
      if (action === 'prev') select(index - 1, true);
      if (action === 'next') select(index + 1, true);
      if (action === 'repeat-one') { audio.loop = !audio.loop; button.setAttribute('aria-pressed', audio.loop); }
      if (action === 'repeat-all') { repeatAll = !repeatAll; button.setAttribute('aria-pressed', repeatAll); }
      if (action === 'fold') { var folded = root.classList.toggle('is-folded'); button.textContent = folded ? '＋' : '−'; button.setAttribute('aria-expanded', !folded); button.setAttribute('aria-label', folded ? '리모컨 펼치기' : '리모컨 접기'); }
    });
    root.querySelector('[data-volume]').addEventListener('input', function (event) { audio.volume = event.target.value; root.querySelector('[data-volume-value]').textContent = Math.round(event.target.value * 100) + '%'; });
    audio.volume = .7;
    audio.addEventListener('play', function () { icon.textContent = '❚❚'; root.classList.add('is-playing'); root.querySelector('[data-action="toggle"]').setAttribute('aria-label', '일시정지'); });
    audio.addEventListener('pause', function () { icon.textContent = '▶'; root.classList.remove('is-playing'); root.querySelector('[data-action="toggle"]').setAttribute('aria-label', '재생'); });
    audio.addEventListener('loadedmetadata', function () { duration.textContent = time(audio.duration); });
    audio.addEventListener('timeupdate', function () { current.textContent = time(audio.currentTime); progress.style.width = (audio.duration ? audio.currentTime / audio.duration * 100 : 0) + '%'; });
    audio.addEventListener('ended', function () { if (!audio.loop && (index < tracks.length - 1 || repeatAll)) select(index + 1, true); });
    if (tracks.length) select(0, false);
  });
})();
