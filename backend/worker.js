const LANG_NAMES = { en:'English', fr:'French', es:'Spanish', de:'German' };
const DEFAULT_TEXT_MODEL = 'gemini-3.5-flash-lite';
const DEFAULT_LIVE_MODEL = 'gemini-3.8-live';
const DEFAULT_TTS_MODEL = 'gemini-3.8-flash-lite-tts';

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = env.ALLOWED_ORIGIN || '*';
    const cors = {
      'Access-Control-Allow-Origin': allowed === '*' ? '*' : allowed,
      'Access-Control-Allow-Methods': 'POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Cache-Control': 'no-store',
      'Vary': 'Origin'
    };
    if (request.method === 'OPTIONS') return new Response(null,{status:204,headers:cors});
    if (request.method !== 'POST') return json({ok:false,error:'Use POST'},405,cors);
    if (allowed !== '*' && origin && origin !== allowed) return json({ok:false,error:'Origin non autorizzata'},403,cors);

    try {
      const body = await request.json();
      const action = body?.action;
      const payload = body?.payload || {};
      if (action === 'health') {
        return json({ok:true,data:{
          message:`LinguaViva FREE attivo · Gemini ${env.GEMINI_TEXT_MODEL || DEFAULT_TEXT_MODEL}`,
          freeMode:true,
          liveModel:env.GEMINI_LIVE_MODEL || DEFAULT_LIVE_MODEL
        }},200,cors);
      }
      if (!env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY non configurata nel Worker.');

      let result;
      switch(action){
        case 'live_token': result = await liveToken(payload,env); break;
        case 'british_voices': result = await britishVoices(env); break;
        case 'listening_generate': result = await listeningGenerate(payload,env); break;
        case 'listening_evaluate': result = await listeningEvaluate(payload,env); break;
        case 'transcript_evaluate': result = await transcriptEvaluate(payload,env); break;
        case 'conversation_turn': result = await conversationTurn(payload,env); break;
        case 'live_review': result = await liveReview(payload,env); break;
        case 'tts': result = await tts(payload,env); break;
        case 'pronunciation_generate': result = await pronunciationGenerate(payload,env); break;
        case 'pronunciation_evaluate': result = await pronunciationEvaluate(payload,env); break;
        case 'grammar_lesson': result = await grammarLesson(payload,env); break;
        default: throw new Error(`Azione non supportata: ${action}`);
      }
      return json({ok:true,data:result},200,cors);
    } catch (err) {
      return json({ok:false,error:err?.message || String(err)},500,cors);
    }
  }
};

function json(obj,status,headers){
  return new Response(JSON.stringify(obj),{status,headers:{...headers,'Content-Type':'application/json; charset=utf-8'}});
}
function languageName(code){return LANG_NAMES[code]||'English'}
function requireStrings(obj,keys){for(const k of keys)if(typeof obj?.[k]!=='string'||!obj[k].trim())throw new Error(`Campo AI mancante: ${k}`)}
function clampScore(v){const n=Number(v);return Number.isFinite(n)?Math.max(0,Math.min(100,Math.round(n))):0}
function recentErrorSummary(errors=[]){return errors.slice(0,8).map(e=>`${e.category||'error'}: ${e.original||''} -> ${e.corrected||''}`).join('\n') || 'none';}
function cleanModelText(t=''){return String(t).trim().replace(/^```json\s*/i,'').replace(/```$/,'').trim()}
function parseJSON(text){
  const t=cleanModelText(text); try{return JSON.parse(t)}catch{}
  const a=t.indexOf('{'), b=t.lastIndexOf('}');
  if(a>=0 && b>a) return JSON.parse(t.slice(a,b+1));
  throw new Error('Gemini non ha restituito il formato JSON richiesto.');
}

