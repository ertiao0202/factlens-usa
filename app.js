// app.js
const $   = s => document.querySelector(s);
const url = '/api/chat';

let radarChart;
const ui = {
  input   : $('#urlInput'),
  btn     : $('#analyzeBtn'),
  progress: $('#progress'),
  summary : $('#summary'),
  fourDim : $('#fourDim'),
  results : $('#results'),
  fact    : $('#factList'),
  opinion : $('#opinionList'),
  bias    : $('#biasList'),
  pub     : $('#pubAdvice'),
  pr      : $('#prAdvice'),
  radarEl : $('#radar')
};

ui.btn.addEventListener('click', handleAnalyze);
ui.input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAnalyze(); } });

async function handleAnalyze(){
  const raw = ui.input.value.trim();
  if (!raw) return;
  showProgress();
  try {
    const { content, title } = await fetchContent(raw);
    const report             = await analyzeContent(content, title);
    render(report);
  } catch (e) {
    console.error(e);
    showSummary('We could not retrieve the page. Please paste text directly.');
  }
  hideProgress();
}

async function fetchContent(raw){
  if (raw.startsWith('http')){
    const res = await fetch(`https://r.jina.ai/${encodeURIComponent(raw)}`);
    if (!res.ok) throw new Error('fetch failed');
    const txt = await res.text();
    return { content: txt.slice(0, 3500), title: raw };
  }
  return { content: raw.slice(0, 3500), title: 'Pasted text' };
}

async function analyzeContent(content, title){
  const prompt = buildPrompt(content, title);
  const body   = { model: 'moonshot-v1-8k', messages:[{role:'user', content:prompt}], temperature:0.25, max_tokens:2048 };
  const res    = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
  if (!res.ok) { const t = await res.text(); throw new Error(t); }
  const json   = await res.json();
  return parseReport(json.choices[0].message.content);
}

function buildPrompt(content, title){
  return `Role: You are "FactLens", a fact-opinion-bias detector.
Output MUST follow the structure below.

Steps:
1. Summarize the core message in ≤25 words.
2. Split sentences; tag each as <fact> or <opinion>.
3. Count bias signals: emotional words, binary opposition, mind-reading, logical fallacy.
4. Give one actionable publisher tip.
5. Give one 30-word PR reply.
6. Write a 20-word overall summary.

Template:
Title: ${title}
Credibility: X/10 (one sentence)

Facts:
1. <fact>sentence</fact>
…

Opinions:
1. <opinion>sentence</opinion>
…

Bias:
- Emotional words: N  eg: <eg>text</eg>
- Binary opposition: N
- Mind-reading: N
- Logical fallacy: N
- Overall stance: neutral/leaning/critical X%

Publisher tip:
xxx

PR tip:
xxx

Summary:
xxx

Text:
${content}`;
}

function parseReport(md){
  const r = { facts:[], opinions:[], bias:{}, summary:'', publisher:'', pr:'', credibility:8 };
  const cred = md.match(/Credibility:\s*(\d+(?:\.\d+)?)\s*\/\s*10/);
  if (cred) r.credibility = parseFloat(cred[1]);
  const fBlock = md.match(/Facts:([\s\S]*?)Opinions:/);
  if (fBlock) r.facts = fBlock[1].split('\n').filter(l=>l.includes('<fact>')).map(l=>l.replace(/^\d+\.\s*<fact>(.*)<\/fact>.*/,'$1').trim());
  const oBlock = md.match(/Opinions:([\s\S]*?)Bias:/);
  if (oBlock) r.opinions = oBlock[1].split('\n').filter(l=>l.includes('<opinion>')).map(l=>
