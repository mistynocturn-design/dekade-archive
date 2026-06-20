var ROLEPLAY = {
  API_VERSION: '2026-06-20.3',
  AUTHORS_SHEET: 'Authors',
  THREADS_SHEET: 'Threads',
  MESSAGES_SHEET: 'Messages',
  PAGE_SIZE: 10,
  MAX_IMAGE_BYTES: 2 * 1024 * 1024,
  WRITE_PASSCODE_PROPERTY: 'ROLEPLAY_PASSCODE',
  IMAGE_FOLDER_PROPERTY: 'ROLEPLAY_IMAGE_FOLDER_ID'
};

function doGet(e) {
  try {
    var action = String((e && e.parameter && e.parameter.action) || 'health').toLowerCase();

    if (action === 'health') {
      return json_({ ok: true, service: 'dekade-roleplay', api_version: ROLEPLAY.API_VERSION, time: new Date() });
    }
    if (action === 'authors') {
      return json_({ ok: true, api_version: ROLEPLAY.API_VERSION, authors: getAuthors_() });
    }
    if (action === 'threads') {
      var status = String(e.parameter.status || 'active').toLowerCase();
      return json_({ ok: true, api_version: ROLEPLAY.API_VERSION, threads: getThreads_(status) });
    }
    if (action === 'messages') {
      var messageResult = getMessages_(required_(e.parameter.thread_id, 'thread_id'), e.parameter.page);
      messageResult.api_version = ROLEPLAY.API_VERSION;
      return json_(messageResult);
    }
    if (action === 'export') {
      return json_({ ok: true, api_version: ROLEPLAY.API_VERSION, data: exportThread_(required_(e.parameter.thread_id, 'thread_id')) });
    }

    throw new Error('Unknown GET action: ' + action);
  } catch (error) {
    return errorJson_(error);
  }
}

function doPost(e) {
  try {
    var body = parseBody_(e);
    checkPasscode_(body.passcode);
    var action = String(body.action || '').toLowerCase();
    var result;

    if (action === 'create_thread') result = withLock_(function () { return createThread_(body); });
    else if (action === 'add_message') result = withLock_(function () { return addMessage_(body); });
    else if (action === 'update_message') result = withLock_(function () { return updateMessage_(body); });
    else if (action === 'set_thread_status') result = withLock_(function () { return setThreadStatus_(body); });
    else if (action === 'delete_message') result = withLock_(function () { return deleteMessage_(body); });
    else if (action === 'delete_thread') result = withLock_(function () { return deleteThread_(body); });
    else if (action === 'upload_image') result = uploadImage_(body);
    else throw new Error('Unknown POST action: ' + action);

    return json_({ ok: true, data: result });
  } catch (error) {
    return errorJson_(error);
  }
}

function getAuthors_() {
  return readObjects_(ROLEPLAY.AUTHORS_SHEET)
    .filter(function (author) { return truthy_(author.active); })
    .sort(function (a, b) { return number_(a.order) - number_(b.order); })
    .map(function (author) {
      return {
        author_id: String(author.author_id || ''),
        name: String(author.name || ''),
        profile_image: String(author.profile_image || ''),
        background_color: String(author.background_color || ''),
        text_color: String(author.text_color || ''),
        accent_color: String(author.accent_color || ''),
        order: number_(author.order)
      };
    });
}

function getThreads_(status) {
  var threads = readObjects_(ROLEPLAY.THREADS_SHEET);
  var messages = readObjects_(ROLEPLAY.MESSAGES_SHEET).filter(function (message) {
    return !truthy_(message.deleted);
  });
  var roots = {};
  var replyCounts = {};
  var lastReplies = {};

  messages.forEach(function (message) {
    var threadId = String(message.thread_id || '');
    if (!threadId) return;
    if (!String(message.parent_id || '')) {
      if (!roots[threadId]) roots[threadId] = publicMessage_(message);
    } else {
      replyCounts[threadId] = (replyCounts[threadId] || 0) + 1;
      if (!lastReplies[threadId] || dateNumber_(message.created_at) >= dateNumber_(lastReplies[threadId].created_at)) {
        lastReplies[threadId] = message;
      }
    }
  });

  return threads
    .filter(function (thread) {
      return status === 'all' || String(thread.status || '').toLowerCase() === status;
    })
    .map(function (thread) {
      var item = publicThread_(thread);
      item.root_message = roots[item.thread_id] || null;
      item.reply_count = replyCounts[item.thread_id] || 0;
      item.last_reply_message_id = lastReplies[item.thread_id] ? String(lastReplies[item.thread_id].message_id || '') : '';
      item.last_reply_author_id = lastReplies[item.thread_id] ? String(lastReplies[item.thread_id].author_id || '') : '';
      return item;
    })
    .sort(function (a, b) {
      return dateNumber_(b.created_at) - dateNumber_(a.created_at);
    });
}

