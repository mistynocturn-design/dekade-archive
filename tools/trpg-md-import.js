(function () {
  'use strict';

  var htmlInput = document.getElementById('htmlFile');
  var projectInput = document.getElementById('projectFile');
  var status = document.getElementById('importStatus');
  if (!htmlInput || !projectInput) return;

  function scalar(value) {
    value = String(value || '').trim();
    if (!value) return '';
    try { return JSON.parse(value); } catch (error) { return value.replace(/^['"]|['"]$/g, ''); }
  }

  function textWithBreaks(element) {
    var copy = element.cloneNode(true);
    copy.querySelectorAll('br').forEach(function (br) { br.replaceWith('\n'); });
    return copy.textContent.replace(/\r/g, '').trim();
  }

  function parseMarkdown(markdown, fileName) {
    var match = String(markdown || '').match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)([\s\S]*)$/);
    if (!match) throw new Error('TRPG Markdown의 front matter(---)를 찾지 못했습니다.');
    var front = {};
    match[1].split(/\r?\n/).forEach(function (line) {
      var colon = line.indexOf(':');
      if (colon < 0) return;
      front[line.slice(0, colon).trim()] = scalar(line.slice(colon + 1));
    });
    var meta = {
      title: front.title || '', system: front.system || '', fileName: String(fileName || 'trpg-session.md').replace(/\.md$/i, ''),
      sessionDate: front.session_date || '', endDate: front.end_date || '', duration: front.duration || '',
      players: Array.isArray(front.players) ? front.players.join(', ') : (front.players || ''),
      tags: Array.isArray(front.tags) ? front.tags.join(', ') : (front.tags || ''), summary: front.summary || '',
      sourceUrl: front.source_url || '', cover: front.cover || '', pageBg: front.page_bg || '#17161a',
      logBg: front.log_bg || '#211f24', textColor: front.text_color || '#f2eff2', accent: front.accent || '#8ca7d8'
    };
    var template = document.createElement('template');
    template.innerHTML = match[2];
    var profiles = {}, items = [];
    Array.from(template.content.children).forEach(function (element) {
      if (element.matches('article.trpg-entry')) {
        var strong = element.querySelector('header strong');
        var speaker = element.getAttribute('data-trpg-speaker') || (strong && strong.textContent.trim()) || 'SPEAKER';
        var avatar = element.querySelector('.trpg-entry-avatar img');
        var channel = element.querySelector('header small');
        var body = element.querySelector('.trpg-entry-text');
        var color = element.style.getPropertyValue('--speaker-color').trim() || '#888888';
        if (!profiles[speaker]) profiles[speaker] = { display: speaker, color: color, avatar: avatar ? avatar.getAttribute('src') || '' : '' };
        items.push({ type: 'message', speaker: speaker, channel: channel ? channel.textContent.trim() : '', text: body ? textWithBreaks(body) : '' });
      } else if (element.matches('figure.trpg-scene')) {
        var image = element.querySelector('img');
        var caption = element.querySelector('figcaption');
        if (image) items.push({ type: 'image', src: image.getAttribute('src') || '', caption: caption ? caption.textContent.trim() : '' });
      }
    });
    if (!items.length) throw new Error('편집 가능한 대사 또는 삽입 이미지를 찾지 못했습니다. 이 컨버터에서 만든 .md인지 확인해주세요.');
    return { version: 1, meta: meta, profiles: profiles, items: items, selected: 0 };
  }

  function loadAsProject(project, sourceName) {
    var transfer = new DataTransfer();
    transfer.items.add(new File([JSON.stringify(project)], sourceName.replace(/\.md$/i, '') + '.json', { type: 'application/json' }));
    projectInput.files = transfer.files;
    projectInput.dispatchEvent(new Event('change', { bubbles: true }));
  }

  var projectLabel = projectInput.closest('label');
  var label = document.createElement('label');
  label.style.marginTop = '8px';
  label.innerHTML = '완성된 TRPG Markdown — 다시 수정하기<input id="completedMdFile" type="file" accept=".md,text/markdown,text/plain">';
  var help = document.createElement('p');
  help.className = 'small';
  help.textContent = '이 컨버터에서 만든 완성본 .md를 불러와 세션 정보, 캐릭터, 대사와 이미지를 다시 편집합니다.';
  projectLabel.parentElement.insertBefore(label, projectLabel);
  projectLabel.parentElement.insertBefore(help, projectLabel);
  label.querySelector('input').addEventListener('change', function () {
    var file = this.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        loadAsProject(parseMarkdown(reader.result, file.name), file.name);
        status.textContent = '완성된 Markdown을 편집 프로젝트로 불러왔습니다.';
      } catch (error) { status.textContent = error.message; }
    };
    reader.readAsText(file);
    this.value = '';
  });
})();
