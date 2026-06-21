(function () {
  'use strict';
  var KEY = 'dekade-home-index-editor-v1';
  var defaults = [
    { title: 'CHARACTERS', url: '/characters/', description: '두 사람의 인물 기록' },
    { title: 'ARCHIVE', url: '/archive/', description: '대화와 메시지' },
    { title: 'WORLD', url: '/world/', description: '세계와 설정' },
    { title: 'ROLEPLAY', url: '/roleplay/', description: '이어지는 장면들' },
    { title: 'GALLERY', url: '/gallery/', description: '시각 기록 보관함' },
    { title: 'WRITINGS', url: '/writings/', description: '짧은 글과 연작' },
    { title: 'TWITTER', url: '/twitter/', description: '월별 타임라인' },
    { title: 'TRPG', url: '/trpg/', description: '세션 로그 아카이브' },
    { title: 'CHECKLIST', url: '/checklist/', description: '함께 채워갈 목록' }
  ];
  var items;
  try { items = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (error) {}
  if (!Array.isArray(items)) items = defaults.map(function (item) { return Object.assign({}, item); });

  function escapeHtml(value) { return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function yaml(value) { return JSON.stringify(String(value || '')); }

  var panel = document.querySelector('.layout > .panel');
  var actions = panel.querySelector('.actions');
  var editor = document.createElement('section');
  editor.className = 'home-index-editor';
  editor.innerHTML = '<header><strong>ARCHIVE INDEX</strong><span>설명·링크·순서를 수정하거나 메뉴를 추가/삭제할 수 있습니다.</span></header><div data-index-items></div><button type="button" class="secondary" data-index-add>+ Add menu</button>';
  panel.insertBefore(editor, actions);

  var style = document.createElement('style');
  style.textContent = '.home-index-editor{border-top:1px solid #e6e2e7;margin-top:16px;padding-top:14px}.home-index-editor>header{display:flex;flex-direction:column;gap:3px;margin-bottom:8px}.home-index-editor>header strong{font-size:.68rem;letter-spacing:.08em}.home-index-editor>header span{color:#8b858e;font-size:.61rem}.home-index-row{align-items:end;border-bottom:1px solid #eeeaf0;display:grid;gap:6px;grid-template-columns:minmax(90px,.7fr) minmax(110px,.8fr) minmax(150px,1.4fr) auto;padding:7px 0}.home-index-row .row-actions{display:flex;gap:3px}.home-index-row button{padding:7px}.home-index-editor>[data-index-add]{margin-top:8px}@media(max-width:650px){.home-index-row{grid-template-columns:1fr 1fr}.home-index-row label:nth-child(3){grid-column:1/-1}}';
  document.head.appendChild(style);

  function patchOutput() {
    var output = document.getElementById('output');
    var text = output.value;
    var featuredAt = text.indexOf('featured_characters:');
    var indexAt = text.indexOf('archive_index:');
    var cutAt = [featuredAt, indexAt].filter(function (at) { return at >= 0; }).sort(function (a, b) { return a - b; })[0];
    if (cutAt != null) text = text.slice(0, cutAt);
    text = text.replace(/\s+$/, '');
    text += '\nfeatured_characters:\n  - "katia-feltroof"\n  - "dietrich-schwartz"\narchive_index:\n';
    items.forEach(function (item) { text += '  - title: ' + yaml(item.title) + '\n    url: ' + yaml(item.url) + '\n    description: ' + yaml(item.description) + '\n'; });
    output.value = text + '\n';
    localStorage.setItem(KEY, JSON.stringify(items));
    return text;
  }

  function render() {
    editor.querySelector('[data-index-items]').innerHTML = items.map(function (item, index) {
      return '<div class="home-index-row" data-index="' + index + '"><label>Menu title<input data-field="title" value="' + escapeHtml(item.title) + '"></label><label>URL<input data-field="url" value="' + escapeHtml(item.url) + '"></label><label>Description<input data-field="description" value="' + escapeHtml(item.description) + '"></label><div class="row-actions"><button type="button" class="secondary" data-action="up" title="위로">↑</button><button type="button" class="secondary" data-action="down" title="아래로">↓</button><button type="button" class="danger" data-action="delete" title="삭제">×</button></div></div>';
    }).join('');
    patchOutput();
  }

  editor.addEventListener('input', function (event) {
    var row = event.target.closest('[data-index]');
    if (!row || !event.target.dataset.field) return;
    items[Number(row.dataset.index)][event.target.dataset.field] = event.target.value;
    patchOutput();
  });
  editor.addEventListener('click', function (event) {
    if (event.target.matches('[data-index-add]')) { items.push({ title: 'NEW MENU', url: '/', description: '' }); render(); return; }
    var button = event.target.closest('[data-action]');
    if (!button) return;
    var index = Number(button.closest('[data-index]').dataset.index);
    if (button.dataset.action === 'delete') items.splice(index, 1);
    if (button.dataset.action === 'up' && index > 0) items.splice(index - 1, 0, items.splice(index, 1)[0]);
    if (button.dataset.action === 'down' && index < items.length - 1) items.splice(index + 1, 0, items.splice(index, 1)[0]);
    render();
  });
  document.querySelectorAll('input,textarea,select').forEach(function (input) { if (!editor.contains(input)) input.addEventListener('input', function () { setTimeout(patchOutput, 20); }); });
  setTimeout(render, 20);
})();
