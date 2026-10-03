'use strict';

/* Sala Giochi 2.0 — navigazione a famiglie + giochi Nuova generazione
   v2.6.0: EVERYBODY IS RIGHT giocabile. */

(() => {
  const NEXTGEN_VERSION = '2.6.0';

  GAME_NAMES.shiftline = 'SHIFTLINE';
  GAME_NAMES.lumina = 'LUMINA';
  GAME_NAMES.everybody = 'EVERYBODY IS RIGHT';
  ICONS.shiftline = '⚡';
  ICONS.lumina = '✦';
  ICONS.everybody = '◎';
  SESSION_GAMES.add('shiftline');
  SESSION_GAMES.add('lumina');
  SESSION_GAMES.add('everybody');
  DEFAULT_GAME_PALETTES.shiftline = 'ocean';
  DEFAULT_GAME_PALETTES.lumina = 'violet';
  DEFAULT_GAME_PALETTES.everybody = 'steel';

  GAME_HELP.shiftline = {
    title: 'SHIFTLINE',
    goal: 'Accendi l’intera rete collegando tutte le tessere in un unico circuito continuo.',
    steps: [
      'Tocca una tessera per ruotarla di 90°.',
      'Ogni tessera influenza anche altre tessere: il simbolo nell’angolo indica il tipo di effetto.',
      'Le linee luminose mostrano in tempo reale quali parti della rete sono già alimentate.',
      'La partita termina quando tutte le tessere sono collegate correttamente e l’energia raggiunge il nodo finale.'
    ],
    example: '↔ ruota insieme a una tessera vicina; ⇄ fa ruotare la tessera speculare in senso opposto; ✦ coinvolge anche le adiacenti; ⟲ combina rotazioni opposte sulle due direzioni.',
    tips: [
      'Non esiste un limite di mosse: puoi sperimentare liberamente.',
      '“Annulla” inverte esattamente l’ultima mossa.',
      'Ogni schema viene creato partendo da una configurazione risolta e poi mescolato con mosse legali.'
    ]
  };



  GAME_HELP.everybody = {
    title: 'EVERYBODY IS RIGHT',
    goal: 'Costruisci una realtà in cui tutte le testimonianze possano essere vere contemporaneamente.',
    steps: [
      'Leggi le testimonianze: nessuno dei personaggi mente.',
      'Tocca un personaggio e poi un luogo per ricostruire dove poteva trovarsi all’ora indicata.',
      'Seleziona le assunzioni che stai probabilmente dando per scontate senza che nessuno le abbia davvero affermate.',
      'Per ogni testimonianza apparentemente impossibile scegli il collegamento nascosto che può renderla vera.',
      'Premi “Verifica realtà”: il gioco controlla i vincoli, non una singola sequenza preconfezionata.'
    ],
    example: 'Se Anna dice “ho visto Marco” e Marco era in un’altra stanza, non significa che qualcuno menta: Anna potrebbe averlo visto attraverso una vetrata, uno specchio o un monitor.',
    tips: [
      'Le tessere “Fatti dell’ambiente” non sono decorative: possono rendere possibile una testimonianza che sembra contraddittoria.',
      'Una ricostruzione diversa da quella generata dal gioco viene accettata se rispetta tutti i fatti e tutti i vincoli.',
      'Nei livelli alti possono esserci due contraddizioni apparenti indipendenti.'
    ]
  };

  GAME_HELP.lumina = {
    title: 'LUMINA',
    goal: 'Lascia che luce, particelle e correnti prendano forma attraverso i tuoi gesti.',
    steps: [
      'Tocca lo spazio per generare una nuova sorgente luminosa.',
      'Trascina il dito per creare una corrente che attira e devia le particelle.',
      'Usa i tre simboli in basso per cambiare il tipo di gesto: luce, fiore o vortice.',
      'Non esiste una soluzione obbligatoria: puoi restare nel mondo quanto vuoi e passare a un nuovo mondo quando ti va.'
    ],
    tips: [
      'Movimenti lenti creano strutture più morbide; gesti rapidi producono scie più energiche.',
      'Quando molte particelle convergono nello stesso punto può comparire spontaneamente una fioritura luminosa.',
      'Ogni sessione usa un seme diverso e sviluppa quindi un ecosistema visivo differente.'
    ]
  };

  const legacyStartGame = startGame;
  const legacyRenderArchive = typeof renderArchive === 'function' ? renderArchive : null;
  const legacyRenderSettings = typeof renderSettings === 'function' ? renderSettings : null;
  const legacyCurrentClueText = typeof currentClueText === 'function' ? currentClueText : null;
  if(legacyCurrentClueText){currentClueText=function(){if(activeGame==='everybody'){const f=document.querySelector('.eir-feedback'),t=document.querySelector('.eir-testimonies');return (f?.innerText||t?.innerText||'EVERYBODY IS RIGHT').trim()}return legacyCurrentClueText()}}

  const CLASSIC_GAMES = [
    ['mixed','Partita Mista','Sei prove diverse in una sola sessione','mix'],
    ['sudoku','Sudoku','Completa la griglia 9×9','sudoku'],
    ['wordsearch','Cerca-parole','Trova tutte le parole nascoste','word'],
    ['anagram','Anagrammi','Ricomponi le lettere','anagram'],
    ['quiz','Quiz','Cultura generale e curiosità','quiz'],
    ['logic','Logica','Sequenze, deduzioni e codici','logic'],
    ['escape','Escape Room','Esplora, collega gli indizi, esci','escape']
  ];

  const NEXTGEN_GAMES = [
    ['shiftline','SHIFTLINE','Collega. Trasforma. Risolvi.','Puzzle logico','live'],
    ['lumina','LUMINA','Crea. Esplora. Rilassati.','Passatempo creativo','live'],
    ['everybody','EVERYBODY IS RIGHT','Tutti hanno ragione. Qual è la realtà?','Logica e deduzione','live'],
    ['another','ANHOTHER WORLD','Scopri le leggi di un mondo impossibile.','Esplorazione e logica','soon'],
    ['alibi','THE LAST ALIBI','Un giallo da risolvere.','Investigazione','soon']
  ];

  function clearSG2Mode(){
    document.body.classList.remove('sg2-home','sg2-family','sg2-nextgen','sg2-classic','sg2-detail','sg2-lumina-play','sg2-everybody-play');
  }
  function setSG2Mode(...classes){
    clearSG2Mode();
    document.body.classList.add(...classes);
    stopTimer();
  }
  function bottomNav(active='home'){
    return `<nav class="sg2-bottom" aria-label="Navigazione principale">
      <button class="${active==='home'?'active':''}" onclick="renderHome()"><span>⌂</span><small>Home</small></button>
      <button class="${active==='archive'?'active':''}" onclick="sg2OpenArchive()"><span>▥</span><small>I miei giochi</small></button>
      <button onclick="sg2OpenSettings()"><span>⚙</span><small>Impostazioni</small></button>
    </nav>`;
  }
  function statsMini(){
    const total=store.history.length;
    const wins=store.history.filter(x=>x.success).length;
    return `<div class="sg2-mini-stats"><span><b>${total}</b> partite</span><span><b>${wins}</b> completate</span></div>`;
  }

  window.sg2OpenArchive=()=>{clearSG2Mode();legacyRenderArchive?.()};
  window.sg2OpenSettings=()=>{clearSG2Mode();legacyRenderSettings?.()};
  window.sg2OpenDaily=()=>{clearSG2Mode();renderDaily()};
  window.showNextGenSoon=(name)=>toast(`${name}: in sviluppo`);

  renderHome = function renderHomeV24(){
    activeSaved=false;
    setSG2Mode('sg2-home');
    setHeader('Sala Giochi','Sala giochi 2.0');
    const total=store.history.length;
    app.innerHTML=`<div class="sg2-shell sg2-home-screen">
      <section class="sg2-home-hero">
        <div class="sg2-home-copy">
          <span class="sg2-eyebrow">SALA GIOCHI 2.0</span>
          <h2>Sala giochi</h2>
          <p>Tanti giochi, un unico posto per divertirsi.</p>
          ${statsMini()}
        </div>
        <div class="sg2-home-orbit" aria-hidden="true"><i></i><i></i><i></i></div>
      </section>
      <section class="sg2-family-choice" aria-label="Famiglie di giochi">
        <button class="sg2-family-card classic" onclick="renderClassicFamily()">
          <div class="sg2-family-art classic-art" aria-hidden="true"><span class="tile t1">S</span><span class="tile t2">A</span><span class="mini-grid"></span><span class="ball b1"></span><span class="ball b2"></span></div>
          <div class="sg2-family-copy"><span class="sg2-family-kicker">SEMPRE CON TE</span><h3>Giochi classici</h3><p>I tuoi giochi preferiti di sempre.</p></div>
          <span class="sg2-round-arrow">›</span>
        </button>
        <button class="sg2-family-card next" onclick="renderNextGenFamily()">
          <div class="sg2-family-art future-art" aria-hidden="true"><span class="future-ring r1"></span><span class="future-ring r2"></span><span class="future-core"></span><span class="future-line l1"></span><span class="future-line l2"></span></div>
          <div class="sg2-family-copy"><span class="sg2-family-kicker">NUOVA GENERAZIONE</span><h3>Nuova generazione</h3><p>Nuovi mondi da esplorare.</p></div>
          <span class="sg2-round-arrow">›</span>
        </button>
      </section>
      <p class="sg2-home-foot">${total?`I progressi restano salvati su questo dispositivo.`:'Scegli una famiglia e inizia a giocare.'}</p>
      ${bottomNav('home')}
    </div>`;
  };

  window.renderClassicFamily=function(){
    setSG2Mode('sg2-family','sg2-classic');
    setHeader('Giochi classici','I tuoi giochi preferiti di sempre');
    app.innerHTML=`<div class="sg2-shell sg2-classic-screen">
      <header class="sg2-family-header light">
        <button class="sg2-back" onclick="renderHome()" aria-label="Indietro">←</button>
        <div><span class="sg2-eyebrow">SALA GIOCHI</span><h2>Giochi classici</h2><p>I tuoi giochi preferiti di sempre.</p></div>
        <label class="sg2-desc-toggle">Descrizioni <input id="classicDescToggle" type="checkbox"><span></span></label>
      </header>
      <div class="sg2-classic-grid">
        ${CLASSIC_GAMES.map(([id,name,desc,art])=>`<button class="sg2-classic-card art-${art}" onclick="chooseDifficulty('${id}')"><span class="sg2-classic-icon">${ICONS[id]}</span><strong>${name}</strong><small>${desc}</small></button>`).join('')}
      </div>
      <button class="sg2-daily-strip" onclick="sg2OpenDaily()"><span>★</span><div><b>Sfida del giorno</b><small>Una prova diversa ogni giorno</small></div><i>›</i></button>
      ${bottomNav()}
    </div>`;
    const toggle=document.getElementById('classicDescToggle');
    toggle.onchange=()=>document.querySelector('.sg2-classic-grid')?.classList.toggle('show-desc',toggle.checked);
  };

  function ngCard([id,name,payoff,category,status]){
    const liveHandlers={shiftline:'renderShiftlineDetail()',lumina:'renderLuminaDetail()',everybody:'renderEverybodyDetail()'};
    const click=status==='live' ? (liveHandlers[id]||`showNextGenSoon('${name.replace(/'/g,"\\'")}')`) : `showNextGenSoon('${name.replace(/'/g,"\\'")}')`;
    return `<button class="sg2-ng-card ${id} ${status}" onclick="${click}">
      <span class="sg2-ng-visual" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
      <span class="sg2-ng-copy"><em>${category}</em><strong>${name}</strong><small>${payoff}</small></span>
      <span class="sg2-ng-state">${status==='live'?'GIOCA':'IN SVILUPPO'}</span><span class="sg2-round-arrow">›</span>
    </button>`;
  }

  window.renderNextGenFamily=function(){
    setSG2Mode('sg2-family','sg2-nextgen');
    setHeader('Nuova generazione','Esperienze uniche, mondi da scoprire');
    app.innerHTML=`<div class="sg2-shell sg2-nextgen-screen">
      <header class="sg2-family-header dark">
        <button class="sg2-back" onclick="renderHome()" aria-label="Indietro">←</button>
        <div><span class="sg2-eyebrow">SALA GIOCHI 2.0</span><h2>Nuova generazione</h2><p>Esperienze uniche, mondi da scoprire.</p></div>
        <div class="sg2-tech-mark" aria-hidden="true"><i></i><i></i><i></i></div>
      </header>
      <div class="sg2-ng-grid">${NEXTGEN_GAMES.map(ngCard).join('')}</div>
      ${bottomNav()}
    </div>`;
  };

  window.renderShiftlineDetail=function(){
    setSG2Mode('sg2-family','sg2-nextgen','sg2-detail');
    setHeader('SHIFTLINE','Puzzle logico');
    app.innerHTML=`<div class="sg2-shell sg2-detail-screen">
      <header class="sg2-detail-head"><button class="sg2-back" onclick="renderNextGenFamily()">←</button><span>NUOVA GENERAZIONE</span></header>
      <section class="sg2-shift-detail">
        <div class="sg2-shift-copy"><span class="sg2-eyebrow">PUZZLE LOGICO</span><h2>SHIFTLINE</h2><p class="tagline">Collega. Trasforma. Risolvi.</p><p>Ruota le tessere e ricostruisci la rete: ogni mossa può modificare anche altri nodi. Osserva le reazioni e porta energia all’intero circuito.</p>
          <div class="sg2-feature-row"><span>◎ Reazioni concatenate</span><span>↶ Annulla mosse</span><span>∞ 100 sessioni per livello</span></div>
          <h3>Scegli il livello</h3><div class="sg2-levels">${LEVEL_ORDER.map(l=>`<button onclick="startGame('shiftline','${l}')"><b>${LEVEL_NAMES[l]}</b><small>${difficultyMeta('shiftline',l)}</small></button>`).join('')}</div>
        </div>
        <div class="sg2-shift-preview" aria-label="Anteprima grafica di Shiftline"><span class="pnode a"></span><span class="pnode b"></span><span class="pnode c"></span><span class="pnode d"></span><span class="pline h1"></span><span class="pline v1"></span><span class="pline h2"></span><span class="pline v2"></span><span class="pulse"></span></div>
      </section>
      ${bottomNav()}
    </div>`;
  };


  window.renderLuminaDetail=function(){
    setSG2Mode('sg2-family','sg2-nextgen','sg2-detail');
    setHeader('LUMINA','Passatempo creativo');
    app.innerHTML=`<div class="sg2-shell sg2-detail-screen lumina-detail-screen">
      <header class="sg2-detail-head"><button class="sg2-back" onclick="renderNextGenFamily()">←</button><span>NUOVA GENERAZIONE</span></header>
      <section class="sg2-lumina-detail">
        <div class="sg2-lumina-copy"><span class="sg2-eyebrow">PASSATEMPO CREATIVO</span><h2>LUMINA</h2><p class="tagline">Crea. Esplora. Rilassati.</p><p>Un mondo di luce che prende vita con i tuoi gesti. Nessun punteggio da inseguire: disegna correnti, genera vortici e osserva ciò che nasce.</p>
          <div class="sg2-lumina-features"><span><b>✦</b> Interazione intuitiva</span><span><b>❀</b> Esperienza rilassante</span><span><b>◎</b> Mondi sempre diversi</span></div>
          <h3>Scegli l'intensità del mondo</h3><div class="sg2-levels lumina-levels">${LEVEL_ORDER.map(l=>`<button onclick="startGame('lumina','${l}')"><b>${LEVEL_NAMES[l]}</b><small>${({easy:'Sereno e rarefatto',medium:'Fluido e luminoso',hard:'Ricco e dinamico',extreme:'Cosmico e intenso'})[l]}</small></button>`).join('')}</div>
        </div>
        <div class="sg2-lumina-preview" aria-label="Anteprima grafica di Lumina"><div class="lumina-orb o1"></div><div class="lumina-orb o2"></div><div class="lumina-orb o3"></div><div class="lumina-wave w1"></div><div class="lumina-wave w2"></div><div class="lumina-hand">☝</div></div>
      </section>
      ${bottomNav()}
    </div>`;
  };


  window.renderEverybodyDetail=function(){
    setSG2Mode('sg2-family','sg2-nextgen','sg2-detail');
    setHeader('EVERYBODY IS RIGHT','Logica e deduzione');
    app.innerHTML=`<div class="sg2-shell sg2-detail-screen everybody-detail-screen">
      <header class="sg2-detail-head"><button class="sg2-back" onclick="renderNextGenFamily()">←</button><span>NUOVA GENERAZIONE</span></header>
      <section class="sg2-everybody-detail">
        <div class="sg2-everybody-copy"><span class="sg2-eyebrow">LOGICA E DEDUZIONE</span><h2>EVERYBODY<br>IS RIGHT</h2><p class="tagline">Nessuno mente. Eppure sembra impossibile.</p><p>Ricostruisci luoghi, relazioni e punti di vista finché tutte le testimonianze diventano compatibili. Il gioco non ti chiede di indovinare una risposta: devi costruire una realtà che funzioni.</p>
          <div class="sg2-everybody-features"><span><b>◉</b> Tutte le frasi sono vere</span><span><b>⌘</b> Ricostruzione libera</span><span><b>◇</b> Soluzioni alternative valide</span></div>
          <h3>Scegli la complessità</h3><div class="sg2-levels everybody-levels">${LEVEL_ORDER.map(l=>`<button onclick="startGame('everybody','${l}')"><b>${LEVEL_NAMES[l]}</b><small>${({easy:'3 persone · 1 paradosso',medium:'4 persone · più vincoli',hard:'5 persone · 2 paradossi',extreme:'6 persone · realtà molto ambigua'})[l]}</small></button>`).join('')}</div>
        </div>
        <div class="sg2-everybody-preview" aria-label="Anteprima di Everybody is Right"><div class="eir-orbit"></div><span class="eir-face f1">A</span><span class="eir-face f2">M</span><span class="eir-face f3">S</span><span class="eir-face f4">P</span><i class="eir-link l1"></i><i class="eir-link l2"></i><i class="eir-link l3"></i><div class="eir-core">TUTTI<br><b>VERI</b></div></div>
      </section>
      ${bottomNav()}
    </div>`;
  };

  startGame = function startGameV25(game, level, opts = {}) {
    clearSG2Mode();
    if (game !== 'shiftline' && game !== 'lumina' && game !== 'everybody') return legacyStartGame(game, level, opts);
    activeSaved = false;
    activeGame = game;
    activeLevel = level;
    activeSessionTracked = opts.trackSession !== false && SESSION_GAMES.has(game);
    if (activeSessionTracked) {
      const s = sessionState(game, level);
      if (s.cycleComplete) { renderCycleComplete(game, level); return; }
      activeRng = makeRng(sessionSeed(game, level));
    } else activeRng = Math.random;
    activeNoteKey = noteKeyFor(game, level);
    setHeader(GAME_NAMES[game], LEVEL_NAMES[level]);
    if(game==='shiftline') startShiftline(level);
    else if(game==='lumina') startLumina(level);
    else startEverybody(level);
  };

  const DIRS = [
    { bit: 1, dr: -1, dc: 0, opposite: 4, name: 'N' },
    { bit: 2, dr: 0, dc: 1, opposite: 8, name: 'E' },
    { bit: 4, dr: 1, dc: 0, opposite: 1, name: 'S' },
    { bit: 8, dr: 0, dc: -1, opposite: 2, name: 'W' }
  ];

  const SHIFT_CONFIG = {
    easy:    { size: 4, scramble: 12, kinds: ['link'], label: 'Legami gemelli' },
    medium:  { size: 5, scramble: 20, kinds: ['link', 'mirror'], label: 'Gemelli e specchi' },
    hard:    { size: 6, scramble: 30, kinds: ['link', 'mirror', 'pulse'], label: 'Reazioni concatenate' },
    extreme: { size: 6, scramble: 42, kinds: ['link', 'mirror', 'pulse', 'cross'], label: 'Rete instabile' }
  };

  const KIND_META = {
    link:   { symbol: '↔', name: 'Gemella', text: 'Ruota anche la compagna vicina nello stesso senso.' },
    mirror: { symbol: '⇄', name: 'Specchio', text: 'Ruota la tessera opposta in senso contrario.' },
    pulse:  { symbol: '✦', name: 'Impulso', text: 'Ruota anche le tessere adiacenti.' },
    cross:  { symbol: '⟲', name: 'Vortice', text: 'Orizzontali e verticali reagiscono in senso opposto.' }
  };

  function mod4(n) {
    return ((n % 4) + 4) % 4;
  }

  function rotateMask(mask, turns) {
    let m = mask;
    for (let k = 0; k < mod4(turns); k++) {
      m = ((m << 1) & 15) | ((m >> 3) & 1);
    }
    return m;
  }

  function snakePath(size) {
    const path = [];
    for (let r = 0; r < size; r++) {
      if (r % 2 === 0) {
        for (let c = 0; c < size; c++) path.push(r * size + c);
      } else {
        for (let c = size - 1; c >= 0; c--) path.push(r * size + c);
      }
    }
    return path;
  }

  function bitBetween(a, b, size) {
    const ar = Math.floor(a / size), ac = a % size;
    const br = Math.floor(b / size), bc = b % size;
    if (br === ar - 1 && bc === ac) return [1, 4];
    if (br === ar && bc === ac + 1) return [2, 8];
    if (br === ar + 1 && bc === ac) return [4, 1];
    if (br === ar && bc === ac - 1) return [8, 2];
    throw new Error('SHIFTLINE: path non adiacente');
  }

  function orthogonalNeighbors(index, size) {
    const r = Math.floor(index / size), c = index % size, out = [];
    for (const d of DIRS) {
      const rr = r + d.dr, cc = c + d.dc;
      if (rr >= 0 && rr < size && cc >= 0 && cc < size) out.push(rr * size + cc);
    }
    return out;
  }

  function partnerFor(index, size, kind) {
    const r = Math.floor(index / size), c = index % size;
    if (kind === 'mirror') {
      let p = size * size - 1 - index;
      if (p === index) p = c + 1 < size ? index + 1 : index - 1;
      return p;
    }
    if (c % 2 === 0 && c + 1 < size) return index + 1;
    if (c > 0) return index - 1;
    return r + 1 < size ? index + size : index - size;
  }

  function buildSolvedTiles(size, kinds) {
    const count = size * size;
    const masks = Array(count).fill(0);
    const path = snakePath(size);

    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i], b = path[i + 1];
      const [ab, ba] = bitBetween(a, b, size);
      masks[a] |= ab;
      masks[b] |= ba;
    }

    return masks.map((baseMask, index) => {
      const kind = kinds[Math.floor(activeRng() * kinds.length)];
      return {
        index,
        baseMask,
        rot: 0,
        kind,
        partner: partnerFor(index, size, kind)
      };
    });
  }

  function effectMap(state, index, direction = 1) {
    const tile = state.tiles[index];
    const changes = new Map();
    const add = (i, delta) => {
      if (i < 0 || i >= state.tiles.length) return;
      changes.set(i, (changes.get(i) || 0) + delta * direction);
    };

    add(index, 1);

    if (tile.kind === 'link') {
      add(tile.partner, 1);
    } else if (tile.kind === 'mirror') {
      add(tile.partner, -1);
    } else if (tile.kind === 'pulse') {
      orthogonalNeighbors(index, state.size).forEach(i => add(i, 1));
    } else if (tile.kind === 'cross') {
      const r = Math.floor(index / state.size), c = index % state.size;
      DIRS.forEach(d => {
        const rr = r + d.dr, cc = c + d.dc;
        if (rr < 0 || rr >= state.size || cc < 0 || cc >= state.size) return;
        add(rr * state.size + cc, d.dc !== 0 ? 1 : -1);
      });
    }

    return changes;
  }

  function applyEffect(state, index, direction = 1) {
    const changes = effectMap(state, index, direction);
    const affected = [];
    changes.forEach((delta, i) => {
      state.tiles[i].rot = mod4(state.tiles[i].rot + delta);
      affected.push(i);
    });
    return affected;
  }

  function maskAt(state, index) {
    const t = state.tiles[index];
    return rotateMask(t.baseMask, t.rot);
  }

  function networkState(state) {
    const size = state.size;
    const masks = state.tiles.map((_, i) => maskAt(state, i));
    const seen = new Set([state.source]);
    const queue = [state.source];

    while (queue.length) {
      const i = queue.shift();
      const r = Math.floor(i / size), c = i % size;
      for (const d of DIRS) {
        if (!(masks[i] & d.bit)) continue;
        const rr = r + d.dr, cc = c + d.dc;
        if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue;
        const j = rr * size + cc;
        if (!(masks[j] & d.opposite)) continue;
        if (!seen.has(j)) {
          seen.add(j);
          queue.push(j);
        }
      }
    }

    let perfect = seen.size === state.tiles.length;
    if (perfect) {
      outer:
      for (let i = 0; i < state.tiles.length; i++) {
        const r = Math.floor(i / size), c = i % size;
        for (const d of DIRS) {
          if (!(masks[i] & d.bit)) continue;
          const rr = r + d.dr, cc = c + d.dc;
          if (rr < 0 || rr >= size || cc < 0 || cc >= size) {
            perfect = false;
            break outer;
          }
          const j = rr * size + cc;
          if (!(masks[j] & d.opposite)) {
            perfect = false;
            break outer;
          }
        }
      }
    }

    return { masks, seen, perfect };
  }

  function makeShiftline(level) {
    const cfg = SHIFT_CONFIG[level];
    const state = {
      level,
      size: cfg.size,
      tiles: buildSolvedTiles(cfg.size, cfg.kinds),
      source: snakePath(cfg.size)[0],
      target: snakePath(cfg.size).at(-1),
      moves: 0,
      resets: 0,
      history: [],
      finished: false,
      initialRotations: []
    };

    let guard = 0;
    do {
      state.tiles.forEach(t => { t.rot = 0; });
      for (let k = 0; k < cfg.scramble; k++) {
        const idx = Math.floor(activeRng() * state.tiles.length);
        applyEffect(state, idx, 1);
      }
      guard++;
    } while (networkState(state).perfect && guard < 12);

    // Sicurezza estrema: se una rara combinazione si ricompone, forza una mossa legale.
    if (networkState(state).perfect) applyEffect(state, 0, 1);

    state.initialRotations = state.tiles.map(t => t.rot);
    return state;
  }

  function lineSvg(mask) {
    const lines = [];
    if (mask & 1) lines.push('<path d="M50 50 L50 0"/>');
    if (mask & 2) lines.push('<path d="M50 50 L100 50"/>');
    if (mask & 4) lines.push('<path d="M50 50 L50 100"/>');
    if (mask & 8) lines.push('<path d="M50 50 L0 50"/>');
    return `<svg class="shift-wire" viewBox="0 0 100 100" aria-hidden="true">${lines.join('')}<circle cx="50" cy="50" r="8"/></svg>`;
  }

  function startShiftline(level) {
    const state = makeShiftline(level);
    const cfg = SHIFT_CONFIG[level];

    app.innerHTML = gameShell('shiftline', level, `
      <div class="shift-intro">
        <div><b>${cfg.label}</b><span>Ruota una tessera: la rete reagisce.</span></div>
        <div class="shift-goal"><span>●</span> accendi tutto <b>→</b> <span>◆</span></div>
      </div>
      <div class="shift-hud">
        <span>Energia <b id="shiftEnergy">0%</b></span>
        <span>Mosse <b id="shiftMoves">0</b></span>
        <span>Reset <b id="shiftResets">0</b></span>
      </div>
      <div class="shift-board-wrap">
        <div id="shiftBoard" class="shift-board" style="--shift-size:${state.size}"></div>
      </div>
      <div id="shiftLegend" class="shift-legend"></div>
      <div class="actions shift-actions">
        <button id="shiftUndo" class="secondary" type="button">↶ Annulla</button>
        <button id="shiftReset" class="secondary" type="button">⟳ Ripristina schema</button>
      </div>
      <div id="shiftMessage" class="shift-message">Tocca una tessera e osserva quali altre reagiscono.</div>
    `);

    const board = document.getElementById('shiftBoard');
    const undoBtn = document.getElementById('shiftUndo');
    const resetBtn = document.getElementById('shiftReset');

    const usedKinds = [...new Set(state.tiles.map(t => t.kind))];
    document.getElementById('shiftLegend').innerHTML = usedKinds.map(k => {
      const m = KIND_META[k];
      return `<span title="${m.text}"><b>${m.symbol}</b> ${m.name}</span>`;
    }).join('');

    undoBtn.onclick = () => {
      if (state.finished || !state.history.length) return;
      const idx = state.history.pop();
      const affected = applyEffect(state, idx, -1);
      state.moves = Math.max(0, state.moves - 1);
      render(affected);
    };

    resetBtn.onclick = () => {
      if (state.finished) return;
      state.tiles.forEach((t, i) => { t.rot = state.initialRotations[i]; });
      state.history.length = 0;
      state.resets++;
      render(state.tiles.map(t => t.index));
      document.getElementById('shiftMessage').textContent = 'Schema iniziale ripristinato.';
    };

    function render(affected = []) {
      const net = networkState(state);
      const affectedSet = new Set(affected);
      board.innerHTML = state.tiles.map((t, i) => {
        const powered = net.seen.has(i);
        const meta = KIND_META[t.kind];
        const marker = i === state.source ? '<span class="shift-node source">●</span>' : i === state.target ? '<span class="shift-node target">◆</span>' : '';
        return `<button class="shift-tile kind-${t.kind} ${powered ? 'powered' : ''} ${affectedSet.has(i) ? 'affected' : ''}" data-index="${i}" aria-label="Tessera ${i + 1}, ${meta.name}">
          <span class="shift-kind">${meta.symbol}</span>
          ${lineSvg(net.masks[i])}
          ${marker}
        </button>`;
      }).join('');

      board.querySelectorAll('.shift-tile').forEach(btn => {
        btn.onclick = () => {
          if (state.finished) return;
          const idx = Number(btn.dataset.index);
          state.history.push(idx);
          state.moves++;
          const changed = applyEffect(state, idx, 1);
          render(changed);
          checkWin();
        };
      });

      const pct = Math.round(net.seen.size / state.tiles.length * 100);
      document.getElementById('shiftEnergy').textContent = `${pct}%`;
      document.getElementById('shiftMoves').textContent = state.moves;
      document.getElementById('shiftResets').textContent = state.resets;
      undoBtn.disabled = !state.history.length;

      if (affected.length) {
        setTimeout(() => board.querySelectorAll('.affected').forEach(el => el.classList.remove('affected')), 260);
      }
    }

    function checkWin() {
      const net = networkState(state);
      if (!net.perfect || state.finished) return;
      state.finished = true;
      board.classList.add('solved');
      document.getElementById('shiftMessage').innerHTML = '<b>Rete completa.</b> Tutti i nodi sono alimentati.';
      const sec = Math.floor((Date.now() - activeStart) / 1000);
      const score = Math.max(100, 1800 - state.moves * 14 - state.resets * 80 - sec * 2);
      setTimeout(() => {
        concludeSession('shiftline', level, score, true, `Rete completata in <b>${state.moves}</b> mosse. Punteggio: <b>${score}</b>.`);
      }, 650);
    }

    render();
    startTimer();
  }


  // ---------- LUMINA ----------
  function startLumina(level){
    setSG2Mode('sg2-lumina-play','sg2-everybody-play');
    setHeader('LUMINA',LEVEL_NAMES[level]);
    const cfg={
      easy:{count:70,speed:.30},
      medium:{count:105,speed:.40},
      hard:{count:145,speed:.50},
      extreme:{count:190,speed:.62}
    }[level];
    const session=sessionState('lumina',level);
    app.innerHTML=`<div class="lumina-play-shell">
      <canvas id="luminaCanvas" aria-label="Mondo interattivo Lumina"></canvas>
      <div class="lumina-topbar">
        <button id="luminaBack" class="lumina-circle" aria-label="Torna a Nuova generazione">←</button>
        <div class="lumina-brand"><b>LUMINA</b><span>Sessione ${session.session}/100 · ${LEVEL_NAMES[level]}</span></div>
        <div class="lumina-top-actions"><button id="luminaHelp" class="lumina-circle" aria-label="Come si gioca">?</button><button id="luminaSound" class="lumina-circle" aria-label="Attiva audio">🔈</button><button id="luminaFinish" class="lumina-pill">Nuovo mondo</button></div>
      </div>
      <div class="lumina-discovery"><span id="luminaBloomCount">0</span><small>fioriture</small></div>
      <div class="lumina-modebar" role="toolbar" aria-label="Gesti Lumina">
        <button class="active" data-mode="light" aria-label="Luce" title="Luce">✦</button>
        <button data-mode="bloom" aria-label="Fiore" title="Fiore">❀</button>
        <button data-mode="vortex" aria-label="Vortice" title="Vortice">◎</button>
      </div>
      <div id="luminaHint" class="lumina-hint">Tocca o trascina nello spazio</div>
      <div id="luminaGuide" class="lumina-guide" aria-hidden="true">
        <div class="lumina-guide-card" role="dialog" aria-modal="true" aria-labelledby="luminaGuideTitle">
          <button id="luminaGuideClose" class="lumina-guide-x" type="button" aria-label="Chiudi istruzioni">×</button>
          <span class="lumina-guide-kicker">COME SI GIOCA</span>
          <h2 id="luminaGuideTitle">Lascia che il mondo reagisca ai tuoi gesti</h2>
          <p class="lumina-guide-intro">LUMINA non ha una soluzione da trovare: esplora, combina i gesti e osserva cosa nasce.</p>
          <div class="lumina-guide-grid">
            <div><b>☝</b><span><strong>Tocca</strong>Genera un impulso di luce.</span></div>
            <div><b>〰</b><span><strong>Trascina</strong>Disegna una corrente che muove le particelle.</span></div>
            <div><b>✦</b><span><strong>Luce</strong>Attira e accompagna lo sciame.</span></div>
            <div><b>❀</b><span><strong>Fiore</strong>Crea fioriture luminose nel punto toccato.</span></div>
            <div><b>◎</b><span><strong>Vortice</strong>Fa ruotare le particelle attorno al dito.</span></div>
            <div><b>🔊</b><span><strong>Audio</strong>Il pulsante in alto attiva o disattiva l'ambiente sonoro.</span></div>
          </div>
          <p class="lumina-guide-note">Non esiste Game Over. Quando vuoi cambiare scenario premi <b>Nuovo mondo</b>.</p>
          <button id="luminaGuideStart" class="lumina-guide-start" type="button">Inizia a esplorare</button>
        </div>
      </div>
    </div>`;
    const canvas=document.getElementById('luminaCanvas'),ctx=canvas.getContext('2d',{alpha:false});
    let w=0,h=0,dpr=1,particles=[],blooms=[],pointer=null,mode='light',running=true,bloomCount=0,frame=0,soundOn=false,audioCtx=null,audioNodes=[],audioMaster=null;
    const hueBase={easy:196,medium:204,hard:218,extreme:232}[level];
    const rnd=(a=1,b=0)=>b+(a-b)*activeRng();
    function resize(){dpr=Math.min(2,window.devicePixelRatio||1);w=innerWidth;h=innerHeight;canvas.width=w*dpr;canvas.height=h*dpr;canvas.style.width=w+'px';canvas.style.height=h+'px';ctx.setTransform(dpr,0,0,dpr,0,0)}
    function spawnParticle(x=rnd(w),y=rnd(h),energy=.4){const a=rnd(Math.PI*2),sp=rnd(.7,.15)*cfg.speed;return{x,y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,r:rnd(3.2,1.1),life:rnd(1,.45),energy,hue:hueBase+rnd(55,-20),phase:rnd(Math.PI*2)}}
    function seed(){particles=Array.from({length:cfg.count},()=>spawnParticle())}
    function burst(x,y,n=12,power=1){for(let i=0;i<n;i++){const p=spawnParticle(x+rnd(28,-28),y+rnd(28,-28),power);const a=rnd(Math.PI*2),sp=rnd(2.2,.5)*power;p.vx+=Math.cos(a)*sp;p.vy+=Math.sin(a)*sp;particles.push(p)}while(particles.length>cfg.count*1.8)particles.shift()}
    function addBloom(x,y,scale=1,countIt=true){blooms.push({x,y,r:8,max:rnd(115,62)*scale,life:1,hue:hueBase+rnd(70,-15)});if(countIt){bloomCount++;document.getElementById('luminaBloomCount').textContent=bloomCount;playChime(.96+rnd(.16,0))}burst(x,y,18,1.2)}
    function forceAt(p){let fx=Math.sin((p.y+frame*.45)*.008+p.phase)*.012,fy=Math.cos((p.x-frame*.35)*.007+p.phase)*.012;if(pointer){let dx=pointer.x-p.x,dy=pointer.y-p.y,dist=Math.hypot(dx,dy)+1;if(dist<220){let s=(1-dist/220);if(mode==='vortex'){fx+=(-dy/dist)*s*.19;fy+=(dx/dist)*s*.19}else if(mode==='bloom'){fx+=(dx/dist)*s*.08;fy+=(dy/dist)*s*.08}else{fx+=(dx/dist)*s*.12;fy+=(dy/dist)*s*.12}}}return[fx,fy]}
    function update(){for(const p of particles){const[fx,fy]=forceAt(p);p.vx=(p.vx+fx)*.992;p.vy=(p.vy+fy)*.992;const lim=2.3*cfg.speed+.4,sp=Math.hypot(p.vx,p.vy);if(sp>lim){p.vx=p.vx/sp*lim;p.vy=p.vy/sp*lim}p.x+=p.vx;p.y+=p.vy;if(p.x<-20)p.x=w+20;if(p.x>w+20)p.x=-20;if(p.y<-20)p.y=h+20;if(p.y>h+20)p.y=-20;p.phase+=.009}blooms.forEach(b=>{b.r+=(b.max-b.r)*.035;b.life-=.0045});blooms=blooms.filter(b=>b.life>0)}
    function draw(){ctx.fillStyle='rgba(2,8,22,.18)';ctx.fillRect(0,0,w,h);const bg=ctx.createRadialGradient(w*.5,h*.45,20,w*.5,h*.5,Math.max(w,h)*.7);bg.addColorStop(0,'rgba(15,58,118,.055)');bg.addColorStop(1,'rgba(2,7,18,.02)');ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);ctx.globalCompositeOperation='lighter';for(const b of blooms){ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,Math.PI*2);ctx.strokeStyle=`hsla(${b.hue},95%,72%,${Math.max(0,b.life)*.34})`;ctx.lineWidth=2.2;ctx.stroke();ctx.beginPath();ctx.arc(b.x,b.y,b.r*.55,0,Math.PI*2);ctx.strokeStyle=`hsla(${b.hue+45},95%,76%,${Math.max(0,b.life)*.22})`;ctx.stroke()}for(const p of particles){const glow=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,p.r*5);glow.addColorStop(0,`hsla(${p.hue},100%,86%,${.72*p.life})`);glow.addColorStop(.28,`hsla(${p.hue},100%,65%,${.35*p.life})`);glow.addColorStop(1,`hsla(${p.hue},100%,50%,0)`);ctx.fillStyle=glow;ctx.beginPath();ctx.arc(p.x,p.y,p.r*5,0,Math.PI*2);ctx.fill();ctx.fillStyle=`hsla(${p.hue},100%,90%,${.9*p.life})`;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill()}ctx.globalCompositeOperation='source-over'}
    function loop(){if(!running)return;frame++;update();draw();requestAnimationFrame(loop)}
    function pos(e){const r=canvas.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top}}
    function down(e){e.preventDefault();const q=pos(e);pointer={...q,last:q,start:performance.now(),travel:0};burst(q.x,q.y,mode==='bloom'?18:10,mode==='vortex'?1.25:1);if(mode==='bloom')addBloom(q.x,q.y,.72);document.getElementById('luminaHint').classList.add('fade')}
    function move(e){if(!pointer)return;e.preventDefault();const q=pos(e);pointer.travel+=Math.hypot(q.x-pointer.last.x,q.y-pointer.last.y);pointer.x=q.x;pointer.y=q.y;pointer.last=q;if(frame%3===0)burst(q.x,q.y,mode==='light'?2:1,.65)}
    function up(){if(!pointer)return;const held=performance.now()-pointer.start;if((pointer.travel>140||held>650)&&activeRng()<.8)addBloom(pointer.x,pointer.y,mode==='vortex'?1.25:1);pointer=null}
    canvas.addEventListener('pointerdown',down,{passive:false});canvas.addEventListener('pointermove',move,{passive:false});window.addEventListener('pointerup',up,{passive:true});
    document.querySelectorAll('.lumina-modebar button').forEach(b=>b.onclick=()=>{mode=b.dataset.mode;document.querySelectorAll('.lumina-modebar button').forEach(x=>x.classList.toggle('active',x===b));if(mode==='vortex')addBloom(w*.5,h*.5,.95)});
    function setGuide(open){const g=document.getElementById('luminaGuide');if(!g)return;g.classList.toggle('show',open);g.setAttribute('aria-hidden',open?'false':'true')}
    function playChime(mult=1){if(!soundOn||!audioCtx||!audioMaster)return;try{const now=audioCtx.currentTime,o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type='sine';o.frequency.setValueAtTime(523.25*mult,now);o.frequency.exponentialRampToValueAtTime(659.25*mult,now+.42);g.gain.setValueAtTime(.0001,now);g.gain.exponentialRampToValueAtTime(.055,now+.025);g.gain.exponentialRampToValueAtTime(.0001,now+.75);o.connect(g);g.connect(audioMaster);o.start(now);o.stop(now+.78)}catch{}}
    async function startAmbientAudio(){const AC=window.AudioContext||window.webkitAudioContext;if(!AC){document.getElementById('luminaHint').textContent='Audio non disponibile su questo browser';return false}try{audioCtx=new AC();await audioCtx.resume();audioMaster=audioCtx.createGain();audioMaster.gain.setValueAtTime(.0001,audioCtx.currentTime);audioMaster.gain.exponentialRampToValueAtTime(.12,audioCtx.currentTime+.45);const filter=audioCtx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=1350;filter.Q.value=.7;filter.connect(audioMaster);audioMaster.connect(audioCtx.destination);const lfo=audioCtx.createOscillator(),lfoGain=audioCtx.createGain();lfo.frequency.value=.09;lfoGain.gain.value=.012;lfo.connect(lfoGain);for(const [f,vol,type] of [[220,.07,'sine'],[329.63,.045,'sine'],[440,.025,'triangle']]){const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type=type;o.frequency.value=f;g.gain.value=vol;lfoGain.connect(g.gain);o.connect(g);g.connect(filter);o.start();audioNodes.push(o)}lfo.start();audioNodes.push(lfo);soundOn=true;const b=document.getElementById('luminaSound');b.classList.add('active');b.textContent='🔊';b.setAttribute('aria-label','Disattiva audio');playChime(1);document.getElementById('luminaHint').textContent='Audio attivo';setTimeout(()=>{const h=document.getElementById('luminaHint');if(h)h.textContent='Tocca o trascina nello spazio'},1100);return true}catch{soundOn=false;return false}}
    async function stopAmbientAudio(){soundOn=false;const b=document.getElementById('luminaSound');if(b){b.classList.remove('active');b.textContent='🔈';b.setAttribute('aria-label','Attiva audio')}if(audioCtx){try{audioNodes.forEach(n=>n.stop?.());await audioCtx.close()}catch{}audioCtx=null;audioNodes=[];audioMaster=null}}
    function cleanup(){running=false;window.removeEventListener('pointerup',up);window.removeEventListener('resize',resize);if(audioCtx){try{audioNodes.forEach(n=>n.stop?.());audioCtx.close()}catch{}audioCtx=null;audioNodes=[];audioMaster=null}}
    document.getElementById('luminaBack').onclick=()=>{cleanup();renderNextGenFamily()};
    document.getElementById('luminaHelp').onclick=()=>setGuide(true);
    document.getElementById('luminaGuideClose').onclick=()=>setGuide(false);
    document.getElementById('luminaGuideStart').onclick=()=>{localStorage.setItem('sala_giochi_lumina_guide_v1','1');setGuide(false)};
    document.getElementById('luminaGuide').onclick=e=>{if(e.target.id==='luminaGuide')setGuide(false)};
    document.getElementById('luminaSound').onclick=async()=>{if(soundOn)await stopAmbientAudio();else await startAmbientAudio()};
    document.getElementById('luminaFinish').onclick=()=>{if(!running)return;cleanup();clearSG2Mode();const score=Math.max(1,bloomCount)*100;concludeSession('lumina',level,score,true,`Hai lasciato questo mondo con <b>${bloomCount}</b> fioriture luminose. Nessun punteggio da inseguire: puoi semplicemente entrare nel prossimo.`)};
    window.addEventListener('resize',resize,{passive:true});resize();ctx.fillStyle='#020816';ctx.fillRect(0,0,w,h);seed();for(let i=0;i<3;i++)addBloom(rnd(w*.78,w*.22),rnd(h*.72,h*.22),rnd(.9,.5),false);startTimer();loop();if(!localStorage.getItem('sala_giochi_lumina_guide_v1'))setTimeout(()=>setGuide(true),260);
  }


  // ---------- EVERYBODY IS RIGHT ----------
  const EIR_NAMES=['Anna','Marco','Sara','Paolo','Elena','Davide','Giulia','Lorenzo','Marta','Andrea','Clara','Nicolò'];
  const EIR_PLACES=[
    ['salone','Salone','▤'],['studio','Studio','▣'],['cucina','Cucina','◫'],['serra','Serra','⌂'],['corridoio','Corridoio','═'],['terrazza','Terrazza','▱'],['biblioteca','Biblioteca','▥']
  ];
  const EIR_ASSUMPTIONS=[
    ['visual_same','STESSO LUOGO','Per vedere qualcuno devo trovarmi nella sua stessa stanza.','◉'],
    ['audio_same','VOCE = PRESENZA','Se sento una voce, quella persona deve essere lì.','◌'],
    ['spoken_only','“DIRE” = PARLARE','Se qualcuno mi ha detto qualcosa, deve averlo fatto a voce.','⌁'],
    ['one_view','PUNTO DI VISTA','Una scena può essere osservata solo direttamente.','◇'],
    ['continuous','CONTINUITÀ','Ciò che osservo deve accadere nello stesso spazio e nello stesso momento.','∞'],
    ['unique_path','UNICO PERCORSO','Per collegare due luoghi serve necessariamente un passaggio fisico.','↔']
  ];
  const EIR_BRIDGES={
    visual:[
      ['mirror','SPECCHIO','Uno specchio ad angolo rende visibile l’altra stanza.','◇'],
      ['window','VETRATA','Una vetrata interna permette di vedere attraverso due ambienti.','▱'],
      ['camera','MONITOR','Una telecamera in diretta mostra l’altro ambiente.','▣'],
      ['reflection','RIFLESSO','Una superficie riflettente mostra ciò che è fuori campo.','◈']
    ],
    audio:[
      ['intercom','INTERFONO','Le stanze sono collegate da un interfono aperto.','⌁'],
      ['phone','TELEFONO','La voce arriva tramite una chiamata.','◌'],
      ['recording','REGISTRAZIONE','La voce proviene da un messaggio registrato.','▶'],
      ['speaker','ALTOPARLANTE','Un altoparlante ritrasmette la voce altrove.','◉']
    ],
    message:[
      ['text','MESSAGGIO','L’informazione è arrivata per iscritto sul telefono.','▧'],
      ['note','BIGLIETTO','La frase era stata lasciata su un biglietto.','□'],
      ['gesture','GESTO','Il significato è stato comunicato senza parole.','⌘'],
      ['recording','REGISTRAZIONE','Il messaggio era stato registrato prima.','▶']
    ]
  };

  function eirShufflePick(arr,n){return shuffle(arr).slice(0,n)}
  function eirAdjacency(placeCount){
    const adj={};for(let i=0;i<placeCount;i++){adj[i]=new Set();if(i>0)adj[i].add(i-1);if(i<placeCount-1)adj[i].add(i+1)}
    if(placeCount>=4){adj[0].add(2);adj[2].add(0)}
    return adj;
  }
  function eirConstraintText(c,names,places,time){
    const N=i=>names[i], P=i=>places[i][1];
    if(c.type==='at')return `${N(c.a)}: «Alle ${time} ero in ${P(c.p)}.»`;
    if(c.type==='notAt')return `${N(c.a)}: «Alle ${time} non ero in ${P(c.p)}.»`;
    if(c.type==='different')return `${N(c.a)}: «Alle ${time} io e ${N(c.b)} non eravamo nello stesso ambiente.»`;
    if(c.type==='same')return `${N(c.a)}: «Alle ${time} ero nello stesso ambiente di ${N(c.b)}.»`;
    if(c.type==='adjacentPlace')return `${N(c.a)}: «Alle ${time} ero in un ambiente confinante con ${P(c.p)}.»`;
    if(c.type==='adjacentPeople')return `${N(c.a)}: «Alle ${time} ero in una stanza confinante con quella di ${N(c.b)}.»`;
    return '';
  }
  function eirSatisfies(assign,c,adj){
    if(c.type==='at')return assign[c.a]===c.p;
    if(c.type==='notAt')return assign[c.a]!==c.p;
    if(c.type==='different')return assign[c.a]!==assign[c.b];
    if(c.type==='same')return assign[c.a]===assign[c.b];
    if(c.type==='adjacentPlace')return adj[assign[c.a]]?.has(c.p)||false;
    if(c.type==='adjacentPeople')return adj[assign[c.a]]?.has(assign[c.b])||false;
    return true;
  }
  function eirEnumerate(personCount,placeCount,constraints,adj,limit=60){
    const out=[],a=Array(personCount).fill(0);
    function go(i){if(out.length>=limit)return;if(i===personCount){if(constraints.every(c=>eirSatisfies(a,c,adj)))out.push([...a]);return}for(let p=0;p<placeCount;p++){a[i]=p;go(i+1);if(out.length>=limit)return}}
    go(0);return out;
  }
  function makeEverybody(level){
    const cfg={easy:{people:3,places:3,challenges:1,targetSolutions:2},medium:{people:4,places:4,challenges:1,targetSolutions:3},hard:{people:5,places:4,challenges:2,targetSolutions:4},extreme:{people:6,places:5,challenges:2,targetSolutions:5}}[level];
    const names=eirShufflePick(EIR_NAMES,cfg.people);
    const places=eirShufflePick(EIR_PLACES,cfg.places);
    const time=`${20+Math.floor(activeRng()*2)}:${['00','10','15','20','30','40'][Math.floor(activeRng()*6)]}`;
    const adj=eirAdjacency(cfg.places);
    let hidden=[];
    if(level==='easy'||level==='medium')hidden=shuffle([...Array(cfg.places).keys()]).slice(0,cfg.people);
    else hidden=Array.from({length:cfg.people},(_,i)=>i<cfg.places?i:Math.floor(activeRng()*cfg.places));
    hidden=shuffle(hidden);

    const constraints=[];
    const candidates=[];
    for(let i=0;i<cfg.people;i++)candidates.push({type:'at',a:i,p:hidden[i]});
    for(let i=0;i<cfg.people;i++){
      let wrong=(hidden[i]+1+Math.floor(activeRng()*(cfg.places-1)))%cfg.places;
      if(wrong===hidden[i])wrong=(wrong+1)%cfg.places;
      candidates.push({type:'notAt',a:i,p:wrong});
    }
    for(let a=0;a<cfg.people;a++)for(let b=a+1;b<cfg.people;b++){
      if(hidden[a]===hidden[b])candidates.push({type:'same',a,b});
      else candidates.push({type:'different',a,b});
      if(adj[hidden[a]]?.has(hidden[b]))candidates.push({type:'adjacentPeople',a,b});
    }
    for(let a=0;a<cfg.people;a++)for(let p=0;p<cfg.places;p++)if(adj[hidden[a]]?.has(p))candidates.push({type:'adjacentPlace',a,p});

    let pool=shuffle(candidates),solutions=[];
    const minBase={easy:2,medium:3,hard:4,extreme:5}[level];
    for(const c of pool){
      if(constraints.some(x=>JSON.stringify(x)===JSON.stringify(c)))continue;
      constraints.push(c);
      solutions=eirEnumerate(cfg.people,cfg.places,constraints,adj,80);
      if(constraints.length>=minBase && solutions.length<=cfg.targetSolutions && solutions.length>0)break;
    }
    if(!solutions.length)solutions=[hidden];

    const challengeTypes=level==='easy'?['visual']:level==='medium'?[activeRng()<.5?'visual':'audio']:shuffle(['visual','audio','message']).slice(0,cfg.challenges);
    const challenges=[];
    const occupiedPairs=[];
    for(let k=0;k<cfg.challenges;k++){
      const type=challengeTypes[k];
      let observer=0,target=1;
      for(let tries=0;tries<30;tries++){
        observer=Math.floor(activeRng()*cfg.people);target=Math.floor(activeRng()*cfg.people);
        if(observer!==target&&hidden[observer]!==hidden[target]&&!occupiedPairs.some(x=>x[0]===observer&&x[1]===target))break;
      }
      occupiedPairs.push([observer,target]);
      const options=EIR_BRIDGES[type];
      const bridge=options[Math.floor(activeRng()*options.length)];
      let text='';
      if(type==='visual')text=`${names[observer]}: «Alle ${time} ho visto ${names[target]} in ${places[hidden[target]][1]}.»`;
      if(type==='audio')text=`${names[observer]}: «Alle ${time} ho sentito chiaramente la voce di ${names[target]}.»`;
      if(type==='message')text=`${names[observer]}: «Alle ${time} ${names[target]} mi ha detto di non muovermi.»`;
      const fact={
        mirror:`Uno specchio orientabile in ${places[hidden[observer]][1]} riflette parte di ${places[hidden[target]][1]}.`,
        window:`Tra ${places[hidden[observer]][1]} e ${places[hidden[target]][1]} c’è una vetrata interna.`,
        camera:`In ${places[hidden[observer]][1]} è acceso un monitor collegato in diretta a ${places[hidden[target]][1]}.`,
        reflection:`Una superficie lucida in ${places[hidden[observer]][1]} riflette l’ingresso di ${places[hidden[target]][1]}.`,
        intercom:`L’interfono tra ${places[hidden[observer]][1]} e ${places[hidden[target]][1]} risulta aperto.`,
        phone:`Il registro mostra una chiamata tra ${names[observer]} e ${names[target]} alle ${time}.`,
        recording:`In ${places[hidden[observer]][1]} c’è un dispositivo che può riprodurre messaggi registrati.`,
        speaker:`L’impianto audio di ${places[hidden[observer]][1]} può ricevere il segnale da ${places[hidden[target]][1]}.`,
        text:`Sul telefono di ${names[observer]} risulta un messaggio di ${names[target]} alle ${time}.`,
        note:`Sul tavolo di ${places[hidden[observer]][1]} c’è un biglietto scritto da ${names[target]}.`,
        gesture:`Da ${places[hidden[observer]][1]} è possibile vedere i gesti fatti all’ingresso di ${places[hidden[target]][1]}.`
      }[bridge[0]]||`Un dispositivo collega ${places[hidden[observer]][1]} e ${places[hidden[target]][1]}.`;
      challenges.push({type,observer,target,bridge:bridge[0],text,fact});
    }

    const assumptionIds=[...new Set(challenges.map(c=>c.type==='visual'?'visual_same':c.type==='audio'?'audio_same':'spoken_only'))];
    const decoys=shuffle(EIR_ASSUMPTIONS.filter(a=>!assumptionIds.includes(a[0]))).slice(0,level==='easy'?2:level==='medium'?3:4);
    const assumptions=shuffle([...EIR_ASSUMPTIONS.filter(a=>assumptionIds.includes(a[0])),...decoys]);
    const testimony=shuffle([...constraints.map(c=>eirConstraintText(c,names,places,time)),...challenges.map(c=>c.text)]);
    return {cfg,names,places,time,adj,hidden,constraints,solutions,challenges,assumptionIds,assumptions,testimony};
  }

  function startEverybody(level){
    setSG2Mode('sg2-everybody-play');
    setHeader('EVERYBODY IS RIGHT',LEVEL_NAMES[level]);
    const g=makeEverybody(level),session=sessionState('everybody',level);
    const selectedAssumptions=new Set(),bridgeChoices={},assign=Array(g.cfg.people).fill(null);
    let selectedPerson=0,checks=0,finished=false;
    if(level==='easy'){
      const c=g.constraints.find(x=>x.type==='at');
      if(c)assign[c.a]=c.p;
    }
    app.innerHTML=gameShell('everybody',level,`
      <div class="eir-rule"><span>REGOLA DEL CASO</span><b>Nessuno mente.</b><small>Costruisci una realtà in cui tutto possa essere vero.</small></div>
      <div class="eir-sessionline"><span>Sessione ${session.session}/100</span><span>Ora chiave <b>${g.time}</b></span><span id="eirChecks">Verifiche 0</span></div>
      <section class="eir-panel"><div class="eir-panel-head"><span>01</span><div><b>Testimonianze</b><small>Tutte sono vere, anche quando sembrano incompatibili.</small></div></div><div class="eir-testimonies">${g.testimony.map((t,i)=>`<article><i>${String(i+1).padStart(2,'0')}</i><p>${t}</p></article>`).join('')}</div></section>
      <section class="eir-panel"><div class="eir-panel-head"><span>02</span><div><b>Fatti dell’ambiente</b><small>Osserva ciò che rende possibili collegamenti non ovvi.</small></div></div><div class="eir-facts">${g.challenges.map((c,i)=>`<div><span>${['◇','⌁','▧'][i%3]}</span><p>${c.fact}</p></div>`).join('')}</div></section>
      <section class="eir-panel reality"><div class="eir-panel-head"><span>03</span><div><b>Ricostruisci la realtà</b><small>Tocca una persona, poi il luogo in cui pensi si trovasse alle ${g.time}.</small></div></div>
        <div id="eirPeople" class="eir-people"></div>
        <div id="eirMap" class="eir-map"></div>
      </section>
      <section class="eir-panel"><div class="eir-panel-head"><span>04</span><div><b>Le cose che stai dando per scontate</b><small>Seleziona solo le assunzioni che devi abbandonare.</small></div></div><div id="eirAssumptions" class="eir-assumptions">${g.assumptions.map(a=>`<button data-id="${a[0]}"><b>${a[3]}</b><span><strong>${a[1]}</strong><small>${a[2]}</small></span></button>`).join('')}</div></section>
      <section class="eir-panel"><div class="eir-panel-head"><span>05</span><div><b>Collegamenti nascosti</b><small>Per ogni apparente contraddizione indica come può essere vera.</small></div></div><div class="eir-bridges">${g.challenges.map((c,i)=>`<div class="eir-challenge"><p><b>Paradosso ${i+1}</b> · ${c.text}</p><div>${EIR_BRIDGES[c.type].map(o=>`<button data-ch="${i}" data-bridge="${o[0]}"><span>${o[3]}</span><b>${o[1]}</b></button>`).join('')}</div></div>`).join('')}</div></section>
      <div id="eirFeedback" class="eir-feedback">Quando la tua ricostruzione è pronta, verifica se tutte le frasi possono convivere.</div>
      <div class="actions eir-actions"><button id="eirReset" class="secondary" type="button">⟳ Azzera tavolo</button><button id="eirVerify" class="primary" type="button">Verifica realtà</button></div>
    `);
    const people=document.getElementById('eirPeople'),map=document.getElementById('eirMap'),feedback=document.getElementById('eirFeedback');
    function renderPeople(){people.innerHTML=g.names.map((n,i)=>`<button class="${selectedPerson===i?'selected':''} ${assign[i]!==null?'placed':''}" data-person="${i}"><span>${n[0]}</span><b>${n}</b><small>${assign[i]===null?'da collocare':g.places[assign[i]][1]}</small></button>`).join('');people.querySelectorAll('button').forEach(b=>b.onclick=()=>{selectedPerson=+b.dataset.person;renderPeople();renderMap()})}
    function renderMap(){map.style.setProperty('--eir-cols',g.cfg.places<=3?g.cfg.places:2);map.innerHTML=g.places.map((p,pi)=>{const here=g.names.map((n,i)=>assign[i]===pi?`<span>${n[0]}<small>${n}</small></span>`:'').join('');const adjacent=[...g.adj[pi]].map(j=>g.places[j][1]).join(' · ');return `<button class="eir-place ${assign[selectedPerson]===pi?'target':''}" data-place="${pi}"><i>${p[2]}</i><b>${p[1]}</b><small>confina con ${adjacent||'—'}</small><div>${here}</div></button>`}).join('');map.querySelectorAll('.eir-place').forEach(b=>b.onclick=()=>{assign[selectedPerson]=+b.dataset.place;renderPeople();renderMap()})}
    renderPeople();renderMap();
    document.querySelectorAll('#eirAssumptions button').forEach(b=>b.onclick=()=>{const id=b.dataset.id;selectedAssumptions.has(id)?selectedAssumptions.delete(id):selectedAssumptions.add(id);b.classList.toggle('selected',selectedAssumptions.has(id))});
    document.querySelectorAll('.eir-challenge button').forEach(b=>b.onclick=()=>{const ch=+b.dataset.ch;bridgeChoices[ch]=b.dataset.bridge;b.closest('.eir-challenge').querySelectorAll('button').forEach(x=>x.classList.toggle('selected',x===b))});
    document.getElementById('eirReset').onclick=()=>{assign.fill(null);selectedAssumptions.clear();for(const k of Object.keys(bridgeChoices))delete bridgeChoices[k];checks=0;document.getElementById('eirChecks').textContent='Verifiche 0';document.querySelectorAll('#eirAssumptions button,.eir-challenge button').forEach(b=>b.classList.remove('selected'));feedback.className='eir-feedback';feedback.textContent='Tavolo azzerato. Ricostruisci la realtà da capo.';renderPeople();renderMap()};
    document.getElementById('eirVerify').onclick=()=>{
      if(finished)return;checks++;document.getElementById('eirChecks').textContent=`Verifiche ${checks}`;
      const placed=assign.filter(x=>x!==null).length;
      const locOk=placed===g.cfg.people&&g.constraints.every(c=>eirSatisfies(assign,c,g.adj))&&g.challenges.every(c=>assign[c.observer]===g.hidden[c.observer]&&assign[c.target]===g.hidden[c.target]);
      const assOk=g.assumptionIds.length===selectedAssumptions.size&&g.assumptionIds.every(x=>selectedAssumptions.has(x));
      const bridgeOk=g.challenges.every((c,i)=>bridgeChoices[i]===c.bridge);
      if(locOk&&assOk&&bridgeOk){
        finished=true;const generatedSame=assign.every((p,i)=>p===g.hidden[i]);const sec=Math.floor((Date.now()-activeStart)/1000);const score=Math.max(120,1900-checks*120-sec*2+(generatedSame?0:180));feedback.className='eir-feedback success';feedback.innerHTML=`<b>${generatedSame?'Realtà coerente.':'Soluzione alternativa valida.'}</b><span>Tutte le testimonianze possono essere vere contemporaneamente.</span><div>${g.challenges.map(c=>`<p>${c.fact}</p>`).join('')}</div>`;document.querySelector('.eir-reality-flash')?.remove();const flash=document.createElement('div');flash.className='eir-reality-flash';flash.textContent='EVERYBODY IS RIGHT';document.body.appendChild(flash);setTimeout(()=>flash.remove(),1100);setTimeout(()=>concludeSession('everybody',level,score,true,`${generatedSame?'Hai ricostruito una realtà coerente.':'Hai trovato una soluzione alternativa coerente.'} Verifiche: <b>${checks}</b>.`),950);return;
      }
      const parts=[];if(placed<g.cfg.people)parts.push(`${g.cfg.people-placed} persone ancora da collocare`);else if(!locOk)parts.push('la disposizione non soddisfa ancora tutte le testimonianze');if(!assOk)parts.push('le assunzioni selezionate non spiegano ancora tutti i paradossi');if(!bridgeOk)parts.push('almeno un collegamento nascosto non è compatibile con i fatti');feedback.className='eir-feedback bad';feedback.innerHTML=`<b>Questa realtà non regge ancora.</b><span>${parts.join(' · ')}</span>`;
    };
    startTimer();
    if(!localStorage.getItem('sala_giochi_everybody_help_v1')){localStorage.setItem('sala_giochi_everybody_help_v1','1');setTimeout(()=>openHelp(),260)}
  }

  // Ridisegna la Home già caricata da app.js includendo la nuova sezione.
  renderHome();
})();