function getMessages_(threadId, requestedPage) {
  findThread_(threadId);
  var all = readObjects_(ROLEPLAY.MESSAGES_SHEET)
    .filter(function (message) {
      return String(message.thread_id || '') === threadId && !truthy_(message.deleted);
    })
    .sort(function (a, b) { return dateNumber_(a.created_at) - dateNumber_(b.created_at); });
  var root = null;
  var replies = [];

  all.forEach(function (message) {
    if (!String(message.parent_id || '') && !root) root = publicMessage_(message);
    else replies.push(publicMessage_(message));
  });

  var totalPages = Math.max(1, Math.ceil(replies.length / ROLEPLAY.PAGE_SIZE));
  var page = Math.min(Math.max(parseInt(requestedPage, 10) || 1, 1), totalPages);
  var start = (page - 1) * ROLEPLAY.PAGE_SIZE;

  return {
    ok: true,
    thread: publicThread_(findThread_(threadId)),
    root_message: root,
    messages: replies.slice(start, start + ROLEPLAY.PAGE_SIZE),
    page: page,
    page_size: ROLEPLAY.PAGE_SIZE,
    total_messages: replies.length,
    total_pages: totalPages
  };
}

function createThread_(body) {
  var authorId = required_(body.author_id, 'author_id');
  requireActiveAuthor_(authorId);
  var now = new Date();
  var threadId = Utilities.getUuid();
  var messageId = Utilities.getUuid();

  appendObject_(ROLEPLAY.THREADS_SHEET, {
    thread_id: threadId,
    title: required_(body.title, 'title'),
    category: String(body.category || 'ETC').toUpperCase(),
    status: 'active',
    created_at: now,
    updated_at: now,
    created_by: authorId
  });

  appendObject_(ROLEPLAY.MESSAGES_SHEET, {
    message_id: messageId,
    thread_id: threadId,
    parent_id: '',
    author_id: authorId,
    created_at: now,
    content: required_(body.content, 'content'),
    image_urls: normalizeImageUrls_(body.image_urls),
    deleted: false
  });

  return { thread_id: threadId, root_message_id: messageId };
}

function addMessage_(body) {
  var threadId = required_(body.thread_id, 'thread_id');
  var authorId = required_(body.author_id, 'author_id');
  var thread = findThread_(threadId);
  if (String(thread.status || '').toLowerCase() !== 'active') {
    throw new Error('Completed or archived threads cannot receive new messages.');
  }
  requireActiveAuthor_(authorId);
  var now = new Date();
  var messageId = Utilities.getUuid();

  appendObject_(ROLEPLAY.MESSAGES_SHEET, {
    message_id: messageId,
    thread_id: threadId,
    parent_id: required_(body.parent_id, 'parent_id'),
    author_id: authorId,
    created_at: now,
    content: required_(body.content, 'content'),
    image_urls: normalizeImageUrls_(body.image_urls),
    deleted: false
  });
  updateObjectRow_(ROLEPLAY.THREADS_SHEET, thread._row, { updated_at: now });

  return { message_id: messageId, thread_id: threadId };
}

function setThreadStatus_(body) {
  var threadId = required_(body.thread_id, 'thread_id');
  var status = required_(body.status, 'status').toLowerCase();
  if (['active', 'completed', 'archived'].indexOf(status) === -1) {
    throw new Error('status must be active, completed, or archived.');
  }
  var thread = findThread_(threadId);
  updateObjectRow_(ROLEPLAY.THREADS_SHEET, thread._row, {
    status: status,
    updated_at: new Date()
  });
  return { thread_id: threadId, status: status };
}

