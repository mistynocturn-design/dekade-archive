(function () {
  'use strict';

  var BASE = '/dekade-archive/assets/trpg/';
  var repoHandle = null;

  function byId(id) {
    return document.getElementById(id);
  }

  function safeFileName(name) {
    var dot = name.lastIndexOf('.');
    var ext = dot >= 0 ? name.slice(dot).toLowerCase() : '';
    var stem = dot >= 0 ? name.slice(0, dot) : name;
    stem = stem.trim().toLowerCase()
      .replace(/[^a-z0-9가-힣_-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'image';
    return stem + ext;
  }

  function generatedPath(file) {
    return BASE + safeFileName(file.name);
  }

  async function copyIntoRepo(file) {
    if (!repoHandle) return;
    var assets = await repoHandle.getDirectoryHandle('assets', { create: true });
    var trpg = await assets.getDirectoryHandle('trpg', { create: true });
    var target = await trpg.getFileHandle(safeFileName(file.name), { create: true });
    var writable = await target.createWritable();
    await writable.write(file);
    await writable.close();
  }

  async function useAsset(file, assign, existingRepoPath) {
    if (!file) return;
    var path = existingRepoPath || generatedPath(file);
    assign(path);
    try {
      if (!existingRepoPath) await copyIntoRepo(file);
      showRepoStatus(repoHandle
        ? (existingRepoPath ? 'Repo 안의 기존 이미지 경로를 그대로 입력했습니다: ' : '이미지를 assets/trpg에 복사하고 경로를 자동 입력했습니다: ') + path
        : 'Repo 경로를 자동 입력했습니다: ' + path, !!repoHandle);
    } catch (error) {
      showRepoStatus('경로는 입력했지만 파일 복사에 실패했습니다: ' + error.message, false);
    }
    ['input', 'change'].forEach(function (name) {
      document.activeElement && document.activeElement.dispatchEvent(new Event(name, { bubbles: true }));
    });
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
    input.addEventListener('change', function () {
      handler(this.files[0], '');
      this.value = '';
    });
    label.querySelector('span').addEventListener('click', async function (event) {
      if (!repoHandle || !window.showOpenFilePicker || !repoHandle.resolve) return;
      event.preventDefault();
      try {
        var handles = await window.showOpenFilePicker({
          startIn: repoHandle,
          multiple: false,
          types: [{ description: 'Images', accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif'] } }]
        });
        var handle = handles[0];
        var parts = await repoHandle.resolve(handle);
        var repoPath = parts && parts.length && parts[0].toLowerCase() === 'assets'
          ? '/dekade-archive/' + parts.join('/')
          : '';
        handler(await handle.getFile(), repoPath);
      } catch (error) {
        if (error.name !== 'AbortError') showRepoStatus(error.message, false);
      }
    });
    return label;
  }

  function normalizeVisiblePath(input) {
    var value = input.value.trim().replace(/[\\₩]+/g, '/');
    if (!value) return;
    var index = value.toLowerCase().indexOf('/assets/');
    if (index >= 0) value = value.slice(index + 1);
    if (value.toLowerCase().indexOf('assets/') === 0) {
      input.value = '/dekade-archive/' + value.replace(/^\/+/, '').replace(/\/{2,}/g, '/');
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
  chooseRepo.textContent = 'Repo 폴더 연결';
  importActions.insertBefore(chooseRepo, importActions.firstChild);

  var repoStatus = document.createElement('div');
  repoStatus.id = 'repoStatus';
  repoStatus.className = 'status';
  repoStatus.textContent = 'Repo를 연결한 뒤 내부 이미지를 고르면 기존 경로를 그대로 사용합니다. 외부 이미지는 assets/trpg에 복사됩니다.';
  importActions.parentElement.insertBefore(repoStatus, byId('importStatus'));

  chooseRepo.addEventListener('click', async function () {
    if (!window.showDirectoryPicker) {
      showRepoStatus('이 브라우저는 폴더 연결을 지원하지 않습니다. 경로 자동 변환은 그대로 사용할 수 있습니다.', false);
      return;
    }
    try {
      repoHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
      showRepoStatus('Repo 폴더가 연결되었습니다. 이제 고른 이미지는 assets/trpg에 자동 복사됩니다.', true);
    } catch (error) {
      if (error.name !== 'AbortError') showRepoStatus(error.message, false);
    }
  });

  var cover = byId('cover');
  cover.insertAdjacentElement('afterend', filePicker('coverFile', '표지 이미지 선택', function (file, repoPath) {
    useAsset(file, function (path) {
      cover.value = path;
      cover.dispatchEvent(new Event('input', { bubbles: true }));
    }, repoPath);
  }));
  enhancePathInput(cover);

  var image = byId('editImage');
  image.insertAdjacentElement('afterend', filePicker('sceneFile', '삽입 이미지 선택', function (file, repoPath) {
    useAsset(file, function (path) {
      image.value = path;
      image.dispatchEvent(new Event('input', { bubbles: true }));
    }, repoPath);
  }));
  enhancePathInput(image);

  function addAvatarPickers() {
    document.querySelectorAll('.author-row').forEach(function (row) {
      if (row.querySelector('.avatar-file-pick')) return;
      var avatar = row.querySelector('[data-field="avatar"]');
      if (!avatar) return;
      var picker = filePicker('avatar-' + Math.random().toString(36).slice(2), '프로필 선택', function (file, repoPath) {
        useAsset(file, function (path) {
          avatar.value = path;
          avatar.dispatchEvent(new Event('input', { bubbles: true }));
        }, repoPath);
      });
      picker.classList.add('avatar-file-pick');
      avatar.insertAdjacentElement('afterend', picker);
      enhancePathInput(avatar);
    });
  }

  new MutationObserver(addAvatarPickers).observe(byId('authorList'), { childList: true });
  addAvatarPickers();
})();
