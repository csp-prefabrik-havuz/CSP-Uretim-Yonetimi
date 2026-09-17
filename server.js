const http = require('http');
const fs = require('fs');
const path = require('path');

const port = 8787;
const appFile = path.join(__dirname, 'index.html');
const backupDirectory = path.join(__dirname, 'backups');
const automaticBackupsToKeep = 30;

const sendJson = (response, status, value) => {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(value));
};

const backupFileName = (source) => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `csp-uretim-${source === 'manual' ? 'manuel-yedek' : 'otomatik-yedek'}-${timestamp}.json`;
};

const removeOldAutomaticBackups = () => {
  fs.readdir(backupDirectory, (readError, files) => {
    if (readError) return;
    const automaticFiles = files.filter((file) => file.startsWith('csp-uretim-otomatik-yedek-')).sort().reverse();
    automaticFiles.slice(automaticBackupsToKeep).forEach((file) => fs.unlink(path.join(backupDirectory, file), () => {}));
  });
};

const saveBackup = (request, response) => {
  let body = '';
  request.setEncoding('utf8');
  request.on('data', (chunk) => {
    body += chunk;
    if (Buffer.byteLength(body, 'utf8') > 30 * 1024 * 1024) request.destroy();
  });
  request.on('end', () => {
    try {
      const payload = JSON.parse(body || '{}');
      if (!payload.state || typeof payload.state !== 'object') throw new Error('Yedek verisi bulunamadı.');
      const source = payload.source === 'manual' ? 'manual' : 'automatic';
      const fileName = backupFileName(source);
      const backup = JSON.stringify({
        application: 'CSP Üretim Yönetimi',
        savedAt: new Date().toISOString(),
        source,
        state: payload.state
      }, null, 2);
      fs.mkdir(backupDirectory, { recursive: true }, (directoryError) => {
        if (directoryError) {
          sendJson(response, 500, { ok: false, message: 'Yedek klasörü oluşturulamadı.' });
          return;
        }
        fs.writeFile(path.join(backupDirectory, fileName), backup, 'utf8', (writeError) => {
          if (writeError) {
            sendJson(response, 500, { ok: false, message: 'Yedek kaydedilemedi.' });
            return;
          }
          if (source === 'automatic') removeOldAutomaticBackups();
          sendJson(response, 200, { ok: true, fileName, message: 'Yedek kaydedildi.' });
        });
      });
    } catch (error) {
      sendJson(response, 400, { ok: false, message: 'Yedek dosyası okunamadı.' });
    }
  });
};

http.createServer((request, response) => {
  if (request.method === 'POST' && request.url === '/api/backup') {
    saveBackup(request, response);
    return;
  }
  const requestedPath = request.url === '/' || request.url === '/index.html'
    ? appFile
    : request.url === '/csp-logo.png'
      ? path.join(__dirname, 'csp-logo.png')
      : null;
  if (!requestedPath) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Sayfa bulunamadı.');
    return;
  }
  fs.readFile(requestedPath, (error, content) => {
    if (error) {
      response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Program dosyası açılamadı.');
      return;
    }
    const contentType = requestedPath.endsWith('.png') ? 'image/png' : 'text/html; charset=utf-8';
    response.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-store' });
    response.end(content);
  });
}).listen(port, '127.0.0.1', () => {
  console.log(`CSP Üretim Yönetimi hazır: http://127.0.0.1:${port}`);
});
