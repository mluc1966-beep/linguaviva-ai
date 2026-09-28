'use strict';

const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => [...root.querySelectorAll(sel)];
const esc = (s='') => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const clamp = (n,min,max) => Math.max(min,Math.min(max,n));
const uid = () => `${Date.now()}_${Math.random().toString(36).slice(2,8)}`;

const LANGS = {
  en:{name:'Inglese', locale:'en-GB', accents:[['en-GB','Britannico'],['en-US','Americano'],['en-AU','Australiano']]},
  fr:{name:'Francese', locale:'fr-FR', accents:[['fr-FR','Francia']]},
  es:{name:'Spagnolo', locale:'es-ES', accents:[['es-ES','Spagna'],['es-MX','Messico']]},
  de:{name:'Tedesco', locale:'de-DE', accents:[['de-DE','Germania']]}
};

const DEFAULTS = {
  backendUrl:'', language:'en', locale:'en-GB', level:'B1', speed:1,
  correctionMode:'delayed', dailyGoal:15, userName:'', listeningDifficulty:2,
  hideAiText:true, aiVoice:true, voice:'', londonStyle:'natural'
};
const DEFAULT_STATS = {listeningAttempts:0,listeningCorrect:0,listeningScoreSum:0,conversationTurns:0,hints:0,reveals:0,slowPlays:0,lastStudyDate:'',streak:0,sessions:0};
const SAMPLE = {
  en:{text:'I was going to call you after work, but the meeting ran much later than I expected.',question:'Why did the speaker not call after work?',answer:'Because the meeting finished much later than expected.',focus:'past intention and unexpected delay'},
  fr:{text:"Je voulais t'appeler après le travail, mais la réunion a duré beaucoup plus longtemps que prévu.",question:"Pourquoi la personne n'a-t-elle pas appelé après le travail ?",answer:'Parce que la réunion a fini beaucoup plus tard que prévu.',focus:'intention au passé'},
  es:{text:'Iba a llamarte después del trabajo, pero la reunión duró mucho más de lo que esperaba.',question:'¿Por qué no llamó la persona después del trabajo?',answer:'Porque la reunión terminó mucho más tarde de lo esperado.',focus:'iba a + infinitivo'},
  de:{text:'Ich wollte dich nach der Arbeit anrufen, aber die Besprechung dauerte viel länger als erwartet.',question:'Warum hat die Person nach der Arbeit nicht angerufen?',answer:'Weil die Besprechung viel länger dauerte als erwartet.',focus:'Vergangenheit und Absicht'}
};

const store = {
  get(k, fallback){ try{return JSON.parse(localStorage.getItem(`lv_${k}`)) ?? fallback}catch{return fallback}},
  set(k,v){localStorage.setItem(`lv_${k}`,JSON.stringify(v))}
};

let settings = {...DEFAULTS,...store.get('settings',{})};
let stats = {...DEFAULT_STATS,...store.get('stats',{})};
let errors = store.get('errors',[]);
let listening = null;
let conversation = store.get('conversation',[]).slice(-20);
let deferredInstall = null;
let activeRecognition = null;
let startSessionAt = Date.now();
const audioCache = new Map();
let pronunciation = null;
let grammarLesson = null;

function saveAll(){ store.set('settings',settings);store.set('stats',stats);store.set('errors',errors);store.set('conversation',conversation.slice(-20)); }
function markStudy(){
  const today = new Date().toISOString().slice(0,10);
  if(stats.lastStudyDate!==today){
    const y = new Date(); y.setDate(y.getDate()-1); const yesterday=y.toISOString().slice(0,10);
    stats.streak = stats.lastStudyDate===yesterday ? stats.streak+1 : 1;
    stats.lastStudyDate=today; stats.sessions++; saveAll();
  }
}
function accuracy(){ return stats.listeningAttempts ? Math.round((stats.listeningCorrect/stats.listeningAttempts)*100) : 0; }
function avgScore(){ return stats.listeningAttempts ? Math.round(stats.listeningScoreSum/stats.listeningAttempts) : 0; }

async function api(action, payload={}){
  if(!settings.backendUrl) throw new Error('BACKEND_NOT_SET');
  const ctrl = new AbortController(); const timer=setTimeout(()=>ctrl.abort(),45000);
  try{
    const r = await fetch(settings.backendUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,payload}),signal:ctrl.signal});
    const txt = await r.text();
    let data; try{data=JSON.parse(txt)}catch{throw new Error(`Risposta backend non valida: ${txt.slice(0,160)}`)}
    if(!data.ok) throw new Error(data.error||'Errore backend');
    return data.data;
  } finally {clearTimeout(timer)}
}

