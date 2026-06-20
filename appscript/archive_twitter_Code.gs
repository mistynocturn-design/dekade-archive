var BACKUP_API = {
  VERSION: '2026-06-20.1',
  ARCHIVE_SHEET: 'Archive',
  TWITTER_SHEET: 'Twitter',
  READ_KEY_PROPERTY: 'BACKUP_READ_KEY',
  MAX_ARCHIVE_ROWS: 2000
};

function doGet(e) {
  try {
    var action = String((e && e.parameter && e.parameter.action) || 'health').toLowerCase();
    if (action === 'health') {
      return json_({ ok: true, service: 'dekade-backup-reader', api_version: BACKUP_API.VERSION, time: new Date() });
    }
    throw new Error('Unknown GET action: ' + action);
  } catch (error) {
    return errorJson_(error);
  }
}

function doPost(e) {
  try {
    var body = parseBody_(e);
    checkReadKey_(body.read_key);
    var action = String(body.action || '').toLowerCase();
    if (action === 'read_archive') return json_(readArchive_(body));
    if (action === 'read_twitter') return json_(readTwitter_(body));
    throw new Error('Unknown POST action: ' + action);
  } catch (error) {
    return errorJson_(error);
  }
}

function readArchive_(body) {
  var sheet = getSheet_(BACKUP_API.ARCHIVE_SHEET);
  var table = readTable_(sheet);
  var columns = {
    date: findColumn_(table.headers, ['작성일', 'date']),
    title: findColumn_(table.headers, ['카테고리제목', '카테고리 제목', '제목', 'title']),
    content: findColumn_(table.headers, ['내용', '본문', 'content', 'text']),
    image: findOptionalColumn_(table.headers, ['이미지', '이미지링크', 'image', 'imageurl']),
    side: findColumn_(table.headers, ['좌우', '화자', 'side'])
  };
  var startRow = Math.max(2, parseInt(body.start_row, 10) || 2);
  var endRow = Math.min(sheet.getLastRow(), parseInt(body.end_row, 10) || startRow);
  if (endRow < startRow) throw new Error('End row must be greater than or equal to start row.');
  if (endRow - startRow + 1 > BACKUP_API.MAX_ARCHIVE_ROWS) throw new Error('Archive range is too large.');

  if (body.expand_thread !== false && String(body.expand_thread).toLowerCase() !== 'false') {
    var startIndex = startRow - 2;
    var endIndex = endRow - 2;
    var startTitle = cell_(table.rows[startIndex], columns.title);
    var endTitle = cell_(table.rows[endIndex], columns.title);
    while (startIndex > 0 && startTitle && cell_(table.rows[startIndex - 1], columns.title) === startTitle) startIndex -= 1;
    while (endIndex < table.rows.length - 1 && endTitle && cell_(table.rows[endIndex + 1], columns.title) === endTitle) endIndex += 1;
    startRow = startIndex + 2;
    endRow = endIndex + 2;
  }

  var output = [];
  for (var rowNumber = startRow; rowNumber <= endRow; rowNumber += 1) {
    var row = table.rows[rowNumber - 2];
    if (!row) continue;
    var content = cell_(row, columns.content);
    var image = columns.image === -1 ? '' : cell_(row, columns.image);
    if (!content && !image) continue;
    output.push({
      sheet_row: rowNumber,
      date: dateText_(row[columns.date]),
      title: cell_(row, columns.title),
      content: content,
      image: image,
      side: cell_(row, columns.side).toLowerCase()
    });
  }
  return { ok: true, api_version: BACKUP_API.VERSION, start_row: startRow, end_row: endRow, rows: output };
}

