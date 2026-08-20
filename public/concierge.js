// On-site assistant: a bubble that asks what service and city a visitor needs and then puts
// them into the real search or the signup sheet. The model runs behind /api/concierge, so
// nothing here holds a key. The bubble only appears when the server says the feature is on.
(function(){
  const T = {
    fr:{ label:"Besoin d'aide ?", title:'Assistant TrouvePro', place:'Écrivez ici…', send:'Envoyer', close:'Fermer',
      hi:"Bonjour ! Quel service cherchez-vous, et dans quelle ville ?",
      note:'Vos messages sont traités par un fournisseur d’IA externe. N’écrivez pas de renseignements sensibles.',
      privacy:'Politique de confidentialité',
      err:"Désolé, l’assistant est indisponible pour le moment.",
      busy:"Trop de messages — patientez une minute.",
      wait:'…', search:'🔎 Lancer la recherche', signup:'✅ Créer un compte gratuit' },
    en:{ label:'Need help?', title:'TrouvePro assistant', place:'Type here…', send:'Send', close:'Close',
      hi:'Hi! What service are you looking for, and in which city?',
      note:'Your messages are processed by an external AI provider. Do not type sensitive information.',
      privacy:'Privacy Policy',
      err:'Sorry, the assistant is unavailable right now.',
      busy:'Too many messages — please wait a minute.',
      wait:'…', search:'🔎 Start the search', signup:'✅ Create a free account' },
  };
  const MAX_CHARS = 600, MAX_TURNS = 12;
  let lang = 'fr', msgs = [], sending = false, el = {};

  function tt(k){ return T[lang][k]; }

  function build(){
    const box = document.createElement('div');
    box.id = 'cc';
    box.innerHTML =
      '<div id="ccpanel" role="dialog" aria-modal="false" hidden>'
      + '<div id="cchead"><span id="cctitle"></span><button id="ccx" aria-label="close">✕</button></div>'
      + '<div id="ccnote"><span id="ccnotetxt"></span> <a href="/privacy" id="ccpriv"></a></div>'
      + '<div id="cclog" aria-live="polite"></div>'
      + '<div id="ccbar"><input id="ccin" maxlength="' + MAX_CHARS + '" autocomplete="off">'
      + '<button id="ccsend" class="btn btn-primary"></button></div>'
      + '</div>'
      + '<button id="ccbtn" class="btn btn-teal"><span>💬</span> <span id="cclabel"></span></button>';
    document.body.appendChild(box);
    el = {
      panel: box.querySelector('#ccpanel'), log: box.querySelector('#cclog'),
      input: box.querySelector('#ccin'), btn: box.querySelector('#ccbtn'),
      label: box.querySelector('#cclabel'), send: box.querySelector('#ccsend'),
      title: box.querySelector('#cctitle'), note: box.querySelector('#ccnotetxt'),
      priv: box.querySelector('#ccpriv'), close: box.querySelector('#ccx'),
    };
    el.btn.onclick = toggle;
    el.close.onclick = toggle;
    el.send.onclick = submit;
    el.input.addEventListener('keydown', e => { if(e.key === 'Enter') submit(); });
    el.priv.onclick = e => { e.preventDefault(); if(window.openLegal){ toggle(); openLegal('privacy'); } };
    paint();
  }

  function paint(){
    el.label.textContent = tt('label');
    el.title.textContent = tt('title');
    el.input.placeholder = tt('place');
    el.send.textContent = tt('send');
    el.note.textContent = tt('note');
    el.priv.textContent = tt('privacy');
  }

  function toggle(){
    const open = el.panel.hidden;
    el.panel.hidden = !open;
    el.btn.hidden = open;
    if(open){
      if(!msgs.length) say('assistant', tt('hi'));
      el.input.focus();
    }
  }

  // textContent only: a model reply is untrusted input like any other
  function say(role, text){
    const row = document.createElement('div');
    row.className = 'ccrow ' + role;
    const bub = document.createElement('span');
    bub.textContent = text;
    row.appendChild(bub);
    el.log.appendChild(row);
    el.log.scrollTop = el.log.scrollHeight;
    return row;
  }

  function offer(action){
    if(!action || action.action === 'none') return;
    const b = document.createElement('button');
    b.className = 'ccdo btn btn-primary';
    if(action.action === 'search'){
      b.textContent = tt('search');
      b.onclick = () => { toggle(); startSearch(action.service); };
    } else if(action.action === 'signup'){
      b.textContent = tt('signup');
      b.onclick = () => { toggle(); if(window.openAuth) openAuth('register'); };
    } else return;
    el.log.appendChild(b);
    el.log.scrollTop = el.log.scrollHeight;
  }

  // hand over to the app's own search, so proximity, radius and geolocation behave identically.
  // The trade goes in as a keyword: the server expands it to every related trade in both
  // languages, and an unknown one no longer inherits a previously selected profession.
  function startSearch(service){
    const term = String(service || '').slice(0, 80);
    ['fq','rq'].forEach(id => { const kw = document.getElementById(id); if(kw) kw.value = term; });
    if(window.clearService) clearService();
    if(window.go) go('search');
    if(window.doSearch) doSearch();
  }

  async function submit(){
    if(sending) return;
    const v = el.input.value.trim().slice(0, MAX_CHARS);
    if(!v) return;
    el.input.value = '';
    say('user', v);
    msgs.push({ role:'user', content:v });
    msgs = msgs.slice(-MAX_TURNS);
    sending = true; el.send.disabled = true;
    const wait = say('assistant', tt('wait'));
    try{
      const r = await fetch('/api/concierge', {
        method:'POST', headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ messages: msgs, lang }),
      });
      const d = await r.json().catch(() => ({}));
      wait.remove();
      if(r.status === 429) say('assistant', tt('busy'));
      else if(!r.ok || !d.reply) say('assistant', tt('err'));
      else { say('assistant', d.reply); msgs.push({ role:'assistant', content:d.reply }); offer(d.action); }
    }catch(e){
      wait.remove(); say('assistant', tt('err'));
    }
    sending = false; el.send.disabled = false;
    el.input.focus();
  }

  window.Concierge = { setLang(l){ lang = (l === 'en') ? 'en' : 'fr'; if(el.label) paint(); } };

  // dark until the server has a key: no bubble that can only apologise
  async function init(){
    try{
      const h = await (await fetch('/api/health')).json();
      if(!h.concierge) return;
    }catch(e){ return; }
    lang = (window.S && S.lang === 'en') ? 'en' : 'fr';
    build();
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
