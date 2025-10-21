// api/chat.js  —— CommonJS + 裸 fetch + 错误兜底
const https = require('https');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const body = JSON.stringify({ ...req.body, stream: true });
  const options = {
    hostname: 'api.moonshot.cn',
    path: '/v1/chat/completions',
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.KIMI_API_KEY}`,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    },
  };

  const upstream = https.request(options, (upRes) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    upRes.on('data', chunk => res.write(chunk));
    upRes.on('end', () => res.end());
  });

  upstream.on('error', (e) => {
    console.error(e);
    res.status(500).json({ error: 'Upstream failed' });
  });

  upstream.write(body);
  upstream.end();
};
