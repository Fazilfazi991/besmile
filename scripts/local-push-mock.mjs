import { appendFileSync } from 'node:fs';
import { createServer } from 'node:http';

const port = Number(process.env.BSMILE_LOCAL_PUSH_MOCK_PORT || 54330);
const logPath = process.env.BSMILE_LOCAL_PUSH_MOCK_LOG;

if (!logPath || !Number.isInteger(port) || port < 1024 || port > 65535) {
  throw new Error('Local push mock requires a log path and a valid unprivileged port.');
}

createServer((request, response) => {
  let bytes = 0;
  request.on('data', (chunk) => { bytes += chunk.length; });
  request.on('end', () => {
    appendFileSync(logPath, `${JSON.stringify({ method: request.method, url: request.url, bytes, at: new Date().toISOString() })}\n`);
    response.writeHead(202, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ accepted: true }));
  });
}).listen(port, '0.0.0.0');
