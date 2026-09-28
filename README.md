# LinguaViva AI v1.0

PWA per imparare una lingua con priorità alla **comprensione orale**.

## Cosa fa già

- Listening adattivo: il testo resta nascosto; la difficoltà cambia in base a numero di ascolti, rallentamenti, trascrizione e risultato.
- Domande di comprensione valutate sul significato, non sulla grammatica della risposta.
- Modalità “Che cosa hai sentito?” per confrontare la frase percepita con quella reale.
- Conversazione AI vocale con testo dell’interlocutore nascosto di default.
- Correzioni mirate di grammatica, lessico, preposizioni, ordine delle parole e tempi verbali.
- Quaderno automatico degli errori.
- Mini-lezioni grammaticali generate dagli errori reali dell’utente.
- Pronuncia assistita: ascolto del modello + riconoscimento della frase pronunciata. **Non** viene presentata come analisi fonetica dei singoli fonemi.
- Voce AI naturale tramite OpenAI TTS, con fallback alle voci del dispositivo.
- Inglese, francese, spagnolo e tedesco.
- PWA installabile e shell offline. I contenuti AI richiedono connessione.
- Progressi ed errori salvati localmente nel browser/dispositivo.

## Architettura

- Frontend statico: GitHub Pages o qualunque hosting HTTPS.
- Backend: Cloudflare Worker (`backend/worker.js`).
- AI testuale: OpenAI Responses API.
- Voce AI: OpenAI Speech API.
- Riconoscimento voce utente: Web Speech API del browser quando disponibile.

La chiave OpenAI **non è mai salvata nel frontend**.

---

# 1. Pubblicare il backend Cloudflare Worker

## Metodo dashboard

1. Accedi a Cloudflare e crea un nuovo Worker.
2. Sostituisci il codice del Worker con il contenuto di `backend/worker.js`.
3. Nelle variabili/secrets del Worker crea:
   - `OPENAI_API_KEY` = la tua chiave API OpenAI (**Secret**)
   - `OPENAI_MODEL` = un modello testuale disponibile al tuo account. Il progetto usa come default `gpt-5.6-luna`.
   - facoltativo `OPENAI_TTS_MODEL` = `gpt-4o-mini-tts`
   - facoltativo `OPENAI_TTS_VOICE` = `alloy`
4. Distribuisci il Worker e copia l’URL `https://...workers.dev`.
5. Dopo che il frontend funziona, puoi aggiungere `ALLOWED_ORIGIN` con l’origine esatta del tuo sito GitHub Pages, ad esempio `https://nomeutente.github.io`.

> L’abbonamento ChatGPT e l’API OpenAI sono prodotti distinti: per usare il backend serve una chiave API con fatturazione API attiva.

## Metodo Wrangler

Il file `backend/wrangler.toml.example` può essere copiato come `wrangler.toml`.

Imposta la chiave come secret, non nel file:

```bash
npx wrangler secret put OPENAI_API_KEY
npx wrangler deploy
```

---

# 2. Pubblicare la PWA su GitHub Pages

Carica nella root del repository:

- `index.html`
- `app.js`
- `styles.css`
- `manifest.webmanifest`
- `sw.js`
- cartella `assets/`

La cartella `backend/` può rimanere nel repository come sorgente, ma non viene usata direttamente da GitHub Pages.

Abilita GitHub Pages sul branch che contiene questi file.

Apri il sito pubblicato → **Impostazioni** → incolla l’URL del Cloudflare Worker → **Verifica collegamento** → **Salva**.

---

# 3. Test minimo consigliato

1. In Impostazioni scegli `Inglese`, livello `B1`, variante britannica.
2. Verifica che il backend risponda.
3. Apri Listening e genera un esercizio.
4. Controlla che parta l’audio senza mostrare il testo.
5. Rispondi alla domanda e verifica il punteggio.
6. Avvia una conversazione e usa il microfono.
7. Introduci volontariamente un errore, per esempio `Yesterday I go to Turin`.
8. Controlla che la correzione venga salvata nel Quaderno errori.
9. Apri “Grammatica dai tuoi errori” e genera la mini-lezione.

---

# Limiti attuali dichiarati

- Il riconoscimento della voce dell’utente dipende dalla Web Speech API del browser; su alcuni browser può non essere disponibile.
- La sezione Pronuncia misura soprattutto l’**intelligibilità rispetto al riconoscimento vocale**, non la qualità fonetica di `/θ/`, `/ð/`, vocali, prosodia ecc.
- Per una vera valutazione fonema-per-fonema conviene integrare in una versione successiva un servizio di pronunciation assessment dedicato.
- I progressi sono per ora locali al dispositivo. La sincronizzazione multi-dispositivo richiede un database/autenticazione e non è inclusa nella v1.0.

## File

- `index.html` — struttura PWA
- `styles.css` — interfaccia responsive
- `app.js` — logica frontend
- `sw.js` — cache PWA
- `manifest.webmanifest` — installazione
- `assets/` — icone
- `backend/worker.js` — API sicura lato server
- `backend/wrangler.toml.example` — esempio configurazione Worker
