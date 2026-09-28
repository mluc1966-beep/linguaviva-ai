# LinguaViva AI v1.1 FREE

PWA listening-first per imparare lingue con forte enfasi sulla comprensione orale.
La modalità principale è **London Live**: conversazione audio-audio in tempo reale con Gemini Live, testo nascosto durante la sessione e analisi didattica alla fine.

## Costo

Questa configurazione è progettata per essere usata senza pagamento:

- GitHub Pages: gratuito.
- Cloudflare Workers Free: gratuito entro i limiti del piano.
- Gemini Developer API: usa esclusivamente modelli che dispongono di Free Tier.

**Importante:** per avere la garanzia pratica di non spendere, NON attivare la fatturazione sul progetto Gemini/Google AI usato per LinguaViva. Quando la quota gratuita finisce, le richieste vengono rifiutate e l'app mostra un errore invece di passare automaticamente a un piano a pagamento.

Nel Free Tier Google indica che i contenuti possono essere utilizzati per migliorare i propri prodotti. Non usare quindi questa configurazione per conversazioni contenenti dati riservati o sensibili.

## Architettura

```
GitHub Pages (PWA)
       |
       | richieste brevi
       v
Cloudflare Worker Free
       |-- crea token effimero Live
       |-- correzioni / grammatica / listening
       |-- TTS per esercizi
       v
Gemini Developer API Free Tier

London Live:
Browser <--------------------> Gemini Live
        token effimero, audio diretto
```

La chiave Gemini rimane nel Worker. Il browser riceve per London Live soltanto un token temporaneo valido per una singola sessione.

## Modelli configurati

- Conversazione audio realtime: `gemini-3.8-live`
- Correzioni, listening, grammatica: `gemini-3.5-flash-lite`
- Audio degli esercizi: `gemini-3.8-flash-lite-tts`

I nomi sono centralizzati nel Worker e possono essere cambiati in futuro senza modificare l'app.

---

# Installazione

## 1. GitHub Pages

Crea il repository pubblico `linguaviva-ai`.

Copia **il contenuto della cartella `linguaviva_app` nella root** del repository. In GitHub dovrai vedere subito:

```
index.html
app.js
live.js
styles.css
sw.js
manifest.webmanifest
assets/
backend/
README.md
CHANGELOG.md
```

Poi:

1. GitHub > repository `linguaviva-ai`.
2. **Settings**.
3. **Pages**.
4. Source: **Deploy from a branch**.
5. Branch: `main` / `(root)`.
6. Save.

Il sito sarà normalmente:

`https://TUO-USERNAME.github.io/linguaviva-ai/`

## 2. Crea una chiave Gemini gratuita

1. Apri **Google AI Studio**.
2. Accedi con il tuo account Google.
3. Crea una nuova API key per un progetto dedicato a LinguaViva.
4. Copia la chiave.
5. **Non inserirla mai nei file GitHub.**
6. Se vuoi restare rigorosamente a 0 €, non associare/abilitare fatturazione a quel progetto.

## 3. Crea il Cloudflare Worker gratuito

1. Crea/accedi a un account Cloudflare.
2. Vai a **Workers & Pages** > **Create** > Worker.
3. Nome suggerito: `linguaviva-free-api`.
4. Apri l'editor del Worker.
5. Sostituisci tutto con il contenuto di `backend/worker.js`.
6. Deploy.

### Aggiungi la chiave Gemini come secret

Nel Worker:

1. Settings > Variables and Secrets.
2. Add > Secret.
3. Nome: `GEMINI_API_KEY`.
4. Valore: la chiave creata in Google AI Studio.
5. Salva.

### Limita il Worker alla tua PWA

Aggiungi anche una variabile normale:

- Nome: `ALLOWED_ORIGIN`
- Valore: `https://TUO-USERNAME.github.io`

Nota: l'Origin del browser è solo dominio + protocollo, quindi non include `/linguaviva-ai/`.

## 4. Collega l'app

Apri LinguaViva > **Impostazioni**.

Nel campo **URL del backend Cloudflare Worker** inserisci l'URL del Worker, per esempio:

`https://linguaviva-free-api.TUO-SUBDOMINIO.workers.dev`

Premi **Verifica collegamento**.

Dovresti vedere:

`✓ LinguaViva FREE attivo · Gemini ...`

Poi premi **Trova voce britannica**. L'app interroga il catalogo voci Gemini filtrando `en-GB` + accento `British` e salva una voce disponibile.

Premi **Salva**.

---

# London Live

1. Apri **Parla**.
2. Scegli:
   - **British Clear**: chiaro, leggermente più lento, ma non artificiale.
   - **London Natural**: default; velocità quotidiana e connected speech.
   - **London Challenge**: più veloce, colloquiale e idiomatico.
3. Premi **Avvia London Live**.
4. Consenti il microfono.
5. Conversa senza leggere.
6. Puoi interrompere l'interlocutore mentre parla.
7. Premi **Termina e analizza**.

A fine sessione Teacher Mode mostra:

- trascrizione;
- correzioni grammaticali/lessicali prudenti;
- espressioni utili;
- prossimo focus.

Le correzioni vengono aggiunte al Quaderno degli errori e possono generare lezioni grammaticali personalizzate.

## Privacy del Free Tier

Il Free Tier Gemini è gratuito ma Google dichiara che i contenuti del livello gratuito possono essere usati per migliorare i propri prodotti. Per un'app di studio personale va considerato prima di parlare di informazioni riservate.

## Browser consigliato

Su Android/desktop: Chrome o Edge recenti. London Live richiede:

- HTTPS (GitHub Pages lo fornisce);
- WebSocket;
- Web Audio API;
- permesso microfono.

## Se qualcosa non funziona

- `GEMINI_API_KEY non configurata`: manca il secret nel Worker.
- `Origin non autorizzata`: `ALLOWED_ORIGIN` non coincide con `https://TUO-USERNAME.github.io`.
- errore quota/rate limit: quota gratuita Gemini temporaneamente esaurita; non è un addebito.
- nessun microfono: controlla i permessi del browser.
- London Live si chiude dopo una lunga sessione: il token/sessione Live ha durata limitata; avvia una nuova sessione.
