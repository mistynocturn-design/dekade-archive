(function () {
  'use strict';
  var KEY = 'dekade-trpg-playlist-v1', tracks = [];
  var selectedPanel = Array.prototype.find.call(document.querySelectorAll('.panel'), function (panel) { return panel.querySelector('h2') && panel.querySelector('h2').textContent.trim() === 'Selected item'; });
  if (!selectedPanel) return;
  var style = document.createElement('style');
  style.textContent = '.playlist-editor{display:grid;gap:7px}.playlist-row{align-items:end;border:1px solid #e5e1e6;border-radius:5px;display:grid;gap:6px;grid-template-columns:1fr 1fr 1.35fr auto auto;padding:7px}.playlist-row button{height:31px;padding:5px 8px}.playlist-empty{color:#7f7a82;font-size:.62rem;margin:0}@media(max-width:720px){.playlist-row{grid-template-columns:1fr}.playlist-row button{width:100%}}';
  document.head.appendChild(style);
  var panel = document.createElement('section'); panel.className = 'panel';
  panel.innerHTML = '<h2>Playlist · 로컬 MP3</h2><p class="small">MP3를 세션의 <code>assets/trpg/.../audio/</code> 폴더에 넣고 repo 경로를 등록하세요. 위아래 버튼으로 재생 순서를 정할 수 있습니다.</p><div class="playlist-editor" id="playlistEditor"></div><div class="actions"><button id="addTrack" class="secondary" type="button">+ 곡 추가</button></div>';
  selectedPanel.parentNode.insertBefore(panel, selectedPanel.nextSibling);
  var editor = panel.querySelector('#playlistEditor');
  function escapeHtml(value) { return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function normalizePath(value) {
    var path = String(value || '').trim().replace(/[\\₩]+/g, '/'), at = path.toLowerCase().indexOf('/assets/');
    if (at >= 0) path = path.slice(at); else if (path.toLowerCase().indexOf('assets/') === 0) path = '/' + path;
    path = path.replace(/^\/dekade-archive/, '');
    return path;
  }
  function yaml(value) { return JSON.stringify(String(value || '')); }
  function playlistYaml() {
    if (!tracks.length) return 'playlist: []';
    return ['playlist:'].concat(tracks.map(function (track) { return '  - title: ' + yaml(track.title) + '\n    scene: ' + yaml(track.scene) + '\n    file: ' + yaml(normalizePath(track.file)); })).join('\n');
  }
  function inject(markdown) {
    var text = String(markdown || ''), block = playlistYaml();
    text = text.replace(/\nplaylist:\s*(?:\[\]|\n(?:[ \t]+.*\n?)*)?(?=---)/, '\n');
    return text.replace(/\n---\n/, '\n' + block + '\n---\n');
  }
  function save() { localStorage.setItem(KEY, JSON.stringify(tracks)); refreshOutput(); }
  function render() {
    editor.innerHTML = tracks.length ? tracks.map(function (track, index) {
      return '<div class="playlist-row" data-track="' + index + '"><label>곡 제목<input data-field="title" value="' + escapeHtml(track.title) + '" placeholder="곡 제목"></label><label>사용 장면<input data-field="scene" value="' + escapeHtml(track.scene) + '" placeholder="추격 장면"></label><label>MP3 repo 경로<input data-field="file" value="' + escapeHtml(track.file) + '" placeholder="/assets/trpg/.../audio/01.mp3"></label><button class="secondary" type="button" data-move="up" title="위로">↑</button><button class="danger" type="button" data-remove title="삭제">삭제</button></div>';
    }).join('') : '<p class="playlist-empty">등록된 곡이 없습니다. 곡 추가 버튼으로 시작하세요.</p>';
  }
  function refreshOutput() { var output = document.getElementById('output'); if (output && output.value) nativeSet.call(output, inject(nativeGet.call(output))); }
  editor.addEventListener('input', function (event) { var row = event.target.closest('[data-track]'); if (!row || !event.target.dataset.field) return; tracks[Number(row.dataset.track)][event.target.dataset.field] = event.target.value; save(); });
  editor.addEventListener('click', function (event) {
    var row = event.target.closest('[data-track]'); if (!row) return; var index = Number(row.dataset.track);
    if (event.target.closest('[data-remove]')) tracks.splice(index, 1);
    if (event.target.closest('[data-move="up"]') && index > 0) { var item = tracks.splice(index, 1)[0]; tracks.splice(index - 1, 0, item); }
    render(); save();
  });
  panel.querySelector('#addTrack').addEventListener('click', function () { tracks.push({title: '', scene: '', file: ''}); render(); save(); var inputs = editor.querySelectorAll('input'); if (inputs.length) inputs[inputs.length - 3].focus(); });
  var descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value'), nativeGet = descriptor.get, nativeSet = descriptor.set;
  var output = document.getElementById('output');
  if (output) Object.defineProperty(output, 'value', {configurable: true, get: function () { return nativeGet.call(this); }, set: function (value) { nativeSet.call(this, inject(value)); }});
  var completed = document.getElementById('completedMdFile');
  if (completed) completed.addEventListener('change', function () {
    var file = this.files[0]; if (!file) return; var reader = new FileReader(); reader.onload = function () {
      var block = String(reader.result).match(/\nplaylist:\s*\n((?:[ \t]+.*\n?)*)---/); if (!block) { tracks = []; render(); save(); return; }
      var current = null, parsed = []; block[1].split(/\r?\n/).forEach(function (line) {
        var match = line.match(/^\s*-\s+title:\s*(.*)$/); if (match) { current = {title: parseValue(match[1]), scene: '', file: ''}; parsed.push(current); return; }
        match = line.match(/^\s+(scene|file):\s*(.*)$/); if (match && current) current[match[1]] = parseValue(match[2]);
      }); tracks = parsed; render(); save();
    }; reader.readAsText(file);
  });
  function parseValue(value) { try { return JSON.parse(value); } catch (error) { return value.replace(/^['"]|['"]$/g, ''); } }
  try { tracks = JSON.parse(localStorage.getItem(KEY) || '[]'); if (!Array.isArray(tracks)) tracks = []; } catch (error) { tracks = []; }
  render(); refreshOutput();
})();