function readTwitter_(body) {
  var month = normalizeMonth_(body.month);
  if (!month) throw new Error('Month must use YYYY-MM format.');
  var sheet = getSheet_(BACKUP_API.TWITTER_SHEET);
  var table = readTable_(sheet);
  var columns = {
    date: findColumn_(table.headers, ['작성일', 'date']),
    author: findColumn_(table.headers, ['작성자', 'author']),
    profile: findOptionalColumn_(table.headers, ['프로필이미지', '프로필 이미지', 'profileimage', 'avatar']),
    tags: findOptionalColumn_(table.headers, ['태그', 'tags']),
    content: findColumn_(table.headers, ['내용', '본문', 'content', 'text']),
    images: findOptionalColumn_(table.headers, ['이미지', '이미지링크', '이미지 링크', 'imageurls', 'images']),
    threadId: findOptionalColumn_(table.headers, ['타래id', '타래 ID', 'threadid']),
    threadMonth: findOptionalColumn_(table.headers, ['타래시작월', '타래 시작월', 'threadstartmonth', 'ownermonth'])
  };
  var normalized = table.rows.map(function (row, index) {
    return {
      sheet_row: index + 2,
      date: dateText_(row[columns.date]),
      author: cell_(row, columns.author),
      profile_image: columns.profile === -1 ? '' : cell_(row, columns.profile),
      tags: columns.tags === -1 ? '' : cell_(row, columns.tags),
      content: cell_(row, columns.content),
      image_urls: columns.images === -1 ? '' : cell_(row, columns.images),
      thread_id: columns.threadId === -1 ? '' : cell_(row, columns.threadId),
      thread_start_month: columns.threadMonth === -1 ? '' : normalizeMonth_(cell_(row, columns.threadMonth))
    };
  }).filter(function (row) { return row.date || row.content || row.image_urls; });

  var threadOwners = {};
  normalized.forEach(function (row) {
    if (!row.thread_id) return;
    var writtenMonth = row.date.slice(0, 7);
    var current = threadOwners[row.thread_id];
    if (!current) threadOwners[row.thread_id] = row.thread_start_month || writtenMonth;
    else if (row.thread_start_month) threadOwners[row.thread_id] = row.thread_start_month;
    else if (writtenMonth && writtenMonth < current) threadOwners[row.thread_id] = writtenMonth;
  });

  var output = normalized.filter(function (row) {
    if (row.thread_id) return threadOwners[row.thread_id] === month;
    return row.date.slice(0, 7) === month;
  }).map(function (row) {
    row.thread_start_month = row.thread_id ? threadOwners[row.thread_id] : '';
    return row;
  });
  return { ok: true, api_version: BACKUP_API.VERSION, month: month, rows: output };
}

function validateBackupSheets() {
  var archive = readTable_(getSheet_(BACKUP_API.ARCHIVE_SHEET));
  findColumn_(archive.headers, ['작성일', 'date']);
  findColumn_(archive.headers, ['카테고리제목', '카테고리 제목', '제목', 'title']);
  findColumn_(archive.headers, ['내용', '본문', 'content', 'text']);
  findColumn_(archive.headers, ['좌우', '화자', 'side']);
  var twitter = readTable_(getSheet_(BACKUP_API.TWITTER_SHEET));
  findColumn_(twitter.headers, ['작성일', 'date']);
  findColumn_(twitter.headers, ['작성자', 'author']);
  findColumn_(twitter.headers, ['내용', '본문', 'content', 'text']);
  Logger.log('Archive and Twitter sheets are ready.');
}

function getSheet_(name) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet) throw new Error('Missing sheet: ' + name);
  return sheet;
}

function readTable_(sheet) {
  var lastRow = sheet.getLastRow();
  var lastColumn = sheet.getLastColumn();
  if (!lastRow || !lastColumn) throw new Error('Sheet is empty: ' + sheet.getName());
  var values = sheet.getRange(1, 1, lastRow, lastColumn).getValues();
  return { headers: values.shift().map(function (value) { return String(value || '').trim(); }), rows: values };
}

function normalizeHeader_(value) {
  return String(value || '').toLowerCase().replace(/[\s_\-]/g, '');
}

function findColumn_(headers, aliases) {
  var index = findOptionalColumn_(headers, aliases);
  if (index === -1) throw new Error('Missing column. Expected one of: ' + aliases.join(', '));
  return index;
}

function findOptionalColumn_(headers, aliases) {
  var normalizedAliases = aliases.map(normalizeHeader_);
  for (var index = 0; index < headers.length; index += 1) {
    if (normalizedAliases.indexOf(normalizeHeader_(headers[index])) !== -1) return index;
  }
  return -1;
}

function cell_(row, index) {
  return index === -1 || !row ? '' : String(row[index] == null ? '' : row[index]).trim();
}

function dateText_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, Session.getScriptTimeZone() || 'Asia/Seoul', 'yyyy-MM-dd');
  }
  var text = String(value || '').trim().replace(/\./g, '-').replace(/\//g, '-');
  var match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  return match ? match[1] + '-' + ('0' + match[2]).slice(-2) + '-' + ('0' + match[3]).slice(-2) : text;
}

function normalizeMonth_(value) {
  var text = String(value || '').trim().replace(/\./g, '-').replace(/\//g, '-');
  var match = text.match(/^(\d{4})-(\d{1,2})/);
  return match ? match[1] + '-' + ('0' + match[2]).slice(-2) : '';
}

function parseBody_(e) {
  if (!e || !e.postData || !e.postData.contents) throw new Error('Missing POST body.');
  try { return JSON.parse(e.postData.contents); }
  catch (error) { throw new Error('POST body must be valid JSON.'); }
}

function checkReadKey_(provided) {
  var expected = PropertiesService.getScriptProperties().getProperty(BACKUP_API.READ_KEY_PROPERTY);
  if (!expected) throw new Error('BACKUP_READ_KEY is not configured.');
  if (String(provided || '') !== expected) throw new Error('Invalid read key.');
}

function json_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}

function errorJson_(error) {
  return json_({ ok: false, error: String(error && error.message ? error.message : error) });
}