async function askJSON(env, systemInstruction, prompt, maxOutputTokens=1200){
  const model=env.GEMINI_TEXT_MODEL || DEFAULT_TEXT_MODEL;
  const url=`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const res=await fetch(url,{
    method:'POST',
    headers:{'x-goog-api-key':env.GEMINI_API_KEY,'Content-Type':'application/json'},
    body:JSON.stringify({
      systemInstruction:{parts:[{text:systemInstruction}]},
      contents:[{role:'user',parts:[{text:prompt}]}],
      generationConfig:{responseMimeType:'application/json',maxOutputTokens,temperature:0.35}
    })
  });
  const raw=await res.text();
  if(!res.ok) throw new Error(`Gemini ${res.status}: ${raw.slice(0,500)}`);
  let data;try{data=JSON.parse(raw)}catch{throw new Error('Risposta Gemini non JSON.');}
  const text=(data.candidates?.[0]?.content?.parts||[]).map(p=>p.text||'').join('\n').trim();
  if(!text) throw new Error('Nessun testo restituito da Gemini.');
  return parseJSON(text);
}

async function liveToken(p,env){
  const now=Date.now();
  const model=env.GEMINI_LIVE_MODEL || DEFAULT_LIVE_MODEL;
  // Use an unconstrained ephemeral token. The current Gemini v1beta
  // provisioning endpoint accepts the base token fields reliably; the Live
  // model and session configuration are sent by the browser in the first
  // WebSocket setup message. The token is still single-use and short-lived.
  const body={
    uses:1,
    expireTime:new Date(now+30*60*1000).toISOString(),
    newSessionExpireTime:new Date(now+60*1000).toISOString()
  };
  const res=await fetch('https://generativelanguage.googleapis.com/v1beta/auth_tokens',{
    method:'POST',headers:{'x-goog-api-key':env.GEMINI_API_KEY,'Content-Type':'application/json'},body:JSON.stringify(body)
  });
  const raw=await res.text(); if(!res.ok) throw new Error(`Gemini token ${res.status}: ${raw.slice(0,400)}`);
  const data=JSON.parse(raw); if(!data.name) throw new Error('Token Live non restituito.');
  let voice=String(p.voice||'').trim();
  if(!voice && (p.locale||'en-GB')==='en-GB'){
    const v=await britishVoices(env);voice=v.voices?.[0]?.id||'';
    if(!voice)throw new Error('Nessuna voce Gemini en-GB con accento British disponibile nel catalogo.');
  }
  return {token:data.name,model,voice:voice||'Kore',expiresInMinutes:30};
}

async function britishVoices(env){
  const makeUrl=(withContext=true)=>{
    const u=new URL('https://generativelanguage.googleapis.com/v1beta/voices');
    u.searchParams.append('language_code','en-GB');
    u.searchParams.append('accent','British');
    u.searchParams.append('type','prebuilt');
    if(withContext)u.searchParams.append('context','Conversational');
    u.searchParams.set('page_size','30');
    return u;
  };
  let res=await fetch(makeUrl(true),{headers:{'x-goog-api-key':env.GEMINI_API_KEY}});
  let data=res.ok?await res.json():{};
  if(!data.voices?.length){
    res=await fetch(makeUrl(false),{headers:{'x-goog-api-key':env.GEMINI_API_KEY}});
    const raw=await res.text(); if(!res.ok) throw new Error(`Gemini voices ${res.status}: ${raw.slice(0,300)}`); data=JSON.parse(raw);
  }
  const voices=(data.voices||[]).slice(0,20).map(v=>({id:v.id||v.displayName,name:v.displayName||v.id,accent:v.accent||'British',gender:v.gender||'',description:v.description||'',context:v.context||''})).filter(v=>v.id);
  return {voices};
}

async function listeningGenerate(p,env){
  const lang=languageName(p.language), level=p.level||'B1', d=Number(p.difficulty||2);
  const naturalness = d<=1?'clear, careful everyday speech':d===2?'natural everyday speech with common contractions':d===3?'fully natural speech with linking and common idioms':d===4?'fast natural conversational wording, but still fair for the CEFR level':'challenging natural speech with implicit information, reductions and distractors';
  const length = ['A1','A2'].includes(level)?'one sentence, 8-16 words':level==='B1'?'one or two sentences, 15-30 words':level==='B2'?'two short sentences, 25-45 words':'two or three short sentences, 35-60 words';
  const british = p.locale==='en-GB' ? 'For English, use natural contemporary British English wording.' : '';
  const prompt=`Create ONE listening-comprehension item in ${lang} for an Italian-speaking learner at CEFR ${level}.
Internal difficulty ${d}/5: ${naturalness}. Length: ${length}. ${british}
The utterance must sound like real speech, not a grammar exercise. Ask a comprehension question in ${lang} that checks meaning, intention, cause, detail or inference.
Return ONLY JSON: {"text":"...","question":"...","answer":"short reference answer in Italian","topic":"...","focus":"...","vocabulary":["max 3 expressions"]}`;
  const r=await askJSON(env,'You are an expert language teacher specialized in listening comprehension.',prompt,900);requireStrings(r,['text','question','answer']);return r;
}

async function listeningEvaluate(p,env){
  const ex=p.exercise||{}, answer=String(p.answer||'').trim();if(!ex.text||!answer)throw new Error('Dati listening incompleti.');
  const prompt=`Evaluate listening comprehension. PASSAGE: ${ex.text}\nQUESTION: ${ex.question}\nREFERENCE: ${ex.answer}\nLEARNER: ${answer}\nThe learner may answer in Italian or the target language. Judge comprehension, not grammar. Return ONLY JSON {"score":0,"understood":true,"title":"short Italian title","feedbackIt":"concise Italian feedback","missed":["max 3"]}`;
  const r=await askJSON(env,'Grade comprehension fairly and separately from language-production quality.',prompt,700);r.score=clampScore(r.score);r.understood=!!r.understood;r.missed=Array.isArray(r.missed)?r.missed.slice(0,3):[];return r;
}
async function transcriptEvaluate(p,env){
  const target=String(p.target||''),heard=String(p.heard||'');if(!target||!heard)throw new Error('Testo originale o percepito mancante.');
  const prompt=`Compare perceived wording with actual speech. ACTUAL: ${target}\nHEARD: ${heard}\nIgnore punctuation/case. Focus on contractions, function words, connected speech and word boundaries. Return ONLY JSON {"score":0,"feedbackIt":"concise Italian explanation"}`;
  const r=await askJSON(env,'Diagnose listening-perception mismatches precisely.',prompt,600);r.score=clampScore(r.score);return r;
}
async function conversationTurn(p,env){
  const lang=languageName(p.language),level=p.level||'B1',history=(p.history||[]).slice(-12),starter=!!p.starter,userText=String(p.userText||'').trim();
  const hist=history.map(m=>`${m.role==='ai'?'Tutor':'Learner'}: ${m.text}`).join('\n');
  const prompt=`Conduct a natural spoken conversation in ${lang}, CEFR ${level}. ${starter?'Start with one natural opening question.':'Respond naturally and ask one follow-up question.'}\nHistory:\n${hist||'(none)'}\nLatest: ${userText}\nKnown errors:\n${recentErrorSummary(p.recentErrors||[])}\nCorrect only clear errors in the latest learner turn, max 3. Return ONLY JSON {"reply":"...","corrections":[{"category":"Grammar|Vocabulary|Word order|Preposition|Verb tense|Other","original":"...","corrected":"...","explanationIt":"...","example":"..."}]}`;
  const r=await askJSON(env,'Prioritize genuine communication and listening, then targeted correction.',prompt,1000);requireStrings(r,['reply']);r.corrections=Array.isArray(r.corrections)?r.corrections.slice(0,3):[];return r;
}

async function liveReview(p,env){
  const turns=Array.isArray(p.turns)?p.turns.slice(-40):[];if(!turns.length)throw new Error('Nessuna trascrizione disponibile per la revisione.');
  const lang=languageName(p.language),level=p.level||'B1';
  const transcript=turns.map(t=>`${t.role==='user'?'Learner':'Interlocutor'}: ${t.text}`).join('\n');
  const prompt=`Review this real-time spoken conversation for an Italian learner of ${lang}, CEFR ${level}.\n${transcript}\nDo NOT pretend to have acoustic evidence beyond the transcription. Identify only clear learner-language errors; speech-recognition artifacts are possible, so be conservative. Also note useful vocabulary and one next focus. Return ONLY JSON {"summaryIt":"max 90 words","corrections":[{"category":"Grammar|Vocabulary|Word order|Preposition|Verb tense|Other","original":"exact short fragment","corrected":"better fragment","explanationIt":"short Italian explanation","example":"short target-language example"}],"usefulExpressions":[{"expression":"...","meaningIt":"..."}],"nextFocusIt":"..."}`;
  const r=await askJSON(env,'You are a rigorous but conservative language coach reviewing a transcript of a live conversation.',prompt,1400);r.corrections=Array.isArray(r.corrections)?r.corrections.slice(0,6):[];r.usefulExpressions=Array.isArray(r.usefulExpressions)?r.usefulExpressions.slice(0,6):[];return r;
}

async function tts(p,env){
  const text=String(p.text||'').trim();if(!text)throw new Error('Testo TTS mancante.');if(text.length>1200)throw new Error('Testo TTS troppo lungo.');
  let voice=String(p.voice||'').trim();const locale=p.locale||'en-GB';
  if(!voice && locale==='en-GB'){try{voice=(await britishVoices(env)).voices?.[0]?.id||'';}catch{}}
  voice=voice||env.GEMINI_TTS_VOICE||'Kore';
  const style=locale==='en-GB'?'Natural contemporary British English, conversational, normal everyday pace and connected speech.':'Natural conversational speech at a normal pace.';
  const body={model:env.GEMINI_TTS_MODEL||DEFAULT_TTS_MODEL,input:[{type:'user_input',content:[{type:'text',text,annotations:[{type:'speech_metadata',style}]}]}],response_format:{type:'audio'},generation_config:{speech_config:[{voice}]}};
  const res=await fetch('https://generativelanguage.googleapis.com/v1beta/interactions',{method:'POST',headers:{'x-goog-api-key':env.GEMINI_API_KEY,'Content-Type':'application/json'},body:JSON.stringify(body)});
  const raw=await res.text();if(!res.ok)throw new Error(`Gemini TTS ${res.status}: ${raw.slice(0,400)}`);const data=JSON.parse(raw);
  let audio='';
  for(const step of (data.steps||[]))for(const c of (step.content||[]))if(c.type==='audio'&&c.data)audio=c.data;
  if(!audio && data.output_audio?.data)audio=data.output_audio.data;
  if(!audio)throw new Error('Gemini TTS non ha restituito audio.');
  return {audioBase64:audio,mime:'audio/wav',voice};
}

async function pronunciationGenerate(p,env){
  const lang=languageName(p.language),level=p.level||'B1';
  const british=p.locale==='en-GB'?'Use natural British English.':'';
  const prompt=`Create one short pronunciation-practice sentence in ${lang} for CEFR ${level}. ${british} 6-14 words, natural, with one or two useful pronunciation challenges for an Italian speaker. Return ONLY JSON {"text":"...","tipIt":"one concise Italian articulation/rhythm tip, without pretending to have heard the learner"}`;
  const r=await askJSON(env,'Teach pronunciation accurately and do not claim acoustic evidence you do not have.',prompt,500);requireStrings(r,['text','tipIt']);return r;
}
async function pronunciationEvaluate(p,env){
  const target=String(p.target||''),heard=String(p.heard||'');if(!target||!heard)throw new Error('Dati pronuncia incompleti.');
  const prompt=`This is NOT phonetic audio assessment. TARGET: ${target}\nSPEECH RECOGNIZER HEARD: ${heard}\nReturn ONLY JSON {"score":0,"heard":"copy recognizer text","feedbackIt":"concise Italian feedback; explain mismatched words and say this does not measure individual phonemes"}`;
  const r=await askJSON(env,'Evaluate transcript intelligibility conservatively, not phonetic quality.',prompt,500);r.score=clampScore(r.score);r.heard=heard;return r;
}
async function grammarLesson(p,env){
  const lang=languageName(p.language),level=p.level||'B1',errs=(p.errors||[]).slice(0,20);if(!errs.length)throw new Error('Non ci sono errori da analizzare.');
  const list=errs.map((e,i)=>`${i+1}. [${e.category||'Other'}] ${e.original||''} -> ${e.corrected||''}; ${e.explanationIt||''}`).join('\n');
  const prompt=`Build a compact personalized grammar lesson for an Italian-speaking learner of ${lang}, CEFR ${level}, based ONLY on these real corrections:\n${list}\nChoose one supported pattern. Return ONLY JSON {"title":"...","rule":"...","explanationIt":"max 120 words","examples":["3 examples"],"exercises":[{"prompt":"...","answer":"...","explanationIt":"..."},{"prompt":"...","answer":"...","explanationIt":"..."},{"prompt":"...","answer":"...","explanationIt":"..."}]}`;
  const r=await askJSON(env,'Ground the lesson strictly in supplied learner errors.',prompt,1400);requireStrings(r,['title','rule','explanationIt']);r.examples=Array.isArray(r.examples)?r.examples.slice(0,3):[];r.exercises=Array.isArray(r.exercises)?r.exercises.slice(0,3):[];return r;
}
