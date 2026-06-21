(function () {
  'use strict';

  var SITE_BASE = '/dekade-archive/';
  var repoRootHandle = null;
  var assetFolderHandle = null;
  var assetFolderParts = [];
  var nextImageNumber = 1;
  var localPreviewUrls = {};

  function byId(id) { return document.getElementById(id); }

  function extensionOf(file) {
    var match = String(file.name || '').toLowerCase().match(/\.(png|jpe?g|gif|webp|avif|svg|bmp)$/);
    if (match) return '.' + match[1];
    var types = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif', 'image/webp': '.webp', 'image/avif': '.avif', 'image/svg+xml': '.svg', 'image/bmp': '.bmp' };
    return types[file.type] || '.png';
  }

  function folderWebBase() { return SITE_BASE + assetFolderParts.join('/') + '/'; }

  function numberedName(file) {
    var name = String(nextImageNumber).padStart(2, '0') + extensionOf(file);
    nextImageNumber += 1;
    return name;
  }

  async function scanNextNumber() {
    var max = 0;
    for await (var entry of assetFolderHandle.values()) {
      if (entry.kind !== 'file') continue;
      var match = entry.name.match(/^(\d+)\.[^.]+$/);
      if (match) max = Math.max(max, Number(match[1]));
    }
    nextImageNumber = max + 1;
  }

  async function copyIntoFolder(file, targetName) {
    var target = await assetFolderHandle.getFileHandle(targetName, { create: true });
    var writable = await target.createWritable();
    await writable.write(file);
    await writable.close();
  }

  function rememberLocalPreview(path, file) {
    if (localPreviewUrls[path]) URL.revokeObjectURL(localPreviewUrls[path]);
    localPreviewUrls[path] = URL.createObjectURL(file);
    applyLocalPreviews();
  }

  function applyLocalPreviews() {
    var preview = byId('preview');
    if (!preview) return;
    preview.querySelectorAll('img').forEach(function (image) {
      var repoPath = image.dataset.repoPath || image.getAttribute('src');
      if (!localPreviewUrls[repoPath]) return;
      image.dataset.repoPath = repoPath;
      image.src = localPreviewUrls[repoPath];
    });
  }

  async function useAsset(file, assign, existingRepoPath) {
    if (!file) return;
    if (!assetFolderHandle) {
      showRepoStatus('먼저 ‘이미지 저장 폴더 연결’을 눌러 Repo와 세션 이미지 폴더를 연결해주세요.', false);
      return;
    }
    var targetName = existingRepoPath ? '' : numberedName(file);
    var path = existingRepoPath || folderWebBase() + targetName;
    rememberLocalPreview(path, file);
    assign(path);
    try {
      if (!existingRepoPath) await copyIntoFolder(file, targetName);
      showRepoStatus(existingRepoPath ? '기존 이미지를 불러왔습니다: ' + path : '이미지를 ' + targetName + ' 이름으로 저장했습니다: ' + path, true);
    } catch (error) {
      showRepoStatus('경로는 입력했지만 파일 저장에 실패했습니다: ' + error.message, false);
    }
  }

  function showRepoStatus(text, ready) {
    var status = byId('repoStatus');
    status.textContent = text;
    status.classList.toggle('repo-ready', !!ready);
  }

  function filePicker(id, text, handler) {
    var label = document.createElement('label');
    label.className = 'asset-pick';
    label.innerHTML = '<input id="' + id + '" type="file" accept="image/*"><span>' + text + '</span>';
    var input = label.querySelector('input');
    input.addEventListener('change', function () { handler(this.files[0], ''); this.value = ''; });
    label.querySelector('span').addEventListener('click', async function (event) {
      if (!assetFolderHandle || !window.showOpenFilePicker || !assetFolderHandle.resolve) return;
      event.preventDefault();
      try {
        var handles = await window.showOpenFilePicker({ startIn: assetFolderHandle, multiple: false, types: [{ description: 'Images', accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.svg', '.bmp'] } }] });
        var handle = handles[0];
        var parts = await assetFolderHandle.resolve(handle);
        var existingPath = parts && parts.length ? folderWebBase() + parts.join('/') : '';
        handler(await handle.getFile(), existingPath);
      } catch (error) { if (error.name !== 'AbortError') showRepoStatus(error.message, false); }
    });
    return label;
  }

  function normalizeVisiblePath(input) {
    var value = input.value.trim().replace(/[\\₩]+/g, '/');
    if (!value) return;
    var index = value.toLowerCase().indexOf('/assets/');
    if (index >= 0) value = value.slice(index + 1);
    if (value.toLowerCase().indexOf('assets/') === 0) {
      input.value = SITE_BASE + value.replace(/^\/+/, '').replace(/\/{2,}/g, '/');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  function enhancePathInput(input) {
    input.addEventListener('change', function () { normalizeVisiblePath(input); });
    input.addEventListener('blur', function () { normalizeVisiblePath(input); });
  }

  var style = document.createElement('style');
  style.textContent = '.asset-pick{display:inline-flex;margin-top:4px;overflow:hidden;position:relative}.asset-pick input{height:1px;opacity:0;position:absolute;width:1px}.asset-pick span{background:#fff;border:1px solid #cbc7ce;border-radius:4px;color:#68636c;cursor:pointer;font-size:.61rem;font-weight:750;padding:7px 8px;white-space:nowrap}.repo-ready{color:#4f765c!important}';
  document.head.appendChild(style);

  var importActions = byId('saveProject').parentElement;
  var chooseRepo = document.createElement('button');
  chooseRepo.type = 'button';
  chooseRepo.className = 'secondary';
  chooseRepo.textContent = '이미지 저장 폴더 연결';
  importActions.insertBefore(chooseRepo, importActions.firstChild);
  var repoStatus = document.createElement('div');
  repoStatus.id = 'repoStatus';
  repoStatus.className = 'status';
  repoStatus.textContent = '① dekade-archive Repo를 선택하고 ② assets/trpg 안의 세션 이미지 폴더를 선택합니다.';
  importActions.parentElement.insertBefore(repoStatus, byId('importStatus'));

  chooseRepo.addEventListener('click', async function () {
    if (!window.showDirectoryPicker) { showRepoStatus('이 브라우저는 폴더 연결을 지원하지 않습니다. Chrome 또는 Edge를 사용해주세요.', false); return; }
    try {
      showRepoStatus('먼저 dekade-archive Repo 폴더를 선택하세요.', false);
      repoRootHandle = await window.showDirectoryPicker({ id: 'dekade-repo-root', mode: 'readwrite' });
      window.alert('이제 assets/trpg 안에서 이번 세션의 이미지 저장 폴더를 선택하세요. 새 폴더를 만들어 선택해도 됩니다.');
      assetFolderHandle = await window.showDirectoryPicker({ id: 'dekade-trpg-assets', mode: 'readwrite', startIn: repoRootHandle });
      assetFolderParts = await repoRootHandle.resolve(assetFolderHandle);
      if (!assetFolderParts || assetFolderParts.length < 3 || assetFolderParts[0].toLowerCase() !== 'assets' || assetFolderParts[1].toLowerCase() !== 'trpg') {
        assetFolderHandle = null; assetFolderParts = [];
        throw new Error('두 번째 단계에서는 선택한 Repo의 assets/trpg 안에 있는 세션 폴더를 선택해주세요.');
      }
      await scanNextNumber();
      showRepoStatus('연결 완료: ' + assetFolderParts.join('/') + '/ — 다음 새 이미지는 ' + String(nextImageNumber).padStart(2, '0') + '부터 저장됩니다.', true);
    } catch (error) { if (error.name !== 'AbortError') showRepoStatus(error.message, false); }
  });

  var cover = byId('cover');
  cover.insertAdjacentElement('afterend', filePicker('coverFile', '표지 이미지 선택', function (file, repoPath) { useAsset(file, function (path) { cover.value = path; cover.dispatchEvent(new Event('input', { bubbles: true })); }, repoPath); }));
  enhancePathInput(cover);
  var image = byId('editImage');
  image.insertAdjacentElement('afterend', filePicker('sceneFile', '삽입 이미지 선택', function (file, repoPath) { useAsset(file, function (path) { image.value = path; image.dispatchEvent(new Event('input', { bubbles: true })); }, repoPath); }));
  enhancePathInput(image);

  function addAvatarPickers() {
    document.querySelectorAll('.author-row').forEach(function (row) {
      if (row.querySelector('.avatar-file-pick')) return;
      var avatar = row.querySelector('[data-field="avatar"]');
      if (!avatar) return;
      var picker = filePicker('avatar-' + Math.random().toString(36).slice(2), '프로필 선택', function (file, repoPath) { useAsset(file, function (path) { avatar.value = path; avatar.dispatchEvent(new Event('input', { bubbles: true })); }, repoPath); });
      picker.classList.add('avatar-file-pick');
      avatar.insertAdjacentElement('afterend', picker);
      enhancePathInput(avatar);
    });
  }

  new MutationObserver(addAvatarPickers).observe(byId('authorList'), { childList: true });
  new MutationObserver(applyLocalPreviews).observe(byId('preview'), { childList: true, subtree: true });
  addAvatarPickers();
})();
