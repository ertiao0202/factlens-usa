// api.cjs – edge function that hides your Kimi key
// deploy as /api/chat
export default async function handler(req, res){
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const KIMI_API_KEY = process.env.KIMI_API_KEY;
  if (!KIMI_API_KEY) return res.status(500).json({ error:'Server misconfigured' });

  try {
    const upstream = await fetch('https://api.moonshot.cn/v1/chat/completions', {
      method:'POST',
      headers:{
        'Authorization':`Bearer ${KIMI_API_KEY}`,
        'Content-Type':'application/json'
      },
      body:JSON.stringify(req.body)
    });
    if (!upstream.ok){
      const txt = await upstream.text();
      return res.status(upstream.status).json({ error:txt });
    }
    const data = await upstream.json();
    return res.status(200).json(data);
  } catch (e) {
    return res.status(500).json({ error:e.message });
  }
}
