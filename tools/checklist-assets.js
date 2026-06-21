(function () {
  'use strict';

  var BASE = '/dekade-archive/';
  var rootHandle = null;
  var folderHandle = null;
  var parts = [];
  var nextSheetNumber = 1;

  function $(id) {
    return document.getElementById(id);
  }

  function show(text, ready) {
    $('assetStatus').innerHTML = text;
    $('assetStatus').style.color = ready ? '#4f765c' : '#8a6464';
  }

  async function scanNextSheetNumber() {
    var maxNumber = 0;

    for await (var entry of folderHandle.values()) {
      if (entry.kind !== 'file') continue;

      if (/^sheet\.pdf$/i.test(entry.name)) {
        maxNumber = Math.max(maxNumber, 1);
        continue;
      }

      var match = entry.name.match(/^sheet(\d+)\.pdf$/i);
      if (match) maxNumber = Math.max(maxNumber, Number(match[1]));
    }

    nextSheetNumber = maxNumber + 1;
  }

  async function connect() {
    if (folderHandle) return true;

    if (!window.showDirectoryPicker) {
      show('폴더 연결은 Chrome 또는 Edge에서 사용할 수 있습니다.', false);
      return false;
    }

    try {
      show('먼저 <strong>dekade-archive</strong> 저장소 폴더를 선택하세요.', false);
      rootHandle = await window.showDirectoryPicker({ id: 'dekade-checklist-root', mode: 'readwrite' });
      window.alert('이제 assets/checklists 안의 이 체크리스트 전용 폴더를 선택하세요. 새 폴더를 만들어도 됩니다.');
      folderHandle = await window.showDirectoryPicker({
        id: 'dekade-checklist-assets',
        mode: 'readwrite',
        startIn: rootHandle
      });
      parts = await rootHandle.resolve(folderHandle);

      if (
        !parts ||
        parts.length < 3 ||
        parts[0].toLowerCase() !== 'assets' ||
        parts[1].toLowerCase() !== 'checklists'
      ) {
        folderHandle = null;
        parts = [];
        throw Error('assets/checklists 안의 목록별 폴더를 선택하세요.');
      }

      await scanNextSheetNumber();
      show(
        '연결 완료: <code>' + parts.join('/') + '/</code> · 다음 PDF는 <strong>sheet' +
          nextSheetNumber +
          '.pdf</strong>로 저장됩니다.',
        true
      );
      return true;
    } catch (error) {
      if (error.name !== 'AbortError') show(error.message, false);
      return false;
    }
  }

  async function savePdf(file) {
    if (!file) return;

    var targetName = 'sheet' + nextSheetNumber + '.pdf';
    var path = BASE + parts.join('/') + '/' + targetName;
    $('pdf').value = path;
    $('pdf').dispatchEvent(new Event('input', { bubbles: true }));
    show('PDF path 입력 완료. 파일을 저장하는 중입니다: <code>' + path + '</code>', true);

    try {
      var handle = await folderHandle.getFileHandle(targetName, { create: true });
      var writable = await handle.createWritable();
      await writable.write(file);
      await writable.close();
      nextSheetNumber += 1;
      show(
        '<strong>' + targetName + '</strong> 저장과 PDF path 입력을 완료했습니다: <code>' +
          path +
          '</code> · 다음 파일은 <strong>sheet' +
          nextSheetNumber +
          '.pdf</strong>입니다.',
        true
      );
    } catch (error) {
      show('PDF path는 입력됐지만 파일 저장에 실패했습니다: ' + error.message, false);
    }
  }

  var style = document.createElement('style');
  style.textContent =
    '.asset-pick{display:inline-flex;margin-top:4px}.asset-pick input{height:1px;opacity:0;position:absolute;width:1px}.asset-pick button{background:#fff;border:1px solid #cbc6ca;border-radius:4px;color:#6c646b;cursor:pointer;font-size:.59rem;font-weight:750;padding:6px 8px}';
  document.head.appendChild(style);

  var wrap = document.createElement('span');
  wrap.className = 'asset-pick';
  wrap.innerHTML =
    '<input id="checklistPdfFile" type="file" accept="application/pdf"><button type="button">PDF 선택</button>';
  var input = wrap.querySelector('input');
  var button = wrap.querySelector('button');
  $('pdf').insertAdjacentElement('afterend', wrap);

  button.onclick = function () {
    if (!folderHandle) {
      show('먼저 PDF 저장 폴더 연결을 완료하세요.', false);
      return;
    }
    input.click();
  };

  input.onchange = function () {
    var file = this.files[0];
    this.value = '';
    if (file) savePdf(file);
  };

  $('connectAssets').onclick = connect;
})();
