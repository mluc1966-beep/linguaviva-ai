const LANG_NAMES = { en:'English', fr:'French', es:'Spanish', de:'German' };

export default {
  async fetch(request, env) {
    const cors = {
      'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
      'Access-Control-Allow-Methods': 'POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Cache-Control': 'no-store'
    };
    if (request.method === 'OPTIONS') return new Response(null,{status:204,headers:cors});
    if (request.method !== 'POST') return json({ok:false,error:'Use POST'},405,cors);
    const origin=request.headers.get('Origin');
    if(env.ALLOWED_ORIGIN && origin && origin!==env.ALLOWED_ORIGIN) return json({ok:false,error:'Origin non autorizzata'},403,cors);

    try {
      const body = await request.json();
      const action = body?.action;
      const payload = body?.payload || {};
      if (action === 'health') {
        return json({ok:true,data:{message:`LinguaViva backend attivo · modello ${env.OPENAI_MODEL || 'gpt-5.6-luna'}`}},200,cors);
      }
      if (!env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY non configurata nel Worker.');

      let result;
      switch(action){
        case 'listening_generate': result = await listeningGenerate(payload,env); break;
        case 'listening_evaluate': result = await listeningEvaluate(payload,env); break;
        case 'transcript_evaluate': result = await transcriptEvaluate(payload,env); break;
        case 'conversation_turn': result = await conversationTurn(payload,env); break;
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

async function askJSON(env, instructions, input, maxOutputTokens=1200){
  const model = env.OPENAI_MODEL || 'gpt-5.6-luna';
  const res = await fetch('https://api.openai.com/v1/responses',{
    method:'POST',
    headers:{'Authorization':`Bearer ${env.OPENAI_API_KEY}`,'Content-Type':'application/json'},
    body:JSON.stringify({model,instructions,input,max_output_tokens:maxOutputTokens})
  });
  const raw = await res.text();
  if(!res.ok) throw new Error(`OpenAI ${res.status}: ${raw.slice(0,500)}`);
  let data; try{data=JSON.parse(raw)}catch{throw new Error('Risposta OpenAI non JSON.')}
  const text = extractText(data);
  if(!text) throw new Error('Nessun testo restituito dal modello.');
  return parseJSON(text);
}

function extractText(data){
  if(typeof data.output_text === 'string') return data.output_text;
  const chunks=[];
  for(const item of (data.output||[])){
    for(const c of (item.content||[])){
      if(typeof c.text === 'string') chunks.push(c.text);
    }
  }
  return chunks.join('\n').trim();
}
function parseJSON(text){
  let t=text.trim().replace(/^```json\s*/i,'').replace(/```$/,'').trim();
  try{return JSON.parse(t)}catch{}
  const a=t.indexOf('{'), b=t.lastIndexOf('}');
  if(a>=0 && b>a) return JSON.parse(t.slice(a,b+1));
  throw new Error('Il modello non ha restituito il formato JSON richiesto.');
}
function languageName(code){return LANG_NAMES[code]||'English'}
function recentErrorSummary(errors=[]){
  return errors.slice(0,8).map(e=>`${e.category||'error'}: ${e.original||''} -> ${e.corrected||''}`).join('\n') || 'none';
}

async function listeningGenerate(p,env){
  const lang=languageName(p.language), level=p.level||'B1', d=Number(p.difficulty||2);
  const naturalness = d<=1?'clear, careful everyday speech':d===2?'natural everyday speech with common contractions':d===3?'fully natural speech with linking and common idioms':d===4?'fast natural conversational wording, but still fair for the CEFR level':'challenging natural speech with implicit information, reductions and distractors';
  const length = ['A1','A2'].includes(level)?'one sentence, 8-16 words':level==='B1'?'one or two sentences, 15-30 words':level==='B2'?'two short sentences, 25-45 words':'two or three short sentences, 35-60 words';
  const prompt=`Create ONE listening-comprehension item in ${lang} for an Italian-speaking learner at CEFR ${level}.
Internal difficulty is ${d}/5: ${naturalness}.
Length: ${length}.
The audio text must sound like something a real person would say. Do not make it a grammar exercise disguised as listening. Avoid unsafe or sensitive personal content.
Ask a comprehension question in ${lang} that checks meaning, intention, cause, detail or inference. Do not ask merely to repeat words.
Return ONLY valid JSON with exactly these keys:
{"text":"...","question":"...","answer":"short reference answer in Italian","topic":"...","focus":"what makes this listening challenging","vocabulary":["max 3 useful expressions"]}`;
  const result=await askJSON(env,'You are an expert language teacher specialized in listening comprehension. Produce natural, pedagogically calibrated material.',prompt,900);
  requireStrings(result,['text','question','answer']);
  return result;
}

async function listeningEvaluate(p,env){
  const ex=p.exercise||{}, answer=String(p.answer||'').trim();
  if(!ex.text || !answer) throw new Error('Dati listening incompleti.');
  const prompt=`Evaluate whether an Italian-speaking learner understood this listening passage.
TARGET LANGUAGE PASSAGE: ${ex.text}
QUESTION: ${ex.question}
REFERENCE MEANING/ANSWER: ${ex.answer}
LEARNER ANSWER: ${answer}
The learner may answer in Italian or in the target language. Judge comprehension, not grammar, spelling or style. Minor language mistakes must not reduce the score if the meaning is understood.
Return ONLY JSON:
{"score":0-100,"understood":true/false,"title":"very short Italian title","feedbackIt":"concise Italian feedback","missed":["max 3 important missed ideas"]}`;
  const r=await askJSON(env,'You grade listening comprehension fairly. Separate comprehension from language-production quality.',prompt,700);
  r.score=clampScore(r.score); r.understood=!!r.understood; r.missed=Array.isArray(r.missed)?r.missed.slice(0,3):[];
  return r;
}

async function transcriptEvaluate(p,env){
  const target=String(p.target||''), heard=String(p.heard||'');
  if(!target||!heard) throw new Error('Testo originale o percepito mancante.');
  const prompt=`Compare what the learner THINKS they heard with the actual spoken sentence.
ACTUAL: ${target}
HEARD/TRANSCRIBED BY LEARNER: ${heard}
Estimate how much of the spoken wording was perceived. Do not require punctuation or capitalization. Give special attention to missing contractions, function words, connected-speech reductions and word-boundary mistakes.
Return ONLY JSON:
{"score":0-100,"feedbackIt":"concise Italian explanation of the main perceptual mismatch; if useful quote only short fragments"}`;
  const r=await askJSON(env,'You diagnose listening perception errors. Be precise and encouraging without inflating scores.',prompt,650);
  r.score=clampScore(r.score);return r;
}

async function conversationTurn(p,env){
  const lang=languageName(p.language), level=p.level||'B1';
  let history=(p.history||[]).slice(-12);
  if(!p.starter && history.length && history[history.length-1]?.role==='user' && history[history.length-1]?.text===p.userText) history=history.slice(0,-1);
  const starter=!!p.starter;
  const errors=recentErrorSummary(p.recentErrors||[]);
  const historyText=history.map(m=>`${m.role==='ai'?'Tutor':'Learner'}: ${m.text}`).join('\n');
  const userText=String(p.userText||'').trim();
  const prompt=`You are conducting a spoken conversation in ${lang} with an Italian learner at CEFR ${level}.
This product is LISTENING-FIRST. Your spoken reply should be natural and normally 1-3 short sentences. Ask one follow-up question that keeps a real conversation going. Do not lecture unless the learner asks.
${starter?'Start a fresh everyday conversation with one natural opening question.':'Respond naturally to the learner and continue the conversation.'}
Use vocabulary at the learner's level, with occasional slightly harder natural expressions. Avoid switching to Italian in the spoken reply.

Conversation so far:
${historyText || '(none)'}
${starter?'':`Latest learner turn: ${userText}`}

Known recurring errors (use only as background; do not force them):
${errors}

Corrections: analyze ONLY the latest learner turn. Correct clear grammar, word choice, or sentence-structure errors that matter. Do not over-correct punctuation, speech-recognition artifacts, stylistic alternatives, or harmless non-native phrasing. Maximum 3 corrections. Explanations must be in Italian.
Return ONLY JSON:
{"reply":"spoken reply in ${lang}","corrections":[{"category":"Grammar|Vocabulary|Word order|Preposition|Verb tense|Other","original":"exact short fragment","corrected":"better fragment","explanationIt":"short explanation in Italian","example":"one short example in ${lang}"}]}`;
  const r=await askJSON(env,'You are a warm but rigorous conversation teacher. Prioritize genuine communication and listening, then targeted correction.',prompt,1100);
  if(typeof r.reply!=='string'||!r.reply.trim())throw new Error('Risposta conversazione vuota.');
  r.corrections=Array.isArray(r.corrections)?r.corrections.slice(0,3):[];
  return r;
}

function requireStrings(obj,keys){for(const k of keys)if(typeof obj?.[k]!=='string'||!obj[k].trim())throw new Error(`Campo AI mancante: ${k}`)}
function clampScore(v){const n=Number(v);return Number.isFinite(n)?Math.max(0,Math.min(100,Math.round(n))):0}


async function tts(p,env){
  const text=String(p.text||'').trim();
  if(!text) throw new Error('Testo TTS mancante.');
  if(text.length>900) throw new Error('Testo TTS troppo lungo.');
  const res=await fetch('https://api.openai.com/v1/audio/speech',{
    method:'POST',
    headers:{'Authorization':`Bearer ${env.OPENAI_API_KEY}`,'Content-Type':'application/json'},
    body:JSON.stringify({model:env.OPENAI_TTS_MODEL||'gpt-4o-mini-tts',voice:env.OPENAI_TTS_VOICE||'alloy',input:text,response_format:'mp3'})
  });
  if(!res.ok) throw new Error(`OpenAI TTS ${res.status}: ${(await res.text()).slice(0,400)}`);
  const buf=new Uint8Array(await res.arrayBuffer());
  let binary=''; const chunk=0x8000;
  for(let i=0;i<buf.length;i+=chunk) binary+=String.fromCharCode(...buf.subarray(i,i+chunk));
  return {audioBase64:btoa(binary),mime:'audio/mpeg'};
}

async function pronunciationGenerate(p,env){
  const lang=languageName(p.language), level=p.level||'B1';
  const prompt=`Create one short pronunciation-practice sentence in ${lang} for CEFR ${level}. It should sound natural and contain one or two useful pronunciation challenges typical for an Italian speaker, but remain easy enough to repeat after hearing it. 6-14 words. Return ONLY JSON: {"text":"...","tipIt":"one concise Italian articulation/rhythm tip that is generally true for this sentence, without pretending to have heard the learner"}`;
  const r=await askJSON(env,'You teach pronunciation accurately and never claim to hear audio you have not received.',prompt,500);
  requireStrings(r,['text','tipIt']);return r;
}

async function pronunciationEvaluate(p,env){
  const target=String(p.target||''),heard=String(p.heard||'');
  if(!target||!heard)throw new Error('Dati pronuncia incompleti.');
  const confidence=Number(p.confidence||0);
  const prompt=`This is NOT phonetic audio assessment. Evaluate only intelligibility from speech-recognition output.
TARGET: ${target}
SPEECH RECOGNIZER HEARD: ${heard}
RECOGNIZER CONFIDENCE (may be unavailable/unreliable): ${confidence}
Return ONLY JSON {"score":0-100,"heard":"copy the recognizer text","feedbackIt":"concise Italian feedback. Explain mismatched words and say that this does not measure individual phonemes."}`;
  const r=await askJSON(env,'You evaluate transcript intelligibility conservatively. Never call this a phonetic score.',prompt,550);
  r.score=clampScore(r.score);r.heard=heard;return r;
}

async function grammarLesson(p,env){
  const lang=languageName(p.language), level=p.level||'B1';
  const errs=(p.errors||[]).slice(0,20);
  if(!errs.length)throw new Error('Non ci sono errori da analizzare.');
  const list=errs.map((e,i)=>`${i+1}. [${e.category||'Other'}] ${e.original||''} -> ${e.corrected||''}; ${e.explanationIt||''}`).join('\n');
  const prompt=`Build a compact personalized grammar lesson for an Italian-speaking learner of ${lang}, CEFR ${level}, based ONLY on these real correction records:
${list}
Choose the most recurrent or pedagogically useful pattern. Do not invent a recurring weakness if the examples do not support it. If examples are heterogeneous, choose one clearly supported pattern and say it is the focus of this lesson.
Return ONLY JSON:
{"title":"short Italian title","rule":"one-line rule","explanationIt":"clear Italian explanation, max 120 words","examples":["3 target-language example sentences"],"exercises":[{"prompt":"exercise in Italian/target language","answer":"correct answer","explanationIt":"short rationale"},{"prompt":"...","answer":"...","explanationIt":"..."},{"prompt":"...","answer":"...","explanationIt":"..."}]}`;
  const r=await askJSON(env,'You are a precise grammar teacher. Ground the lesson in the supplied learner errors.',prompt,1400);
  requireStrings(r,['title','rule','explanationIt']);
  r.examples=Array.isArray(r.examples)?r.examples.slice(0,3):[];
  r.exercises=Array.isArray(r.exercises)?r.exercises.slice(0,3):[];
  return r;
}