function updateMessage_(body) {
  var messageId = required_(body.message_id, 'message_id');
  var message = findBy_(ROLEPLAY.MESSAGES_SHEET, 'message_id', messageId);
  if (truthy_(message.deleted)) throw new Error('Deleted messages cannot be edited.');
  updateObjectRow_(ROLEPLAY.MESSAGES_SHEET, message._row, {
    content: required_(body.content, 'content')
  });
  var thread = findThread_(String(message.thread_id || ''));
  updateObjectRow_(ROLEPLAY.THREADS_SHEET, thread._row, { updated_at: new Date() });
  return { message_id: messageId, thread_id: String(message.thread_id || '') };
}

function deleteMessage_(body) {
  var messageId = required_(body.message_id, 'message_id');
  var message = findBy_(ROLEPLAY.MESSAGES_SHEET, 'message_id', messageId);
  updateObjectRow_(ROLEPLAY.MESSAGES_SHEET, message._row, { deleted: true });
  return { message_id: messageId, deleted: true };
}

function deleteThread_(body) {
  var threadId = required_(body.thread_id, 'thread_id');
  var thread = findThread_(threadId);
  updateObjectRow_(ROLEPLAY.THREADS_SHEET, thread._row, {
    status: 'deleted',
    updated_at: new Date()
  });
  return { thread_id: threadId, status: 'deleted' };
}

function exportThread_(threadId) {
  var thread = publicThread_(findThread_(threadId));
  var authors = {};
  getAuthors_().forEach(function (author) { authors[author.author_id] = author; });
  var messages = readObjects_(ROLEPLAY.MESSAGES_SHEET)
    .filter(function (message) {
      return String(message.thread_id || '') === threadId && !truthy_(message.deleted);
    })
    .sort(function (a, b) { return dateNumber_(a.created_at) - dateNumber_(b.created_at); })
    .map(publicMessage_);
  return { thread: thread, authors: authors, messages: messages };
}

function uploadImage_(body) {
  var file = body.file || {};
  var name = required_(file.name, 'file.name').replace(/[^a-zA-Z0-9._-]/g, '_');
  var mimeType = required_(file.mime_type, 'file.mime_type');
  var base64 = required_(file.base64, 'file.base64').replace(/^data:[^;]+;base64,/, '');
  var bytes = Utilities.base64Decode(base64);
  if (bytes.length > ROLEPLAY.MAX_IMAGE_BYTES) {
    throw new Error('Each image must be 2 MB or smaller after compression.');
  }
  if (mimeType.indexOf('image/') !== 0) throw new Error('Only image files are allowed.');

  var folderId = PropertiesService.getScriptProperties().getProperty(ROLEPLAY.IMAGE_FOLDER_PROPERTY);
  if (!folderId) throw new Error('ROLEPLAY_IMAGE_FOLDER_ID is not configured.');
  var folder = DriveApp.getFolderById(folderId);
  var blob = Utilities.newBlob(bytes, mimeType, new Date().getTime() + '-' + name);
  var driveFile = folder.createFile(blob);
  driveFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  return {
    file_id: driveFile.getId(),
    url: 'https://drive.google.com/uc?export=view&id=' + driveFile.getId()
  };
}

function setupRoleplayImageFolder() {
  var folder = DriveApp.createFolder('Dekade Roleplay Live Images');
  folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  PropertiesService.getScriptProperties().setProperty(ROLEPLAY.IMAGE_FOLDER_PROPERTY, folder.getId());
  Logger.log('Image folder created: ' + folder.getUrl());
}

function validateRoleplaySheets() {
  var expected = {};
  expected[ROLEPLAY.AUTHORS_SHEET] = ['author_id', 'name', 'profile_image', 'background_color', 'text_color', 'accent_color', 'active', 'order'];
  expected[ROLEPLAY.THREADS_SHEET] = ['thread_id', 'title', 'category', 'status', 'created_at', 'updated_at', 'created_by'];
  expected[ROLEPLAY.MESSAGES_SHEET] = ['message_id', 'thread_id', 'parent_id', 'author_id', 'created_at', 'content', 'image_urls', 'deleted'];

  Object.keys(expected).forEach(function (sheetName) {
    var sheet = getSheet_(sheetName);
    var actual = headers_(sheet);
    if (actual.join('|') !== expected[sheetName].join('|')) {
      throw new Error(sheetName + ' headers do not match. Expected: ' + expected[sheetName].join(' | '));
    }
  });
  Logger.log('Roleplay sheets are ready.');
}

