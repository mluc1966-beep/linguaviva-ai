'use strict';

let liveState = null;
let lastLiveTurns = [];
let lastLiveReview = null;
let liveShowTranscript = false;
let liveStartedAt = 0;
let liveTimer = null;

function londonInstruction(){
  const style=settings.londonStyle||'natural';
  const level=settings.level||'B1';
  const styleText={
    clear:'Speak clear contemporary British English, slightly slower than normal, but keep natural linking and contractions.',
    natural:'Speak contemporary British English at normal everyday speed, with natural linking, reductions and contractions, as a person in London would in ordinary conversation.',
    challenge:'Speak fast, casual contemporary British English with natural reductions, idioms and turn-taking, but do not caricature any regional or social accent.'
  }[style] || 'Speak natural contemporary British English.';
  return `You are a friendly adult native British English speaker living in London. You are having a REAL conversation with an Italian learner at CEFR ${level}. ${styleText}
Speak ONLY English during the live conversation unless the learner explicitly asks for a brief Italian explanation. Do not act like a classroom teacher while talking. Do not correct errors mid-conversation unless communication breaks down. React naturally, ask follow-up questions, change topic organically, and allow the learner to interrupt you. Keep most turns to 1-3 sentences so the learner must listen and reply. Never announce grammar rules or say that you are an AI. If the learner asks you to repeat, repeat naturally; if they ask you to slow down, slow down temporarily. Start with an ordinary London-life conversation, not a test.`;
}

function renderConversation(){
  const active=!!liveState?.active;
  const connected=!!liveState?.ready;
  const elapsed=liveStartedAt?formatLiveTime(Date.now()-liveStartedAt):'00:00';
  $('#app').innerHTML=`
    <div class="section-title"><h2>🇬🇧 London Live</h2><span class="pill ${active?'good':''}">${active?(connected?'LIVE':'connessione…'):'Gemini Live · free tier'}</span></div>
    <div class="notice"><strong>Obiettivo:</strong> conversazione audio reale, senza sottotitoli. L'interlocutore usa inglese britannico contemporaneo; il testo resta nascosto durante la sessione.</div>
    ${active?`
      <div class="card audio-stage" style="margin-top:12px">
        <div class="audio-orb ${liveState.speaking?'speaking':''}" id="liveOrb">${liveState.speaking?'🔊':'🎙'}</div>
        <h2 id="liveStatus">${esc(liveState.status||'Conversazione in corso')}</h2>
        <div class="metric" id="liveClock" style="font-size:2rem">${elapsed}</div>
        <p class="muted">Parla normalmente. Puoi interrompere l'interlocutore come in una conversazione vera.</p>
        <div class="row" style="justify-content:center;gap:10px;flex-wrap:wrap">
          <button class="ghost" id="toggleLiveTranscript">${liveShowTranscript?'Nascondi':'Mostra'} trascrizione</button>
          <button class="danger" id="stopLive">■ Termina e analizza</button>
        </div>
      </div>
      <div id="liveTranscriptWrap">${liveShowTranscript?renderLiveTranscript():''}</div>
    `:`
      <div class="card" style="margin-top:12px">
        <div class="kicker">Immersione</div>
        <h2>Come essere in conversazione a Londra</h2>
        <p>L'audio passa direttamente tra il tuo microfono e Gemini Live. Nessuna frase preparata: l'interlocutore reagisce a ciò che dici, può essere interrotto e continua il discorso in modo naturale.</p>
        <div class="segmented" style="margin:16px 0">
          <button data-live-style="clear" class="${(settings.londonStyle||'natural')==='clear'?'active':''}">British Clear</button>
          <button data-live-style="natural" class="${(settings.londonStyle||'natural')==='natural'?'active':''}">London Natural</button>
          <button data-live-style="challenge" class="${(settings.londonStyle||'natural')==='challenge'?'active':''}">London Challenge</button>
        </div>
        <button class="primary large full" id="startLive">🎙 Avvia London Live</button>
        <p class="muted" style="margin-top:10px">La prima volta il browser chiederà il permesso per il microfono. La sessione usa il livello gratuito Gemini: se la quota gratuita termina, l'app si ferma invece di generare costi se non attivi la fatturazione.</p>
      </div>
      ${lastLiveTurns.length?`<div class="section-title"><h2>Ultima sessione</h2><span class="pill">${lastLiveTurns.filter(t=>t.role==='user').length} tuoi turni</span></div>${renderLastLiveReview()}`:''}
    `}
  `;
  if(active){
    $('#stopLive').onclick=()=>stopLondonLive(true);
    $('#toggleLiveTranscript').onclick=()=>{liveShowTranscript=!liveShowTranscript;renderConversation();};
  }else{
    $('#startLive').onclick=startLondonLive;
    $$('[data-live-style]').forEach(b=>b.onclick=()=>{settings.londonStyle=b.dataset.liveStyle;saveAll();renderConversation();});
  }
}

