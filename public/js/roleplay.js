(function () {
  'use strict';

  var app = document.querySelector('[data-roleplay-app]');
  if (!app) return;

  var apiUrl = app.getAttribute('data-api-url');
  var requiredApiVersion = '2026-06-20.3';
  var storageKey = 'dekade-roleplay-passcode';
  var draftStorageKey = 'dekade-roleplay-reply-drafts';
  var readStorageKey = 'dekade-roleplay-read-replies';
  var authors = {};
  var authorOptions = '';
  var threadList = app.querySelector('[data-roleplay-threads]');
  var statusLine = app.querySelector('[data-roleplay-status]');
  var compose = app.querySelector('[data-roleplay-compose]');
  var keyForm = app.querySelector('[data-roleplay-key-form]');
  var passcodeInput = app.querySelector('[data-roleplay-passcode]');
  var refreshTimer = null;
  var lastThreadSignature = '';
  var replyDrafts = readReplyDrafts();
  var readReplies = readReplyState();

  function readReplyState() {
    try {
      return JSON.parse(localStorage.getItem(readStorageKey) || '{}') || {};
    } catch (error) {
      return {};
    }
  }

  function markReplyRead(threadId, messageId) {
    if (!threadId || !messageId) return;
    readReplies[threadId] = messageId;
    localStorage.setItem(readStorageKey, JSON.stringify(readReplies));
    var thread = threadList.querySelector('[data-thread-id="' + threadId + '"]');
    if (thread) {
      var dot = thread.querySelector('.roleplay-unread-dot');
      if (dot) dot.remove();
    }
  }

  function readReplyDrafts() {
    try {
      return JSON.parse(localStorage.getItem(draftStorageKey) || '{}') || {};
    } catch (error) {
      return {};
    }
  }

  function saveReplyDraft(threadId, form) {
    replyDrafts[threadId] = {
      author_id: form.elements.author_id.value,
      content: form.elements.content.value
    };
    if (!replyDrafts[threadId].content) delete replyDrafts[threadId];
    localStorage.setItem(draftStorageKey, JSON.stringify(replyDrafts));
  }

  function clearReplyDraft(threadId) {
    delete replyDrafts[threadId];
    localStorage.setItem(draftStorageKey, JSON.stringify(replyDrafts));
  }

  function hasActiveReplyDraft() {
    var active = document.activeElement && document.activeElement.closest
      ? document.activeElement.closest('[data-roleplay-reply-form]')
      : null;
    if (active) return true;
    return Array.prototype.some.call(threadList.querySelectorAll('[data-roleplay-reply-form] textarea'), function (textarea) {
      return Boolean(textarea.value.trim());
    });
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function safeColor(value, fallback) {
    return /^#[0-9a-f]{3,8}$/i.test(String(value || '')) ? value : fallback;
  }

  function setStatus(message, error) {
    statusLine.textContent = message || '';
    statusLine.classList.toggle('error', Boolean(error));
    statusLine.hidden = !message;
  }

  function formatDate(value) {
    if (!value) return '';
    var date = new Date(value);
    if (isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat('ko-KR', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false
    }).format(date);
  }

  async function readJson(action, params) {
    var url = new URL(apiUrl);
    url.searchParams.set('action', action);
    Object.keys(params || {}).forEach(function (key) {
      if (params[key] != null) url.searchParams.set(key, params[key]);
    });
    var response = await fetch(url.toString(), { cache: 'no-store', redirect: 'follow' });
    if (!response.ok) throw new Error('Server request failed.');
    var data = await response.json();
    if (!data.ok) throw new Error(data.error || 'Server request failed.');
    return data;
  }

  async function writeJson(payload) {
    var passcode = localStorage.getItem(storageKey) || '';
    if (!passcode) throw new Error('Access key를 먼저 저장해주세요.');
    payload.passcode = passcode;
    var response = await fetch(apiUrl, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error('Server request failed.');
    var data = await response.json();
    if (!data.ok) throw new Error(data.error || 'Server request failed.');
    return data.data;
  }

  async function loadAuthors() {
    var data = await readJson('authors');
    if (data.api_version !== requiredApiVersion) throw new Error('Apps Script 최신 버전을 재배포해주세요.');
    authors = {};
    data.authors.forEach(function (author) { authors[author.author_id] = author; });
    authorOptions = data.authors.map(function (author) {
      return '<option value="' + escapeHtml(author.author_id) + '">' + escapeHtml(author.name) + '</option>';
    }).join('');
    app.querySelectorAll('[data-roleplay-author]').forEach(function (select) {
      select.innerHTML = authorOptions;
    });
  }

  function authorStyle(author) {
    return '--roleplay-bg:' + safeColor(author && author.background_color, '#fafafa') +
      ';--roleplay-text:' + safeColor(author && author.text_color, '#333333') +
      ';--roleplay-accent:' + safeColor(author && author.accent_color, '#dedede');
  }

  function imageGrid(images) {
    if (!images || !images.length) return '';
    var count = Math.min(images.length, 4);
    return '<div class="roleplay-image-grid count-' + count + '">' + images.slice(0, 4).map(function (url) {
      var safeUrl = escapeHtml(url);
      return '<button type="button" data-roleplay-image="' + safeUrl + '"><img src="' + safeUrl + '" alt=""></button>';
    }).join('') + '</div>';
  }

  function messageHtml(message, root) {
    if (!message) return '';
    var author = authors[message.author_id] || { name: message.author_id };
    var avatar = author.profile_image
      ? '<img src="' + escapeHtml(author.profile_image) + '" alt="">'
      : '<span>' + escapeHtml((author.name || '?').slice(0, 1)) + '</span>';
    return '<article class="roleplay-message' + (root ? ' root' : '') + '" style="' + authorStyle(author) + '">' +
      '<header><span class="roleplay-avatar">' + avatar + '</span><strong>' + escapeHtml(author.name || message.author_id) +
      '</strong><time>' + escapeHtml(formatDate(message.created_at)) + '</time>' +
      '<span class="roleplay-message-actions"><button type="button" data-roleplay-edit-message aria-label="Edit message" title="Edit message">✎</button>' +
      '<button type="button" data-roleplay-delete-message data-root-message="' + (root ? 'true' : 'false') + '" aria-label="Delete message" title="Delete message">×</button></span></header>' +
      '<div class="roleplay-message-body" data-message-id="' + escapeHtml(message.message_id) + '"><div class="roleplay-message-text">' + escapeHtml(message.content) + '</div>' +
      imageGrid(message.image_urls) + '</div></article>';
  }

  function threadHtml(thread) {
    var root = thread.root_message;
    var lastAuthor = authors[thread.last_reply_author_id] || {};
    var unread = thread.last_reply_message_id && readReplies[thread.thread_id] !== thread.last_reply_message_id;
    var unreadDot = unread ? '<span class="roleplay-unread-dot" style="--roleplay-notice:' +
      safeColor(lastAuthor.accent_color, '#afa4cf') + '" title="New reply" aria-label="New reply"></span>' : '';
    var lastPage = Math.max(1, Math.ceil(Number(thread.reply_count || 0) / 10));
    return '<article class="roleplay-thread" data-thread-id="' + escapeHtml(thread.thread_id) + '">' +
      '<header class="roleplay-thread-header"><div><span class="roleplay-category">' + escapeHtml(thread.category || 'BASIC') +
      '</span><h2>' + escapeHtml(thread.title) + unreadDot + '</h2></div>' +
      '<button class="roleplay-complete-button" type="button" data-roleplay-complete title="Complete thread" aria-label="Complete thread">✓</button></header>' +
      messageHtml(root, true) +
      '<details class="roleplay-replies" data-roleplay-replies data-last-page="' + lastPage + '" data-last-reply-id="' + escapeHtml(thread.last_reply_message_id || '') + '">' +
      '<summary>Replies <span>' + Number(thread.reply_count || 0) + '</span></summary>' +
      '<div class="roleplay-reply-area" data-roleplay-reply-area><p class="roleplay-loading">Loading...</p></div>' +
      '</details></article>';
  }

  function openThreadState() {
    return Array.prototype.slice.call(threadList.querySelectorAll('[data-roleplay-replies][open]')).map(function (details) {
      var thread = details.closest('[data-thread-id]');
      return { id: thread.getAttribute('data-thread-id'), page: Number(details.getAttribute('data-page') || 1) };
    });
  }

  async function loadThreads(quiet) {
    var openThreads = openThreadState();
    if (!quiet) setStatus('Loading...');
    try {
      var data = await readJson('threads', { status: 'active' });
      if (data.api_version !== requiredApiVersion) throw new Error('Apps Script 최신 버전을 재배포해주세요.');
      var signature = JSON.stringify(data.threads.map(function (thread) {
        return [thread.thread_id, thread.updated_at, thread.reply_count, thread.last_reply_message_id];
      }));
      if (signature === lastThreadSignature && threadList.children.length) {
        setStatus('');
        return;
      }
      lastThreadSignature = signature;
      threadList.innerHTML = data.threads.length
        ? data.threads.map(threadHtml).join('')
        : '<p class="roleplay-empty">No active threads.</p>';
      attachReplyToggles();
      setStatus('');
      openThreads.forEach(function (saved) {
        var thread = threadList.querySelector('[data-thread-id="' + saved.id + '"]');
        if (!thread) return;
        var details = thread.querySelector('[data-roleplay-replies]');
        details.setAttribute('data-loaded', 'true');
        details.open = true;
        loadReplies(saved.id, saved.page, details);
      });
    } catch (error) {
      setStatus(error.message, true);
    }
  }

  function attachReplyToggles() {
    threadList.querySelectorAll('[data-roleplay-replies]').forEach(function (details) {
      details.addEventListener('toggle', function () {
        if (!details.open || details.getAttribute('data-loaded') === 'true') return;
        var threadId = details.closest('[data-thread-id]').getAttribute('data-thread-id');
        loadReplies(threadId, Number(details.getAttribute('data-last-page') || 1), details);
      });
    });
  }

  async function loadReplies(threadId, page, details) {
    var area = details.querySelector('[data-roleplay-reply-area]');
    area.innerHTML = '<p class="roleplay-loading">Loading...</p>';
    try {
      var data = await readJson('messages', { thread_id: threadId, page: page });
      if (data.api_version !== requiredApiVersion) throw new Error('Apps Script 최신 버전을 재배포해주세요.');
      details.setAttribute('data-loaded', 'true');
      details.setAttribute('data-page', data.page);
      var messages = data.messages.map(function (message) { return messageHtml(message, false); }).join('');
      var pages = '';
      if (data.total_pages > 1) {
        pages = '<nav class="roleplay-pagination" aria-label="Reply pages">' + Array.from({ length: data.total_pages }, function (_, index) {
          var number = index + 1;
          return '<button type="button" data-roleplay-page="' + number + '"' + (number === data.page ? ' class="active"' : '') + '>' + number + '</button>';
        }).join('') + '</nav>';
      }
      var rootId = data.root_message ? data.root_message.message_id : '';
      var draft = replyDrafts[threadId] || {};
      area.innerHTML = '<div class="roleplay-reply-list">' + (messages || '<p class="roleplay-empty">No replies yet.</p>') + '</div>' + pages +
        '<form class="roleplay-reply-form" data-roleplay-reply-form data-parent-id="' + escapeHtml(rootId) + '">' +
        '<div class="roleplay-reply-controls"><select name="author_id" data-roleplay-author required>' + authorOptions + '</select>' +
        '<label class="roleplay-file-button" title="Attach images">＋<input name="images" type="file" accept="image/*" multiple></label></div>' +
        '<textarea name="content" rows="3" placeholder="Reply" required>' + escapeHtml(draft.content || '') + '</textarea>' +
        '<button type="submit">Post</button></form>';
      if (draft.author_id) area.querySelector('[name="author_id"]').value = draft.author_id;
      if (data.page === data.total_pages && data.messages.length) {
        markReplyRead(threadId, data.messages[data.messages.length - 1].message_id);
      }
    } catch (error) {
      area.innerHTML = '<p class="roleplay-status error">' + escapeHtml(error.message) + '</p>';
    }
  }

  function imageToBlob(file, maxSize, quality) {
    return new Promise(function (resolve, reject) {
      var image = new Image();
      var objectUrl = URL.createObjectURL(file);
      image.onload = function () {
        var scale = Math.min(1, maxSize / Math.max(image.naturalWidth, image.naturalHeight));
        var canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(objectUrl);
        canvas.toBlob(function (blob) {
          if (blob) resolve(blob); else reject(new Error('Image conversion failed.'));
        }, 'image/webp', quality);
      };
      image.onerror = function () {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Image could not be opened.'));
      };
      image.src = objectUrl;
    });
  }

  function blobToBase64(blob) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result).split(',')[1]); };
      reader.onerror = function () { reject(new Error('Image could not be read.')); };
      reader.readAsDataURL(blob);
    });
  }

  async function uploadImages(fileList) {
    var files = Array.prototype.slice.call(fileList || []);
    if (files.length > 4) throw new Error('Images are limited to 4 per post.');
    var urls = [];
    for (var i = 0; i < files.length; i += 1) {
      setStatus('Uploading image ' + (i + 1) + ' / ' + files.length + '...');
      var blob = await imageToBlob(files[i], 1600, 0.82);
      if (blob.size > 2 * 1024 * 1024) blob = await imageToBlob(files[i], 1100, 0.72);
      if (blob.size > 2 * 1024 * 1024) throw new Error('Image is too large after compression.');
      var result = await writeJson({
        action: 'upload_image',
        file: {
          name: files[i].name.replace(/\.[^.]+$/, '') + '.webp',
          mime_type: 'image/webp',
          base64: await blobToBase64(blob)
        }
      });
      urls.push(result.url);
    }
    return urls;
  }

  app.querySelector('[data-roleplay-new]').addEventListener('click', function () {
    compose.hidden = !compose.hidden;
    if (!compose.hidden) compose.querySelector('input[name="title"]').focus();
  });

  app.querySelector('[data-roleplay-compose-close]').addEventListener('click', function () { compose.hidden = true; });
  app.querySelector('[data-roleplay-refresh]').addEventListener('click', function () { loadThreads(false); });
  app.querySelector('[data-roleplay-key]').addEventListener('click', function () {
    keyForm.hidden = !keyForm.hidden;
    if (!keyForm.hidden) {
      passcodeInput.value = localStorage.getItem(storageKey) || '';
      passcodeInput.focus();
    }
  });

  keyForm.addEventListener('submit', function (event) {
    event.preventDefault();
    localStorage.setItem(storageKey, passcodeInput.value);
    keyForm.hidden = true;
    setStatus('Access key saved on this browser.');
  });

  compose.addEventListener('submit', async function (event) {
    event.preventDefault();
    var button = compose.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      var form = new FormData(compose);
      var imageUrls = await uploadImages(compose.elements.images.files);
      await writeJson({
        action: 'create_thread',
        title: form.get('title'),
        category: form.get('category'),
        author_id: form.get('author_id'),
        content: form.get('content'),
        image_urls: imageUrls
      });
      compose.reset();
      compose.querySelector('[data-roleplay-author]').innerHTML = authorOptions;
      compose.hidden = true;
      await loadThreads(false);
    } catch (error) {
      setStatus(error.message, true);
    } finally {
      button.disabled = false;
    }
  });

  threadList.addEventListener('submit', async function (event) {
    var editForm = event.target.closest('[data-roleplay-edit-form]');
    if (editForm) {
      event.preventDefault();
      var editButton = editForm.querySelector('button[type="submit"]');
      editButton.disabled = true;
      try {
        await writeJson({
          action: 'update_message',
          message_id: editForm.getAttribute('data-message-id'),
          content: editForm.elements.content.value
        });
        lastThreadSignature = '';
        await loadThreads(true);
      } catch (error) {
        editButton.disabled = false;
        setStatus(error.message, true);
      }
      return;
    }
    var form = event.target.closest('[data-roleplay-reply-form]');
    if (!form) return;
    event.preventDefault();
    var thread = form.closest('[data-thread-id]');
    var details = thread.querySelector('[data-roleplay-replies]');
    var button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      var data = new FormData(form);
      var imageUrls = await uploadImages(form.elements.images.files);
      var posted = await writeJson({
        action: 'add_message',
        thread_id: thread.getAttribute('data-thread-id'),
        parent_id: form.getAttribute('data-parent-id'),
        author_id: data.get('author_id'),
        content: data.get('content'),
        image_urls: imageUrls
      });
      markReplyRead(thread.getAttribute('data-thread-id'), posted.message_id);
      clearReplyDraft(thread.getAttribute('data-thread-id'));
      lastThreadSignature = '';
      await loadThreads(true);
    } catch (error) {
      setStatus(error.message, true);
    } finally {
      button.disabled = false;
    }
  });

  threadList.addEventListener('input', function (event) {
    var form = event.target.closest('[data-roleplay-reply-form]');
    if (!form) return;
    saveReplyDraft(form.closest('[data-thread-id]').getAttribute('data-thread-id'), form);
  });

  threadList.addEventListener('change', function (event) {
    var form = event.target.closest('[data-roleplay-reply-form]');
    if (!form) return;
    saveReplyDraft(form.closest('[data-thread-id]').getAttribute('data-thread-id'), form);
  });

  threadList.addEventListener('click', async function (event) {
    var editMessageButton = event.target.closest('[data-roleplay-edit-message]');
    if (editMessageButton) {
      var message = editMessageButton.closest('.roleplay-message');
      var body = message.querySelector('.roleplay-message-body');
      var text = body.querySelector('.roleplay-message-text');
      if (body.querySelector('[data-roleplay-edit-form]')) return;
      text.hidden = true;
      var editForm = document.createElement('form');
      editForm.className = 'roleplay-edit-form';
      editForm.setAttribute('data-roleplay-edit-form', '');
      editForm.setAttribute('data-message-id', body.getAttribute('data-message-id'));
      editForm.innerHTML = '<textarea name="content" rows="4" required>' + escapeHtml(text.textContent) + '</textarea>' +
        '<div><button type="button" data-roleplay-edit-cancel>Cancel</button><button type="submit">Save</button></div>';
      body.insertBefore(editForm, text.nextSibling);
      editForm.elements.content.focus();
      return;
    }
    var cancelEditButton = event.target.closest('[data-roleplay-edit-cancel]');
    if (cancelEditButton) {
      var cancelForm = cancelEditButton.closest('[data-roleplay-edit-form]');
      cancelForm.parentNode.querySelector('.roleplay-message-text').hidden = false;
      cancelForm.remove();
      return;
    }
    var deleteMessageButton = event.target.closest('[data-roleplay-delete-message]');
    if (deleteMessageButton) {
      var deleteThread = deleteMessageButton.getAttribute('data-root-message') === 'true';
      var deleteContainer = deleteMessageButton.closest('[data-thread-id]');
      var deleteBody = deleteMessageButton.closest('.roleplay-message').querySelector('.roleplay-message-body');
      var question = deleteThread ? '원글과 타래 전체를 삭제할까요?' : '이 덧글을 삭제할까요?';
      if (!window.confirm(question)) return;
      deleteMessageButton.disabled = true;
      try {
        if (deleteThread) {
          await writeJson({ action: 'delete_thread', thread_id: deleteContainer.getAttribute('data-thread-id') });
        } else {
          await writeJson({ action: 'delete_message', message_id: deleteBody.getAttribute('data-message-id') });
        }
        lastThreadSignature = '';
        await loadThreads(true);
      } catch (error) {
        deleteMessageButton.disabled = false;
        setStatus(error.message, true);
      }
      return;
    }
    var pageButton = event.target.closest('[data-roleplay-page]');
    if (pageButton) {
      var details = pageButton.closest('[data-roleplay-replies]');
      var threadId = pageButton.closest('[data-thread-id]').getAttribute('data-thread-id');
      loadReplies(threadId, Number(pageButton.getAttribute('data-roleplay-page')), details);
      return;
    }
    var completeButton = event.target.closest('[data-roleplay-complete]');
    if (completeButton) {
      if (!window.confirm('이 타래를 완료 상태로 옮길까요?')) return;
      var thread = completeButton.closest('[data-thread-id]');
      completeButton.disabled = true;
      try {
        await writeJson({ action: 'set_thread_status', thread_id: thread.getAttribute('data-thread-id'), status: 'completed' });
        lastThreadSignature = '';
        await loadThreads(false);
      } catch (error) {
        completeButton.disabled = false;
        setStatus(error.message, true);
      }
    }
  });

  var tabs = Array.prototype.slice.call(app.querySelectorAll('[data-roleplay-tab]'));
  var panels = Array.prototype.slice.call(app.querySelectorAll('[data-roleplay-panel]'));
  var tabBar = app.querySelector('.roleplay-tabs');
  var indicator = app.querySelector('.roleplay-tab-indicator');

  function moveIndicator(tab) {
    var tabRect = tab.getBoundingClientRect();
    var barRect = tabBar.getBoundingClientRect();
    indicator.style.width = tabRect.width + 'px';
    indicator.style.transform = 'translateX(' + (tabRect.left - barRect.left + tabBar.scrollLeft) + 'px)';
  }

  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      var id = tab.getAttribute('data-roleplay-tab');
      tabs.forEach(function (item) { item.classList.toggle('active', item === tab); });
      panels.forEach(function (panel) { panel.classList.toggle('active', panel.getAttribute('data-roleplay-panel') === id); });
      moveIndicator(tab);
    });
  });

  var modal = app.querySelector('[data-roleplay-image-modal]');
  var modalImage = modal.querySelector('img');
  app.addEventListener('click', function (event) {
    var imageButton = event.target.closest('[data-roleplay-image]');
    if (imageButton) {
      modalImage.src = imageButton.getAttribute('data-roleplay-image');
      modal.hidden = false;
      modal.setAttribute('aria-hidden', 'false');
      document.body.classList.add('twitter-modal-open');
    }
    if (event.target === modal || event.target.closest('[data-roleplay-image-close]')) {
      modal.hidden = true;
      modal.setAttribute('aria-hidden', 'true');
      modalImage.removeAttribute('src');
      document.body.classList.remove('twitter-modal-open');
    }
  });

  window.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && !modal.hidden) app.querySelector('[data-roleplay-image-close]').click();
  });
  window.addEventListener('resize', function () {
    window.requestAnimationFrame(function () { moveIndicator(app.querySelector('[data-roleplay-tab].active')); });
  });
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) loadThreads(true);
  });

  passcodeInput.value = localStorage.getItem(storageKey) || '';
  loadAuthors().then(function () {
    return loadThreads(false);
  }).then(function () {
    moveIndicator(app.querySelector('[data-roleplay-tab].active'));
    refreshTimer = window.setInterval(function () {
      if (!document.hidden && !hasActiveReplyDraft()) loadThreads(true);
    }, 60000);
  }).catch(function (error) {
    setStatus(error.message, true);
  });
})();
