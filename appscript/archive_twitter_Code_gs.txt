var BACKUP_API = {
  VERSION: '2026-06-21.1',
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
    if (action === 'list_archive_titles') return json_(listArchiveTitles_());
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
    date: findColumnOrFallback_(table.headers, ['작성일', '작성 날짜', '날짜', 'date'], 0),
    title: findColumnOrFallback_(table.headers, ['카테고리제목', '카테고리 제목', '카테고리', '대화제목', '대화 제목', '로그제목', '로그 제목', '제목', 'title', 'categorytitle', 'category'], 1),
    content: findColumnOrFallback_(table.headers, ['내용', '본문', '대화내용', '대화 내용', 'content', 'text'], 2),
    image: findOptionalColumnOrFallback_(table.headers, ['이미지', '이미지링크', '이미지 링크', 'image', 'imageurl'], 3),
    side: findColumnOrFallback_(table.headers, ['좌우', '화자', '방향', 'side'], 4)
  };
  var selectedTitle = String(body.title || '').trim();
  if (!selectedTitle) throw new Error('Archive title is required.');
  var output = [];
  for (var rowNumber = 2; rowNumber <= sheet.getLastRow(); rowNumber += 1) {
    var row = table.rows[rowNumber - 2];
    if (!row) continue;
    if (cell_(row, columns.title) !== selectedTitle) continue;
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
    if (output.length > BACKUP_API.MAX_ARCHIVE_ROWS) throw new Error('This Archive title has too many rows.');
  }
  if (!output.length) throw new Error('No Archive rows found for title: ' + selectedTitle);
  return { ok: true, api_version: BACKUP_API.VERSION, title: selectedTitle, rows: output };
}

function listArchiveTitles_() {
  var sheet = getSheet_(BACKUP_API.ARCHIVE_SHEET);
  var table = readTable_(sheet);
  var titleColumn = findColumnOrFallback_(table.headers, ['카테고리제목', '카테고리 제목', '카테고리', '대화제목', '대화 제목', '로그제목', '로그 제목', '제목', 'title', 'categorytitle', 'category'], 1);
  var dateColumn = findColumnOrFallback_(table.headers, ['작성일', '작성 날짜', '날짜', 'date'], 0);
  var found = {};
  var titles = [];
  table.rows.forEach(function (row) {
    var title = cell_(row, titleColumn);
    if (!title) return;
    if (!found[title]) {
      found[title] = { title: title, count: 0, first_date: dateText_(row[dateColumn]), last_date: dateText_(row[dateColumn]) };
      titles.push(found[title]);
    }
    found[title].count += 1;
    found[title].last_date = dateText_(row[dateColumn]) || found[title].last_date;
  });
  return { ok: true, api_version: BACKUP_API.VERSION, titles: titles };
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

  // Thread numbers may be reused every month. Without an explicit start-month
  // column, consecutive rows with the same ID are treated as one thread block.
  var blockNumber = 0;
  var previousImplicitId = '';
  var previousImplicitKey = '';
  var previousImplicitMonth = '';
  normalized.forEach(function (row) {
    var writtenMonth = row.date.slice(0, 7);
    if (!row.thread_id) {
      row.thread_owner_month = writtenMonth;
      row.thread_key = '';
      previousImplicitId = '';
      previousImplicitKey = '';
      previousImplicitMonth = '';
      return;
    }
    if (row.thread_start_month) {
      row.thread_owner_month = row.thread_start_month;
      row.thread_key = row.thread_start_month + '::' + row.thread_id;
      previousImplicitId = '';
      previousImplicitKey = '';
      previousImplicitMonth = '';
      return;
    }
    if (row.thread_id === previousImplicitId && writtenMonth === previousImplicitMonth && previousImplicitKey) {
      row.thread_key = previousImplicitKey;
    } else {
      blockNumber += 1;
      row.thread_key = writtenMonth + '::' + row.thread_id + '::' + blockNumber;
    }
    row.thread_owner_month = row.thread_key.slice(0, 7);
    previousImplicitId = row.thread_id;
    previousImplicitKey = row.thread_key;
    previousImplicitMonth = writtenMonth;
  });

  var output = normalized.filter(function (row) {
    return row.thread_owner_month === month;
  }).map(function (row) {
    row.thread_start_month = row.thread_id ? row.thread_owner_month : '';
    delete row.thread_owner_month;
    delete row.thread_key;
    return row;
  });
  return { ok: true, api_version: BACKUP_API.VERSION, month: month, rows: output };
}

function validateBackupSheets() {
  var archive = readTable_(getSheet_(BACKUP_API.ARCHIVE_SHEET));
  findColumnOrFallback_(archive.headers, ['작성일', '작성 날짜', '날짜', 'date'], 0);
  findColumnOrFallback_(archive.headers, ['카테고리제목', '카테고리 제목', '카테고리', '대화제목', '대화 제목', '로그제목', '로그 제목', '제목', 'title', 'categorytitle', 'category'], 1);
  findColumnOrFallback_(archive.headers, ['내용', '본문', '대화내용', '대화 내용', 'content', 'text'], 2);
  findColumnOrFallback_(archive.headers, ['좌우', '화자', '방향', 'side'], 4);
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

function findColumnOrFallback_(headers, aliases, fallbackIndex) {
  var index = findOptionalColumn_(headers, aliases);
  if (index !== -1) return index;
  if (fallbackIndex >= 0 && fallbackIndex < headers.length) return fallbackIndex;
  throw new Error('Missing column. Expected one of: ' + aliases.join(', ') + '. Found: ' + headers.join(', '));
}

function findOptionalColumnOrFallback_(headers, aliases, fallbackIndex) {
  var index = findOptionalColumn_(headers, aliases);
  return index !== -1 ? index : (fallbackIndex >= 0 && fallbackIndex < headers.length ? fallbackIndex : -1);
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
  return json_({ ok: false, api_version: BACKUP_API.VERSION, error: String(error && error.message ? error.message : error) });
}
