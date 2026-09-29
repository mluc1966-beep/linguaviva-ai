// LinguaViva v1.1.2 - London Live hotfix
// Loaded after live.js. It requests microphone permission before any network call,
// then connects to Gemini Live with clearer diagnostics.

startLondonLive = async function startLondonLiveFixed(){
  if(!settings.backendUrl){
    alert('Prima collega il backend gratuito Gemini nelle Impostazioni.');
    setRoute('settings');
    return;
  }

  lastLiveReview=null;
  lastLiveTurns=[];
  liveShowTranscript=false;
  liveState={
    active:true, ready:false, speaking:false,
    status:'Richiedo accesso al microfono…',
    turns:[], currentUser:'', currentAi:'',
    sources:new Set(), nextPlayTime:0
  };
  liveStartedAt=Date.now();
  renderConversation();
  startLiveTimer();

  try{
    if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
      throw new Error('Questo browser non consente l’accesso al microfono tramite WebRTC.');
    }

    // IMPORTANT: request mic immediately from the user's tap.
    liveState.status='Consenti l’uso del microfono…';
    updateLiveUI();

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
    liveState.status='Microfono attivo · preparo London Live…';
    updateLiveUI();

    const tokenData=await api('live_token',{
      locale:settings.locale,
      voice:settings.voice || 'Kore'
    });

    if(!settings.voice && tokenData.voice){
      settings.voice=tokenData.voice;
      saveAll();
    }

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

    processor.onaudioprocess=e=>{
      if(!liveState?.ready || !liveState.socket || liveState.socket.readyState!==WebSocket.OPEN) return;
      const input=e.inputBuffer.getChannelData(0);
      const pcm=downsampleToPCM16(input,ctx.sampleRate,16000);
      if(!pcm.length) return;
      liveState.socket.send(JSON.stringify({
        realtimeInput:{
          audio:{
            data:bytesToBase64(new Uint8Array(pcm.buffer)),
            mimeType:'audio/pcm;rate=16000'
          }
        }
      }));
    };

    liveState.status='Collegamento a Gemini Live…';
    updateLiveUI();

    const wsUrl=`wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token=${encodeURIComponent(tokenData.token)}`;
    const ws=new WebSocket(wsUrl);
    liveState.socket=ws;

    liveState.connectTimer=setTimeout(()=>{
      if(liveState?.active && !liveState.ready){
        liveState.status='Connessione Live non completata';
        updateLiveUI();
        try{ liveState.socket?.close(); }catch{}
        alert('Il microfono è attivo, ma Gemini Live non ha completato la connessione entro 15 secondi.');
      }
    },15000);

    ws.onopen=()=>{
      const setup={
        setup:{
          model:`models/${tokenData.model || 'gemini-3.8-live'}`,
          generationConfig:{
            responseModalities:['AUDIO'],
            speechConfig:{
              voiceConfig:{
                prebuiltVoiceConfig:{
                  voiceName:settings.voice || tokenData.voice || 'Kore'
                }
              }
            }
          },
          systemInstruction:{parts:[{text:londonInstruction()}]},
          inputAudioTranscription:{languageCodes:[settings.locale || 'en-GB']},
          outputAudioTranscription:{},
          realtimeInputConfig:{
            automaticActivityDetection:{
              disabled:false,
              prefixPaddingMs:120,
              silenceDurationMs:650
            }
          }
        }
      };
      ws.send(JSON.stringify(setup));
    };

    const oldHandler=handleLiveMessage;
    ws.onmessage=e=>{
      try{
        const m=JSON.parse(e.data);
        if(m.setupComplete && liveState?.connectTimer){
          clearTimeout(liveState.connectTimer);
          liveState.connectTimer=null;
        }
      }catch{}
      oldHandler(e.data);
    };

    ws.onerror=()=>{
      if(liveState){
        liveState.status='Errore di connessione Gemini Live';
        updateLiveUI();
      }
    };

    ws.onclose=e=>{
      if(liveState?.connectTimer){
        clearTimeout(liveState.connectTimer);
        liveState.connectTimer=null;
      }
      if(liveState?.active && !liveState.stopping){
        liveState.status=`Sessione chiusa (codice ${e.code}${e.reason?`: ${e.reason}`:''})`;
        updateLiveUI();
        if(!liveState.ready){
          alert(`Gemini Live ha chiuso la connessione prima di iniziare (codice ${e.code}${e.reason?`: ${e.reason}`:''}).`);
        }
      }
    };

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

    if(liveState?.connectTimer){
      clearTimeout(liveState.connectTimer);
      liveState.connectTimer=null;
    }

    await cleanupLive();
    liveState=null;
    stopLiveTimer();
    liveStartedAt=0;
    renderConversation();
    alert(`London Live non è partito: ${msg}`);
  }
};