function speak(text, rate=settings.speed, locale=settings.locale){
  return new Promise((resolve,reject)=>{
    if(!('speechSynthesis' in window)) return reject(new Error('Sintesi vocale non supportata'));
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text); u.lang=locale; u.rate=rate; u.pitch=1;
    const voices=speechSynthesis.getVoices();
    const exact=voices.find(v=>v.lang.toLowerCase()===locale.toLowerCase());
    const lang=voices.find(v=>v.lang.toLowerCase().startsWith(locale.slice(0,2).toLowerCase()));
    if(exact||lang) u.voice=exact||lang;
    u.onend=resolve; u.onerror=e=>reject(e.error||e);
    speechSynthesis.speak(u);
  });
}
async function playAudioText(text, rate=settings.speed, locale=settings.locale){
  if(settings.aiVoice && settings.backendUrl){
    try{
      const key=`${text}__${locale}__${settings.voice||''}`;
      let payload=audioCache.get(key);
      if(!payload){payload=await api('tts',{text,locale,voice:settings.voice||''});audioCache.set(key,payload);}
      const bytes=Uint8Array.from(atob(payload.audioBase64),c=>c.charCodeAt(0));
      const blob=new Blob([bytes],{type:payload.mime||'audio/mpeg'});
      const url=URL.createObjectURL(blob); const audio=new Audio(url); audio.playbackRate=rate;
      await audio.play();
      await new Promise((resolve,reject)=>{audio.onended=resolve;audio.onerror=()=>reject(new Error('Riproduzione audio AI non riuscita.'));});
      URL.revokeObjectURL(url); return;
    }catch(e){console.warn('TTS AI non disponibile, uso voce dispositivo:',e);}
  }
  return speak(text,rate,locale);
}
function recognitionSupported(){return !!(window.SpeechRecognition||window.webkitSpeechRecognition)}
function recognize(locale=settings.locale){
  return new Promise((resolve,reject)=>{
    const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!SR) return reject(new Error('Il riconoscimento vocale non è disponibile in questo browser. Puoi comunque scrivere la risposta.'));
    if(activeRecognition){try{activeRecognition.abort()}catch{}}
    const rec=new SR(); activeRecognition=rec; rec.lang=locale;rec.interimResults=false;rec.maxAlternatives=1;rec.continuous=false;
    rec.onresult=e=>resolve({text:e.results[0][0].transcript,confidence:e.results[0][0].confidence});
    rec.onerror=e=>reject(new Error(e.error==='not-allowed'?'Permesso microfono negato.':`Riconoscimento vocale: ${e.error}`));
    rec.onend=()=>{activeRecognition=null}; rec.start();
  });
}