function renderLiveTranscript(){
  if(!liveState)return '';
  const turns=[...(liveState.turns||[])];
  if(liveState.currentUser?.trim())turns.push({role:'user',text:liveState.currentUser});
  if(liveState.currentAi?.trim())turns.push({role:'ai',text:liveState.currentAi});
  return `<div class="card" style="margin-top:12px"><div class="kicker">Trascrizione live</div><div class="chat">${turns.length?turns.slice(-10).map(t=>`<div class="bubble ${t.role==='user'?'user':'ai'}">${esc(t.text)}</div>`).join(''):'<div class="empty">La trascrizione apparirà qui.</div>'}</div></div>`;
}
function renderLastLiveReview(){
  const transcript=`<div class="card"><details><summary><strong>Trascrizione completa</strong></summary><div class="chat" style="margin-top:12px">${lastLiveTurns.map(t=>`<div class="bubble ${t.role==='user'?'user':'ai'}">${esc(t.text)}</div>`).join('')}</div></details></div>`;
  if(!lastLiveReview)return transcript;
  const corr=(lastLiveReview.corrections||[]).map(renderCorrection).join('');
  const expr=(lastLiveReview.usefulExpressions||[]).map(x=>`<div class="answer-box"><strong>${esc(x.expression||'')}</strong><div class="muted">${esc(x.meaningIt||'')}</div></div>`).join('');
  return `${transcript}<div class="card" style="margin-top:12px"><div class="kicker">Teacher Mode</div><p>${esc(lastLiveReview.summaryIt||'')}</p>${corr?`<h3>Correzioni</h3><div class="stack">${corr}</div>`:''}${expr?`<h3 style="margin-top:16px">Espressioni utili</h3><div class="stack">${expr}</div>`:''}${lastLiveReview.nextFocusIt?`<div class="notice" style="margin-top:14px"><strong>Prossimo focus:</strong> ${esc(lastLiveReview.nextFocusIt)}</div>`:''}</div>`;
}

async function startLondonLive(){
  if(!settings.backendUrl){alert('Prima collega il backend gratuito Gemini nelle Impostazioni.');setRoute('settings');return;}
  lastLiveReview=null;lastLiveTurns=[];liveShowTranscript=false;
  liveState={active:true,ready:false,speaking:false,status:'Richiedo accesso al microfono…',turns:[],currentUser:'',currentAi:'',sources:new Set(),nextPlayTime:0};
  liveStartedAt=Date.now();renderConversation();startLiveTimer();
  try{
    const tokenData=await api('live_token',{locale:settings.locale,voice:settings.voice||''});
    if(!settings.voice && tokenData.voice){settings.voice=tokenData.voice;saveAll();}
    const stream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});
    liveState.mediaStream=stream;
    const AC=window.AudioContext||window.webkitAudioContext;
    if(!AC)throw new Error('Web Audio non supportato da questo browser.');
    const ctx=new AC();liveState.audioContext=ctx;await ctx.resume();
    const source=ctx.createMediaStreamSource(stream);liveState.mediaSource=source;
    const processor=ctx.createScriptProcessor(4096,1,1);liveState.processor=processor;
    const silent=ctx.createGain();silent.gain.value=0;liveState.silent=silent;
    source.connect(processor);processor.connect(silent);silent.connect(ctx.destination);
    processor.onaudioprocess=e=>{
      if(!liveState?.ready||!liveState.socket||liveState.socket.readyState!==WebSocket.OPEN)return;
      const input=e.inputBuffer.getChannelData(0);
      const pcm=downsampleToPCM16(input,ctx.sampleRate,16000);
      if(!pcm.length)return;
      liveState.socket.send(JSON.stringify({realtimeInput:{audio:{data:bytesToBase64(new Uint8Array(pcm.buffer)),mimeType:'audio/pcm;rate=16000'}}}));
    };

    liveState.status='Collegamento a London Live…';updateLiveUI();
    const wsUrl=`wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token=${encodeURIComponent(tokenData.token)}`;
    const ws=new WebSocket(wsUrl);liveState.socket=ws;
    ws.onopen=()=>{
      const setup={setup:{
        model:`models/${tokenData.model||'gemini-3.8-live'}`,
        generationConfig:{responseModalities:['AUDIO'],speechConfig:{voiceConfig:{prebuiltVoiceConfig:{voiceName:settings.voice||tokenData.voice||'Kore'}}}},
        systemInstruction:{parts:[{text:londonInstruction()}]},
        inputAudioTranscription:{languageCodes:[settings.locale||'en-GB']},
        outputAudioTranscription:{},
        realtimeInputConfig:{automaticActivityDetection:{prefixPaddingMs:120,silenceDurationMs:650}}
      }};
      ws.send(JSON.stringify(setup));
    };
    ws.onmessage=e=>handleLiveMessage(e.data);
    ws.onerror=()=>{if(liveState){liveState.status='Errore di connessione Live';updateLiveUI();}};
    ws.onclose=e=>{if(liveState?.active && !liveState.stopping){liveState.status=`Sessione chiusa${e.reason?`: ${e.reason}`:''}`;updateLiveUI();}};
  }catch(err){
    await cleanupLive();
    liveState=null;stopLiveTimer();liveStartedAt=0;renderConversation();alert(`London Live non è partito: ${err.message||err}`);
  }
}

