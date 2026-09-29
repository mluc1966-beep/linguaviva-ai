// LinguaViva v1.1.3 - London Live via official Google GenAI SDK
// Uses the official @google/genai SDK with the short-lived Gemini token.
// The SDK version is pinned to avoid unexpected breaking changes.

const LV_GENAI_SDK_URL = 'https://esm.sh/@google/genai@2.24.0?bundle';

cleanupLive = async function cleanupLiveSdk(){
  if(!liveState) return;
  stopQueuedLiveAudio();

  if(liveState.connectTimer){
    clearTimeout(liveState.connectTimer);
    liveState.connectTimer=null;
  }

  try{
    if(liveState.processor){
      liveState.processor.onaudioprocess=null;
      liveState.processor.disconnect();
    }
  }catch{}
  try{ liveState.mediaSource?.disconnect(); }catch{}
  try{ liveState.silent?.disconnect(); }catch{}
  try{ liveState.mediaStream?.getTracks().forEach(t=>t.stop()); }catch{}
  try{ liveState.session?.close(); }catch{}
  try{ await liveState.audioContext?.close(); }catch{}
};

startLondonLive = async function startLondonLiveSdk(){
  if(!settings.backendUrl){
    alert('Prima collega il backend gratuito Gemini nelle Impostazioni.');
    setRoute('settings');
    return;
  }

  lastLiveReview=null;
  lastLiveTurns=[];
  liveShowTranscript=false;

  liveState={
    active:true,
    ready:false,
    speaking:false,
    status:'Attivo il microfono…',
    turns:[],
    currentUser:'',
    currentAi:'',
    sources:new Set(),
    nextPlayTime:0
  };

  liveStartedAt=Date.now();
  renderConversation();
  startLiveTimer();

  try{
    if(!navigator.mediaDevices?.getUserMedia){
      throw new Error('Questo browser non consente l’accesso al microfono.');
    }

    // 1) Microfono: viene richiesto direttamente dal tap dell'utente.
    const stream=await navigator.mediaDevices.getUserMedia({
      audio:{
        channelCount:1,
        echoCancellation:true,
        noiseSuppression:true,
        autoGainControl:true
      },
      video:false
    });
    liveState.mediaStream=stream;
    liveState.status='Microfono attivo · preparo Gemini…';
    updateLiveUI();

    // 2) Token temporaneo dal nostro Worker.
    const tokenData=await api('live_token',{
      locale:settings.locale,
      voice:settings.voice || 'Kore'
    });

    if(!settings.voice && tokenData.voice){
      settings.voice=tokenData.voice;
      saveAll();
    }

    // 3) Carica l'SDK ufficiale Google, versione bloccata.
    liveState.status='Carico il motore Gemini Live…';
    updateLiveUI();

    const { GoogleGenAI } = await import(LV_GENAI_SDK_URL);
    const ai = new GoogleGenAI({
      apiKey: tokenData.token
    });
    liveState.ai=ai;

    // 4) Prepara audio input/output.
    const AC=window.AudioContext || window.webkitAudioContext;
    if(!AC) throw new Error('Web Audio non supportato da questo browser.');

    const ctx=new AC();
    liveState.audioContext=ctx;
    await ctx.resume();

    const source=ctx.createMediaStreamSource(stream);
    liveState.mediaSource=source;

    const processor=ctx.createScriptProcessor(4096,1,1);
    liveState.processor=processor;

    const silent=ctx.createGain();
    silent.gain.value=0;
    liveState.silent=silent;

    source.connect(processor);
    processor.connect(silent);
    silent.connect(ctx.destination);

    liveState.status='Collegamento a Gemini Live…';
    updateLiveUI();

    // 5) Connessione tramite SDK ufficiale.
    const session=await ai.live.connect({
      model: tokenData.model || 'gemini-3.8-live',
      config:{
        responseModalities:['AUDIO'],
        speechConfig:{
          voiceConfig:{
            prebuiltVoiceConfig:{
              voiceName:settings.voice || tokenData.voice || 'Kore'
            }
          }
        },
        systemInstruction:{
          parts:[{text:londonInstruction()}]
        },
        inputAudioTranscription:{
          languageCodes:[settings.locale || 'en-GB']
        },
        outputAudioTranscription:{},
        realtimeInputConfig:{
          automaticActivityDetection:{
            disabled:false,
            prefixPaddingMs:120,
            silenceDurationMs:650
          }
        }
      },
      callbacks:{
        onopen:()=>{
          if(liveState){
            liveState.status='Connessione aperta · inizializzo la sessione…';
            updateLiveUI();
          }
        },
        onmessage:(message)=>{
          if(!liveState) return;

          if(message?.setupComplete){
            if(liveState.connectTimer){
              clearTimeout(liveState.connectTimer);
              liveState.connectTimer=null;
            }
            liveState.ready=true;
            liveState.status='Parla normalmente';
            updateLiveUI();

            try{
              liveState.session?.sendRealtimeInput({
                text:'Start the conversation now with one short, natural opening question.'
              });
            }catch(e){
              console.error('Unable to send opening message',e);
            }
            return;
          }

          // Reuse the existing transcript/audio handler.
          try{
            handleLiveMessage(JSON.stringify(message));
          }catch(e){
            console.error('Live message handling error',e,message);
          }
        },
        onerror:(event)=>{
          if(!liveState) return;
          const detail=event?.message || event?.error?.message || '';
          liveState.status='Errore Gemini Live';
          updateLiveUI();
          console.error('Gemini Live SDK error',event);
          if(detail) alert(`Gemini Live: ${detail}`);
        },
        onclose:(event)=>{
          if(!liveState) return;

          if(liveState.connectTimer){
            clearTimeout(liveState.connectTimer);
            liveState.connectTimer=null;
          }

          if(liveState.active && !liveState.stopping){
            const code=event?.code ?? '';
            const reason=event?.reason || '';
            liveState.status=`Sessione chiusa${code?` · ${code}`:''}${reason?` · ${reason}`:''}`;
            updateLiveUI();

            if(!liveState.ready){
              alert(`Gemini Live ha chiuso la connessione prima di iniziare${code?` (codice ${code})`:''}${reason?`: ${reason}`:''}.`);
            }
          }
        }
      }
    });

    liveState.session=session;

    processor.onaudioprocess=e=>{
      if(!liveState?.ready || !liveState.session) return;

      const input=e.inputBuffer.getChannelData(0);
      const pcm=downsampleToPCM16(input,ctx.sampleRate,16000);
      if(!pcm.length) return;

      try{
        liveState.session.sendRealtimeInput({
          audio:{
            data:bytesToBase64(new Uint8Array(pcm.buffer)),
            mimeType:'audio/pcm;rate=16000'
          }
        });
      }catch(e){
        console.error('Audio send failed',e);
      }
    };

    liveState.connectTimer=setTimeout(()=>{
      if(liveState?.active && !liveState.ready){
        liveState.status='Gemini non ha completato l’inizializzazione';
        updateLiveUI();
        alert('Gemini Live non ha completato l’inizializzazione entro 20 secondi.');
      }
    },20000);

  }catch(err){
    const name=err?.name || '';
    let msg=err?.message || String(err);

    if(name==='NotAllowedError' || name==='PermissionDeniedError'){
      msg='Permesso microfono negato. In Chrome apri i permessi del sito e consenti il microfono.';
    }else if(name==='NotFoundError'){
      msg='Non trovo un microfono disponibile sul dispositivo.';
    }else if(name==='NotReadableError'){
      msg='Il microfono è già in uso o non è accessibile.';
    }

    await cleanupLive();
    liveState=null;
    stopLiveTimer();
    liveStartedAt=0;
    renderConversation();
    alert(`London Live non è partito: ${msg}`);
  }
};