function setRoute(route){
  location.hash=route; render();
}
function route(){return (location.hash||'#home').slice(1)}
function navState(){ $$('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.route===route())); }

function render(){
  navState(); const r=route();
  const fn={home:renderHome,listening:renderListening,conversation:renderConversation,notebook:renderNotebook,pronunciation:renderPronunciation,grammar:renderGrammar,settings:renderSettings}[r]||renderHome;
  fn(); window.scrollTo({top:0,behavior:'smooth'});
}

function renderHome(){
  const backend = settings.backendUrl ? '<span class="pill good"><span class="status-dot ok"></span> Gemini Free collegato</span>' : '<span class="pill warn"><span class="status-dot"></span> Configura backend</span>';
  $('#app').innerHTML=`
    <section class="hero">
      <div class="kicker" style="color:#93c5fd">${esc(LANGS[settings.language].name)} · ${settings.level}</div>
      <h1>Prima ascolta.<br>Poi capisci davvero.</h1>
      <p>Allenamento centrato sulla comprensione del parlato naturale. La trascrizione rimane nascosta finché non serve davvero.</p>
      <div class="hero-actions">
        <button class="primary large" id="startListening">🎧 Inizia listening</button>
        <button class="ghost large" id="startConversation">🗣 Conversazione</button>
      </div>
    </section>
    <div class="grid-3">
      <div class="card"><div class="kicker">Comprensione</div><div class="metric">${accuracy()}%</div><div class="muted">${stats.listeningAttempts} esercizi</div></div>
      <div class="card"><div class="kicker">Punteggio medio</div><div class="metric">${avgScore()}</div><div class="muted">su 100</div></div>
      <div class="card"><div class="kicker">Continuità</div><div class="metric">${stats.streak}</div><div class="muted">giorni consecutivi</div></div>
    </div>
    <div class="section-title"><h2>Oggi</h2>${backend}</div>
    <div class="grid">
      <div class="card">
        <h3>🎧 Listening adattivo</h3>
        <p class="muted">Difficoltà interna ${settings.listeningDifficulty}/5. L'app la modifica in base a risposta, ripetizioni, rallentamenti e trascrizione.</p>
        <div class="progress"><span style="width:${settings.listeningDifficulty*20}%"></span></div>
      </div>
      <div class="card">
        <h3>📘 Quaderno errori</h3>
        <p class="muted">${errors.length ? `${errors.length} elementi salvati da rivedere.` : 'Nessun errore salvato per ora.'}</p>
        <button class="secondary" id="reviewErrors">Apri quaderno</button>
      </div>
    </div>
    <div class="grid">
      <div class="card"><h3>🔤 Pronuncia</h3><p class="muted">Ascolta, ripeti e controlla se la frase viene riconosciuta correttamente.</p><button class="secondary" id="openPron">Allenati</button></div>
      <div class="card"><h3>🎓 Grammatica dai tuoi errori</h3><p class="muted">Trasforma le correzioni reali in una mini-lezione personale.</p><button class="secondary" id="openGrammar">Crea lezione</button></div>
    </div>
    ${!settings.backendUrl?`<div class="notice warning" style="margin-top:14px"><strong>Modalità locale attiva.</strong> Per London Live, correzioni e audio naturale collega il backend gratuito Gemini nelle Impostazioni.</div>`:''}
  `;
  $('#startListening').onclick=()=>setRoute('listening');
  $('#startConversation').onclick=()=>setRoute('conversation');
  $('#reviewErrors').onclick=()=>setRoute('notebook');
  $('#openPron').onclick=()=>setRoute('pronunciation');
  $('#openGrammar').onclick=()=>setRoute('grammar');
}

function renderListening(){
  if(!listening){
    $('#app').innerHTML=`
      <div class="section-title"><h2>🎧 Comprensione orale</h2><span class="pill">${settings.level} · difficoltà ${settings.listeningDifficulty}/5</span></div>
      <div class="card audio-stage">
        <div class="audio-orb">▶</div>
        <h2>Niente sottotitoli</h2>
        <p class="muted">Ascolta una situazione naturale. Dopo l'audio ti farò una domanda per verificare se hai colto il significato.</p>
        <button class="primary large" id="newListen">Genera esercizio</button>
      </div>`;
    $('#newListen').onclick=startListening;
    return;
  }
  const revealed=listening.revealed;
  $('#app').innerHTML=`
    <div class="section-title"><h2>🎧 Listening</h2><span class="pill">${settings.level} · ${listening.plays} ascolti</span></div>
    <div class="card audio-stage">
      <div class="audio-orb" id="audioOrb">🔊</div>
      <h3>${revealed?'Trascrizione disponibile':'Ascolta senza leggere'}</h3>
      ${revealed?`<div class="transcript">${esc(listening.exercise.text)}</div>`:'<p class="muted">Il testo resta nascosto. Concentrati sul significato generale, non su ogni singola parola.</p>'}
      <div class="row" style="justify-content:center;margin-top:16px">
        <button class="primary" id="playNormal">▶ Ascolta</button>
        <button class="secondary" id="playSlow">🐢 Più lento</button>
        ${!revealed?'<button class="ghost" id="revealText">Mostra testo</button>':''}
      </div>
    </div>
    <div class="card" style="margin-top:14px">
      <div class="kicker">Domanda di comprensione</div>
      <h3>${esc(listening.exercise.question)}</h3>
      <div class="field"><label>Rispondi nella lingua che stai studiando o in italiano</label><textarea id="listenAnswer" placeholder="Scrivi oppure usa il microfono...">${esc(listening.userAnswer||'')}</textarea></div>
      <div class="row" style="margin-top:12px">
        <button class="microphone" id="listenMic" title="Rispondi a voce">🎙</button>
        <button class="primary" id="checkListen">Valuta comprensione</button>
      </div>
      <div id="listenFeedback">${renderListeningFeedback()}</div>
    </div>
    <div class="card" style="margin-top:14px">
      <div class="kicker">Dettato percettivo</div>
      <h3>Che cosa hai sentito?</h3>
      <p class="muted">Opzionale: prova a ricostruire la frase. Serve a scoprire dove il parlato naturale “sparisce” all'orecchio.</p>
      <div class="field"><textarea id="heardText" placeholder="Scrivi ciò che pensi di aver sentito...">${esc(listening.heardText||'')}</textarea></div>
      <button class="secondary" id="checkHeard" style="margin-top:10px">Confronta con l'originale</button>
      <div id="heardFeedback">${listening.heardFeedback?renderHeardFeedback():''}</div>
    </div>
    <div class="row between" style="margin-top:14px">
      <button class="ghost" id="resetListen">Nuovo esercizio</button>
      ${listening.feedback?'<button class="primary" id="nextListen">Prossimo →</button>':''}
    </div>`;
  $('#playNormal').onclick=()=>playListening(settings.speed,false);
  $('#playSlow').onclick=()=>playListening(Math.max(.65,settings.speed*.78),true);
  if($('#revealText')) $('#revealText').onclick=()=>{listening.revealed=true;stats.reveals++;saveAll();renderListening()};
  $('#listenMic').onclick=()=>micInto('#listenAnswer','#listenMic');
  $('#checkListen').onclick=evaluateListening;
  $('#checkHeard').onclick=evaluateHeard;
  $('#resetListen').onclick=()=>{listening=null;renderListening()};
  if($('#nextListen')) $('#nextListen').onclick=()=>{listening=null;startListening()};
}
function renderListeningFeedback(){
  if(!listening?.feedback) return '';
  const f=listening.feedback; const cls=f.score>=80?'good':f.score>=55?'warn':'bad';
  return `<div class="answer-box feedback ${cls}" style="margin-top:14px"><div class="row between"><strong>${esc(f.title||'Valutazione')}</strong><span class="pill ${cls}">${f.score}/100</span></div><p>${esc(f.feedbackIt||'')}</p>${f.missed?.length?`<div class="muted"><strong>Da cogliere:</strong> ${f.missed.map(esc).join(' · ')}</div>`:''}</div>`;
}
function renderHeardFeedback(){
  const f=listening.heardFeedback; return `<div class="answer-box feedback ${f.score>=80?'good':f.score>=55?'warn':'bad'}" style="margin-top:12px"><div class="row between"><strong>Percezione del testo</strong><span class="pill">${f.score}/100</span></div><p>${esc(f.feedbackIt||'')}</p>${listening.revealed?'':`<button class="ghost" id="revealAfterHeard" onclick="window.__lvReveal()">Mostra trascrizione</button>`}</div>`;
}
window.__lvReveal=()=>{if(listening){listening.revealed=true;stats.reveals++;saveAll();renderListening()}};

async function startListening(){
  markStudy();
  $('#app').innerHTML=`<div class="card audio-stage"><div class="audio-orb speaking">…</div><h2>Creo un ascolto adatto a te</h2><p class="muted">Livello ${settings.level}, difficoltà ${settings.listeningDifficulty}/5</p></div>`;
  try{
    let ex;
    if(settings.backendUrl){
      ex=await api('listening_generate',{language:settings.language,locale:settings.locale,level:settings.level,difficulty:settings.listeningDifficulty,recentErrors:errors.slice(0,8)});
    }else{
      const s=SAMPLE[settings.language]; ex={...s,id:uid(),topic:'daily life'};
    }
    listening={exercise:ex,plays:0,slowPlays:0,revealed:false,userAnswer:'',heardText:'',feedback:null,heardFeedback:null};
    renderListening(); setTimeout(()=>playListening(settings.speed,false),250);
  }catch(err){showFatal('Non riesco a creare l’esercizio',err)}
}
async function playListening(rate,slow){
  if(!listening) return; listening.plays++; if(slow){listening.slowPlays++;stats.slowPlays++;}
  const orb=$('#audioOrb'); if(orb)orb.classList.add('speaking');
  try{await playAudioText(listening.exercise.text,rate,settings.locale)}catch(err){alert(err.message||err)}finally{if(orb)orb.classList.remove('speaking');saveAll()}
}
async function evaluateListening(){
  const answer=$('#listenAnswer').value.trim(); if(!answer)return alert('Scrivi o pronuncia una risposta prima di valutarla.');
  listening.userAnswer=answer; const btn=$('#checkListen');btn.disabled=true;btn.textContent='Valuto…';
  try{
    let f;
    if(settings.backendUrl){f=await api('listening_evaluate',{exercise:listening.exercise,answer,language:settings.language,level:settings.level})}
    else{
      const tokens=answer.toLowerCase().split(/\W+/); const key=['meeting','riunione','late','later','tardi','lunga','long']; const hit=key.some(k=>tokens.some(t=>t.includes(k))); f={score:hit?85:45,understood:hit,title:hit?'Hai colto il punto':'Riascolta il motivo',feedbackIt:hit?'Hai identificato correttamente la causa principale.':'La risposta dovrebbe concentrarsi sul fatto che la riunione è durata più del previsto.',missed:hit?[]:['la riunione è finita tardi']};
    }
    listening.feedback=f; stats.listeningAttempts++;stats.listeningScoreSum+=Number(f.score||0);if(f.score>=75)stats.listeningCorrect++;
    adaptDifficulty(f.score); markStudy();saveAll();renderListening();
  }catch(err){alert(err.message||err);btn.disabled=false;btn.textContent='Valuta comprensione'}
}
function adaptDifficulty(score){
  let delta=0;
  if(score>=88 && listening.plays<=2 && !listening.revealed && listening.slowPlays===0) delta=1;
  if(score<55 || listening.revealed || listening.slowPlays>=2) delta=-1;
  settings.listeningDifficulty=clamp(settings.listeningDifficulty+delta,1,5);
}
async function evaluateHeard(){
  const heard=$('#heardText').value.trim();if(!heard)return alert('Scrivi prima ciò che hai percepito.'); listening.heardText=heard;
  try{
    if(settings.backendUrl) listening.heardFeedback=await api('transcript_evaluate',{target:listening.exercise.text,heard,language:settings.language,locale:settings.locale});
    else listening.heardFeedback=localTextSimilarity(listening.exercise.text,heard);
    renderListening();
  }catch(err){alert(err.message||err)}
}
function localTextSimilarity(a,b){
  const A=normalize(a).split(' '),B=normalize(b).split(' '); const hit=A.filter(x=>B.includes(x)).length;const score=Math.round(100*hit/Math.max(1,A.length));
  return {score,feedbackIt:score>=80?'Hai percepito quasi tutta la frase.':score>=55?'Hai colto una buona parte, ma alcune parole o forme ridotte si sono perse.':'La percezione è ancora frammentaria: riascolta e cerca prima i blocchi di significato.'};
}
function normalize(s){return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9à-ÿäöüß' ]/gi,' ').replace(/\s+/g,' ').trim()}

function renderConversation(){
  $('#app').innerHTML=`
    <div class="section-title"><h2>🗣 Conversazione</h2><span class="pill">testo AI ${settings.hideAiText?'nascosto':'visibile'}</span></div>
    <div class="notice">L'AI ti parla nella lingua scelta. Il suo testo resta nascosto per obbligare l'orecchio a lavorare; puoi mostrarlo solo quando serve.</div>
    <div class="card" style="margin-top:12px"><div class="chat" id="chat">${renderChat()}</div></div>
    <div class="card" style="margin-top:12px">
      <div class="field"><label>La tua risposta</label><textarea id="chatInput" placeholder="Parla oppure scrivi..."></textarea></div>
      <div class="row between" style="margin-top:12px"><button class="microphone" id="chatMic">🎙</button><button class="primary" id="sendChat">Invia</button></div>
    </div>
    <div class="row between" style="margin-top:12px"><button class="ghost" id="newChat">Nuova conversazione</button><button class="secondary" id="starter">Fai partire l'AI</button></div>
  `;
  bindChatTools();
  $('#chatMic').onclick=()=>micInto('#chatInput','#chatMic');
  $('#sendChat').onclick=sendConversation;
  $('#newChat').onclick=()=>{if(confirm('Azzerare la conversazione corrente?')){conversation=[];saveAll();renderConversation()}};
  $('#starter').onclick=()=>sendConversation(true);
}
function renderChat(){
  if(!conversation.length) return `<div class="empty">Premi <strong>Fai partire l'AI</strong>. Riceverai la prima domanda solo in audio.</div>`;
  return conversation.map((m,i)=>{
    if(m.role==='user') return `<div class="bubble user">${esc(m.text)}</div>`;
    const hidden=settings.hideAiText && !m.revealed;
    return `<div class="bubble ai ${hidden?'hidden-text':''}" data-ai-index="${i}">${hidden?'🔊 Messaggio AI: ascolta senza leggere':esc(m.text)}<div class="chat-tools"><button data-replay="${i}">▶ Riascolta</button>${hidden?`<button data-reveal="${i}">Mostra testo</button>`:''}</div>${m.corrections?.length?`<div class="stack" style="margin-top:10px">${m.corrections.map(renderCorrection).join('')}</div>`:''}</div>`;
  }).join('');
}
function renderCorrection(c){return `<div class="correction"><strong>${esc(c.category||'Correzione')}</strong><span class="bad-text">${esc(c.original||'')}</span> → <span class="good-text">${esc(c.corrected||'')}</span><div class="muted">${esc(c.explanationIt||'')}</div></div>`}
function bindChatTools(){
  $$('[data-replay]').forEach(b=>b.onclick=()=>{const m=conversation[Number(b.dataset.replay)];playAudioText(m.text,settings.speed,settings.locale)});
  $$('[data-reveal]').forEach(b=>b.onclick=()=>{conversation[Number(b.dataset.reveal)].revealed=true;stats.reveals++;saveAll();renderConversation()});
}
async function sendConversation(starter=false){
  const input=$('#chatInput'); const text=starter?'':input.value.trim(); if(!starter&&!text)return;
  if(!settings.backendUrl)return alert('Per la conversazione libera serve il backend AI. Apri Impostazioni e inserisci l’URL del Worker.');
  if(!starter){conversation.push({role:'user',text});stats.conversationTurns++;input.value='';}
  markStudy(); saveAll(); renderConversation();
  const chat=$('#chat');chat.insertAdjacentHTML('beforeend','<div class="bubble ai">Sto pensando…</div>');
  try{
    const result=await api('conversation_turn',{language:settings.language,locale:settings.locale,level:settings.level,history:conversation.slice(-12).map(({role,text})=>({role,text})),userText:text,starter,recentErrors:errors.slice(0,10)});
    const corrections=result.corrections||[];
    corrections.forEach(c=>errors.unshift({...c,id:uid(),createdAt:new Date().toISOString(),source:'conversation'}));
    conversation.push({role:'ai',text:result.reply,corrections,revealed:!settings.hideAiText});
    saveAll();renderConversation(); setTimeout(()=>playAudioText(result.reply,settings.speed,settings.locale),150);
  }catch(err){conversation.push({role:'ai',text:`Errore di collegamento: ${err.message||err}`,revealed:true});saveAll();renderConversation()}
}

function renderNotebook(){
  const categories=[...new Set(errors.map(e=>e.category).filter(Boolean))];
  $('#app').innerHTML=`
    <div class="section-title"><h2>📘 Quaderno degli errori</h2><span class="pill">${errors.length} elementi</span></div>
    ${categories.length?`<div class="row" style="margin-bottom:12px">${categories.map(c=>`<span class="pill">${esc(c)}</span>`).join('')}</div>`:''}
    <div class="stack">${errors.length?errors.map((e,i)=>`<div class="error-item"><div class="row between"><span class="kicker">${esc(e.category||'Errore')}</span><button class="ghost" data-del-error="${i}">Elimina</button></div><div><span class="bad-text">${esc(e.original||'')}</span></div><div class="good-text">${esc(e.corrected||'')}</div><p class="muted">${esc(e.explanationIt||'')}</p>${e.example?`<div class="transcript">${esc(e.example)}</div>`:''}</div>`).join(''):'<div class="card empty">Gli errori corretti durante le conversazioni compariranno qui automaticamente.</div>'}</div>
    ${errors.length?'<button class="danger" id="clearErrors" style="margin-top:16px">Svuota quaderno</button>':''}`;
  $$('[data-del-error]').forEach(b=>b.onclick=()=>{errors.splice(Number(b.dataset.delError),1);saveAll();renderNotebook()});
  if($('#clearErrors'))$('#clearErrors').onclick=()=>{if(confirm('Eliminare tutti gli errori salvati?')){errors=[];saveAll();renderNotebook()}};
}

function renderPronunciation(){
  $('#app').innerHTML=`
    <div class="section-title"><h2>🔤 Pronuncia assistita</h2><span class="pill">${settings.level}</span></div>
    <div class="notice warning"><strong>Misura onesta:</strong> questa sezione valuta se la tua frase viene riconosciuta e quanto coincide con il modello. Non è ancora un punteggio fonetico sui singoli fonemi.</div>
    ${pronunciation?`<div class="card audio-stage" style="margin-top:12px"><div class="audio-orb">🔊</div><div class="transcript">${esc(pronunciation.text)}</div><p class="muted">${esc(pronunciation.tipIt||'Ascolta il modello, poi ripeti senza leggere se riesci.')}</p><div class="row" style="justify-content:center"><button class="primary" id="pronPlay">▶ Modello</button><button class="microphone" id="pronMic">🎙</button></div>${pronunciation.result?`<div class="answer-box feedback ${pronunciation.result.score>=80?'good':pronunciation.result.score>=55?'warn':'bad'}" style="margin-top:16px"><div class="row between"><strong>Intelligibilità</strong><span class="pill">${pronunciation.result.score}/100</span></div><p>Riconosciuto: <strong>${esc(pronunciation.result.heard)}</strong></p><p>${esc(pronunciation.result.feedbackIt||'')}</p></div>`:''}</div>`:`<div class="card audio-stage" style="margin-top:12px"><div class="audio-orb">Aa</div><h3>Una frase alla volta</h3><p class="muted">Genero una frase breve con suoni e ritmo adatti al tuo livello.</p><button class="primary large" id="pronNew">Genera frase</button></div>`}
    ${pronunciation?'<button class="ghost full" id="pronNext" style="margin-top:12px">Nuova frase</button>':''}`;
  if($('#pronNew'))$('#pronNew').onclick=startPronunciation;
  if($('#pronNext'))$('#pronNext').onclick=startPronunciation;
  if($('#pronPlay'))$('#pronPlay').onclick=()=>playAudioText(pronunciation.text,settings.speed,settings.locale);
  if($('#pronMic'))$('#pronMic').onclick=recordPronunciation;
}

async function startPronunciation(){
  if(!settings.backendUrl){
    pronunciation={text:SAMPLE[settings.language].text.split(/[.!?]/)[0],tipIt:'Usa il modello audio e prova a far riconoscere la frase al browser.'};
    renderPronunciation(); return;
  }
  $('#app').innerHTML='<div class="card audio-stage"><div class="audio-orb speaking">…</div><h2>Preparo la frase</h2></div>';
  try{
    pronunciation=await api('pronunciation_generate',{language:settings.language,locale:settings.locale,level:settings.level,recentErrors:errors.slice(0,6)});
    renderPronunciation(); setTimeout(()=>playAudioText(pronunciation.text,settings.speed,settings.locale),150);
  }catch(e){showFatal('Non riesco a creare l’esercizio di pronuncia',e)}
}

async function recordPronunciation(){
  const btn=$('#pronMic');btn.classList.add('listening');
  try{
    const r=await recognize(settings.locale); let result;
    if(settings.backendUrl) result=await api('pronunciation_evaluate',{target:pronunciation.text,heard:r.text,confidence:r.confidence,language:settings.language});
    else result={...localTextSimilarity(pronunciation.text,r.text),heard:r.text};
    result.heard=result.heard||r.text; pronunciation.result=result; renderPronunciation();
  }catch(e){alert(e.message||e)}finally{btn?.classList.remove('listening')}
}

function renderGrammar(){
  $('#app').innerHTML=`
    <div class="section-title"><h2>🎓 Grammatica personale</h2><span class="pill">da ${errors.length} errori</span></div>
    ${!errors.length?'<div class="card empty">Prima conversa un po’: quando l’AI corregge errori reali, li useremo per costruire la lezione.</div>':grammarLesson?renderGrammarLesson():`<div class="card"><h3>Una lezione costruita sui tuoi errori</h3><p class="muted">Seleziono il pattern più ricorrente o più utile e creo una spiegazione breve, esempi e tre esercizi.</p><button class="primary" id="makeGrammar">Genera mini-lezione</button></div>`}`;
  if($('#makeGrammar'))$('#makeGrammar').onclick=makeGrammarLesson;
  $$('[data-grammar-answer]').forEach(b=>b.onclick=()=>{
    const i=Number(b.dataset.grammarAnswer);const ex=grammarLesson.exercises[i];const box=$(`#gex_${i}`);
    box.innerHTML=`<div class="answer-box"><strong>Soluzione:</strong> ${esc(ex.answer)}<br><span class="muted">${esc(ex.explanationIt||'')}</span></div>`;
  });
  if($('#newGrammar'))$('#newGrammar').onclick=()=>{grammarLesson=null;renderGrammar()};
}

function renderGrammarLesson(){
  return `<div class="card"><div class="kicker">${esc(grammarLesson.title)}</div><h3>${esc(grammarLesson.rule)}</h3><p>${esc(grammarLesson.explanationIt)}</p>${grammarLesson.examples?.length?`<div class="stack">${grammarLesson.examples.map(x=>`<div class="transcript">${esc(x)}</div>`).join('')}</div>`:''}</div><div class="section-title"><h2>Esercizi</h2></div><div class="stack">${(grammarLesson.exercises||[]).map((x,i)=>`<div class="card"><strong>${i+1}. ${esc(x.prompt)}</strong><div id="gex_${i}" style="margin-top:10px"><button class="secondary" data-grammar-answer="${i}">Mostra soluzione</button></div></div>`).join('')}</div><button class="ghost full" id="newGrammar" style="margin-top:12px">Crea un’altra lezione</button>`;
}

async function makeGrammarLesson(){
  if(!settings.backendUrl)return alert('Per generare la lezione serve il backend AI.');
  $('#app').innerHTML='<div class="card audio-stage"><div class="audio-orb speaking">…</div><h2>Analizzo i tuoi errori</h2></div>';
  try{
    grammarLesson=await api('grammar_lesson',{language:settings.language,level:settings.level,errors:errors.slice(0,20)});
    renderGrammar();
    if($('#newGrammar'))$('#newGrammar').onclick=()=>{grammarLesson=null;renderGrammar()};
  }catch(e){showFatal('Non riesco a creare la lezione',e)}
}

function renderSettings(){
  const lang=LANGS[settings.language];
  $('#app').innerHTML=`
    <div class="section-title"><h2>⚙ Impostazioni</h2></div>
    <div class="card stack">
      <div class="field"><label>Lingua da studiare</label><select id="sLang">${Object.entries(LANGS).map(([k,v])=>`<option value="${k}" ${k===settings.language?'selected':''}>${v.name}</option>`).join('')}</select></div>
      <div class="field"><label>Livello indicativo</label><select id="sLevel">${['A1','A2','B1','B2','C1','C2'].map(x=>`<option ${x===settings.level?'selected':''}>${x}</option>`).join('')}</select></div>
      <div class="field"><label>Voce / variante</label><select id="sLocale">${lang.accents.map(([v,n])=>`<option value="${v}" ${v===settings.locale?'selected':''}>${n}</option>`).join('')}</select></div>
      <div class="field"><label>Velocità audio</label><div class="range-line"><input id="sSpeed" type="range" min="0.65" max="1.2" step="0.05" value="${settings.speed}"><strong id="speedVal">${Number(settings.speed).toFixed(2)}×</strong></div></div>
      <div class="field"><label><input type="checkbox" id="sHide" ${settings.hideAiText?'checked':''}> Nascondi il testo dell'AI durante la conversazione</label></div>
      <div class="field"><label><input type="checkbox" id="sAiVoice" ${settings.aiVoice?'checked':''}> Usa voce Gemini naturale (free tier)</label></div>
      <div class="field"><label>Voce britannica Gemini</label><input id="sVoice" value="${esc(settings.voice||'')}" placeholder="automatico: seleziona una voce en-GB British"><div class="row" style="margin-top:8px"><button class="secondary" id="findBritishVoice" type="button">Trova voce britannica</button><span class="muted" id="voiceStatus"></span></div></div>
    </div>
    <div class="section-title"><h2>Backend AI</h2></div>
    <div class="card stack">
      <div class="field"><label>URL del backend Cloudflare Worker</label><input id="sBackend" type="url" value="${esc(settings.backendUrl)}" placeholder="https://linguaviva-api.TUO-NOME.workers.dev"></div>
      <div class="row"><button class="secondary" id="testBackend">Verifica collegamento</button><span id="backendStatus" class="muted"></span></div>
      <div class="notice">La chiave Gemini non va inserita qui. Rimane nel <strong>secret GEMINI_API_KEY</strong> del Worker. Se non abiliti la fatturazione nel progetto Google AI, al raggiungimento della quota gratuita l'app si ferma invece di generare costi.</div>
    </div>
    <div class="row between" style="margin-top:16px"><button class="danger" id="resetAll">Azzera dati locali</button><button class="primary" id="saveSettings">Salva</button></div>`;
  $('#sLang').onchange=e=>{
    const l=LANGS[e.target.value]; $('#sLocale').innerHTML=l.accents.map(([v,n])=>`<option value="${v}">${n}</option>`).join('');
  };
  $('#sSpeed').oninput=e=>$('#speedVal').textContent=`${Number(e.target.value).toFixed(2)}×`;
  $('#saveSettings').onclick=()=>{
    const language=$('#sLang').value; settings={...settings,language,level:$('#sLevel').value,locale:$('#sLocale').value,speed:Number($('#sSpeed').value),hideAiText:$('#sHide').checked,aiVoice:$('#sAiVoice').checked,voice:($('#sVoice')?.value||'').trim(),backendUrl:$('#sBackend').value.trim()};saveAll();alert('Impostazioni salvate.');renderSettings();
  };
  $('#testBackend').onclick=async()=>{
    const st=$('#backendStatus'); const candidate=$('#sBackend').value.trim(); if(!candidate)return st.textContent='Inserisci prima un URL.';
    const old=settings.backendUrl;settings.backendUrl=candidate;st.textContent='Verifico…';
    try{const d=await api('health');st.textContent=`✓ ${d.message||'Backend collegato'}`;}catch(e){st.textContent=`✗ ${e.message||e}`;}finally{settings.backendUrl=old}
  };
  if($('#findBritishVoice'))$('#findBritishVoice').onclick=async()=>{
    const st=$('#voiceStatus');const candidate=$('#sBackend').value.trim();if(!candidate)return st.textContent='Configura prima il backend.';
    const old=settings.backendUrl;settings.backendUrl=candidate;st.textContent='Cerco…';
    try{const d=await api('british_voices');const v=d.voices?.[0];if(!v)throw new Error('Nessuna voce en-GB British trovata.');$('#sVoice').value=v.id;st.textContent=`✓ ${v.name||v.id} · ${v.accent||'British'}`;}catch(e){st.textContent=`✗ ${e.message||e}`;}finally{settings.backendUrl=old}
  };
  $('#resetAll').onclick=()=>{if(confirm('Azzera progressi, conversazioni ed errori su questo dispositivo?')){['settings','stats','errors','conversation'].forEach(k=>localStorage.removeItem(`lv_${k}`));location.reload()}};
}

async function micInto(inputSel,btnSel){
  const btn=$(btnSel);btn.classList.add('listening');btn.textContent='●';
  try{const r=await recognize(settings.locale);$(inputSel).value=r.text;}catch(e){alert(e.message||e)}finally{btn.classList.remove('listening');btn.textContent='🎙'}
}
function showFatal(title,err){
  $('#app').innerHTML=`<div class="card"><h2>${esc(title)}</h2><p class="muted">${esc(err.message||String(err))}</p><button class="primary" onclick="location.hash='settings';render()">Apri impostazioni</button></div>`;
}

window.addEventListener('hashchange',render);
document.addEventListener('click',e=>{const b=e.target.closest('.nav-btn');if(b)setRoute(b.dataset.route)});
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredInstall=e;$('#installBtn')?.classList.remove('hidden')});
$('#installBtn').onclick=async()=>{if(deferredInstall){deferredInstall.prompt();await deferredInstall.userChoice;deferredInstall=null;$('#installBtn').classList.add('hidden')}};
window.addEventListener('load',()=>{
  if('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(()=>{});
  if(!recognitionSupported()) console.info('Web Speech Recognition non disponibile: input vocale disabilitato, input testuale disponibile.');
  render();
});