function handleLiveMessage(raw){
  if(!liveState)return;
  let msg;try{msg=JSON.parse(raw)}catch{return;}
  if(msg.setupComplete){
    liveState.ready=true;liveState.status='Parla normalmente';updateLiveUI();
    liveState.socket.send(JSON.stringify({realtimeInput:{text:'Start the conversation now with one short, natural opening question.'}}));
    return;
  }
  const c=msg.serverContent;
  if(!c)return;
  if(c.interrupted){stopQueuedLiveAudio();liveState.speaking=false;liveState.status='Ti ascolto…';}
  if(c.inputTranscription?.text){liveState.currentUser=mergeTranscript(liveState.currentUser,c.inputTranscription.text);liveState.status='Ti ascolto…';}
  if(c.outputTranscription?.text){
    finalizeLiveUserTurn();
    liveState.currentAi=mergeTranscript(liveState.currentAi,c.outputTranscription.text);
    liveState.status='Interlocutore sta parlando…';liveState.speaking=true;
  }
  for(const p of (c.modelTurn?.parts||[])){
    if(p.inlineData?.data && String(p.inlineData.mimeType||'').startsWith('audio/')){
      finalizeLiveUserTurn();playLivePCM(p.inlineData.data);liveState.speaking=true;liveState.status='Interlocutore sta parlando…';
    }
  }
  if(c.turnComplete){
    finalizeLiveUserTurn();finalizeLiveAiTurn();liveState.speaking=false;liveState.status='Tocca a te';
  }
  updateLiveUI();
}
function mergeTranscript(current,next){
  current=String(current||'').trim();next=String(next||'').trim();if(!next)return current;if(!current)return next;
  if(next.startsWith(current))return next;if(current.endsWith(next))return current;
  return `${current} ${next}`.replace(/\s+/g,' ').trim();
}
function finalizeLiveUserTurn(){
  if(!liveState?.currentUser?.trim())return;const text=liveState.currentUser.trim();liveState.currentUser='';
  const last=liveState.turns[liveState.turns.length-1];if(!(last?.role==='user'&&last.text===text)){liveState.turns.push({role:'user',text});stats.conversationTurns++;markStudy();saveAll();}
}
function finalizeLiveAiTurn(){
  if(!liveState?.currentAi?.trim())return;const text=liveState.currentAi.trim();liveState.currentAi='';
  const last=liveState.turns[liveState.turns.length-1];if(!(last?.role==='ai'&&last.text===text))liveState.turns.push({role:'ai',text});
}
function playLivePCM(base64){
  if(!liveState?.audioContext)return;const ctx=liveState.audioContext;const bytes=base64ToBytes(base64);const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);const frames=Math.floor(bytes.byteLength/2);const buffer=ctx.createBuffer(1,frames,24000);const ch=buffer.getChannelData(0);
  for(let i=0;i<frames;i++)ch[i]=view.getInt16(i*2,true)/32768;
  const src=ctx.createBufferSource();src.buffer=buffer;src.connect(ctx.destination);
  const when=Math.max(ctx.currentTime+0.025,liveState.nextPlayTime||0);src.start(when);liveState.nextPlayTime=when+buffer.duration;liveState.sources.add(src);
  src.onended=()=>liveState?.sources?.delete(src);
}
function stopQueuedLiveAudio(){
  if(!liveState)return;for(const s of liveState.sources||[]){try{s.stop()}catch{}}liveState.sources?.clear();liveState.nextPlayTime=liveState.audioContext?.currentTime||0;
}
async function stopLondonLive(review=true){
  if(!liveState)return;liveState.stopping=true;finalizeLiveUserTurn();finalizeLiveAiTurn();
  const turns=[...liveState.turns];lastLiveTurns=turns;stopLiveTimer();
  await cleanupLive();liveState=null;liveStartedAt=0;renderConversation();
  if(review&&turns.length){
    const box=$('#app');box?.insertAdjacentHTML('afterbegin','<div class="notice">Analizzo la conversazione in Teacher Mode…</div>');
    try{
      const r=await api('live_review',{language:settings.language,level:settings.level,turns});lastLiveReview=r;
      for(const c of (r.corrections||[]))errors.unshift({...c,id:uid(),createdAt:new Date().toISOString(),source:'london-live'});
      saveAll();renderConversation();
    }catch(e){lastLiveReview={summaryIt:`La conversazione è stata salvata, ma l'analisi non è riuscita: ${e.message||e}`,corrections:[],usefulExpressions:[]};renderConversation();}
  }
}
async function cleanupLive(){
  if(!liveState)return;stopQueuedLiveAudio();
  try{liveState.processor&&(liveState.processor.onaudioprocess=null,liveState.processor.disconnect())}catch{}
  try{liveState.mediaSource?.disconnect()}catch{}
  try{liveState.silent?.disconnect()}catch{}
  try{liveState.mediaStream?.getTracks().forEach(t=>t.stop())}catch{}
  try{liveState.socket?.close()}catch{}
  try{await liveState.audioContext?.close()}catch{}
}
function updateLiveUI(){
  if(!liveState)return;const st=$('#liveStatus');if(st)st.textContent=liveState.status||'';const orb=$('#liveOrb');if(orb){orb.classList.toggle('speaking',!!liveState.speaking);orb.textContent=liveState.speaking?'🔊':'🎙';}
  if(liveShowTranscript){const wrap=$('#liveTranscriptWrap');if(wrap)wrap.innerHTML=renderLiveTranscript();}
}
function startLiveTimer(){stopLiveTimer();liveTimer=setInterval(()=>{const el=$('#liveClock');if(el&&liveStartedAt)el.textContent=formatLiveTime(Date.now()-liveStartedAt);},1000);}
function stopLiveTimer(){if(liveTimer){clearInterval(liveTimer);liveTimer=null;}}
function formatLiveTime(ms){const s=Math.floor(ms/1000),m=Math.floor(s/60);return `${String(m).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;}
function downsampleToPCM16(input,inputRate,targetRate){
  if(targetRate>=inputRate){const out=new Int16Array(input.length);for(let i=0;i<input.length;i++)out[i]=Math.max(-1,Math.min(1,input[i]))*32767;return out;}
  const ratio=inputRate/targetRate,len=Math.floor(input.length/ratio),out=new Int16Array(len);let pos=0;
  for(let i=0;i<len;i++){const start=Math.floor(i*ratio),end=Math.min(input.length,Math.floor((i+1)*ratio));let sum=0,n=0;for(let j=start;j<end;j++){sum+=input[j];n++;}const v=Math.max(-1,Math.min(1,n?sum/n:input[start]||0));out[pos++]=v<0?v*32768:v*32767;}
  return out;
}
function bytesToBase64(bytes){let s='';const step=0x8000;for(let i=0;i<bytes.length;i+=step)s+=String.fromCharCode(...bytes.subarray(i,i+step));return btoa(s);}
function base64ToBytes(s){const bin=atob(s),out=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i);return out;}

window.addEventListener('beforeunload',()=>{if(liveState)cleanupLive();});
window.addEventListener('hashchange',()=>{if(liveState?.active && route()!=='conversation')stopLondonLive(false);});