function parseBody_(e) {
  if (!e || !e.postData || !e.postData.contents) throw new Error('Missing POST body.');
  try {
    return JSON.parse(e.postData.contents);
  } catch (error) {
    throw new Error('POST body must be valid JSON.');
  }
}

function checkPasscode_(provided) {
  var expected = PropertiesService.getScriptProperties().getProperty(ROLEPLAY.WRITE_PASSCODE_PROPERTY);
  if (!expected) throw new Error('ROLEPLAY_PASSCODE is not configured.');
  if (String(provided || '') !== expected) throw new Error('Invalid passcode.');
}

function getSheet_(name) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet) throw new Error('Missing sheet: ' + name);
  return sheet;
}

function headers_(sheet) {
  var lastColumn = sheet.getLastColumn();
  if (!lastColumn) return [];
  return sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0].map(function (value) {
    return String(value || '').trim();
  });
}

function readObjects_(sheetName) {
  var sheet = getSheet_(sheetName);
  var headers = headers_(sheet);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  return values.map(function (row, index) {
    var object = { _row: index + 2 };
    headers.forEach(function (header, column) { object[header] = row[column]; });
    return object;
  });
}

function appendObject_(sheetName, object) {
  var sheet = getSheet_(sheetName);
  var headers = headers_(sheet);
  sheet.appendRow(headers.map(function (header) {
    return Object.prototype.hasOwnProperty.call(object, header) ? object[header] : '';
  }));
}

function updateObjectRow_(sheetName, rowNumber, updates) {
  var sheet = getSheet_(sheetName);
  var headers = headers_(sheet);
  Object.keys(updates).forEach(function (key) {
    var column = headers.indexOf(key);
    if (column === -1) throw new Error('Missing column ' + key + ' in ' + sheetName);
    sheet.getRange(rowNumber, column + 1).setValue(updates[key]);
  });
}

function findBy_(sheetName, key, value) {
  var found = readObjects_(sheetName).filter(function (item) {
    return String(item[key] || '') === String(value);
  })[0];
  if (!found) throw new Error('Not found: ' + sheetName + ' ' + key + '=' + value);
  return found;
}

function findThread_(threadId) {
  return findBy_(ROLEPLAY.THREADS_SHEET, 'thread_id', threadId);
}

function requireActiveAuthor_(authorId) {
  var author = findBy_(ROLEPLAY.AUTHORS_SHEET, 'author_id', authorId);
  if (!truthy_(author.active)) throw new Error('Inactive author: ' + authorId);
  return author;
}

function publicThread_(thread) {
  return {
    thread_id: String(thread.thread_id || ''),
    title: String(thread.title || ''),
    category: String(thread.category || ''),
    status: String(thread.status || ''),
    created_at: thread.created_at || '',
    updated_at: thread.updated_at || '',
    created_by: String(thread.created_by || '')
  };
}

function publicMessage_(message) {
  return {
    message_id: String(message.message_id || ''),
    thread_id: String(message.thread_id || ''),
    parent_id: String(message.parent_id || ''),
    author_id: String(message.author_id || ''),
    created_at: message.created_at || '',
    content: String(message.content || ''),
    image_urls: splitImageUrls_(message.image_urls)
  };
}

function normalizeImageUrls_(value) {
  if (!value) return '';
  if (Array.isArray(value)) return value.filter(Boolean).join('\n');
  return String(value).split(/\r?\n|,/).map(function (url) { return url.trim(); }).filter(Boolean).join('\n');
}

function splitImageUrls_(value) {
  return String(value || '').split(/\r?\n|,/).map(function (url) { return url.trim(); }).filter(Boolean);
}

function required_(value, label) {
  var text = String(value == null ? '' : value).trim();
  if (!text) throw new Error('Missing required value: ' + label);
  return text;
}

function truthy_(value) {
  return value === true || String(value || '').toLowerCase() === 'true' || String(value) === '1';
}

function number_(value) {
  return Number(value) || 0;
}

function dateNumber_(value) {
  var date = value instanceof Date ? value : new Date(value);
  var time = date.getTime();
  return isNaN(time) ? 0 : time;
}

function withLock_(callback) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    return callback();
  } finally {
    lock.releaseLock();
  }
}

function json_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function errorJson_(error) {
  return json_({ ok: false, error: String(error && error.message ? error.message : error) });
}
