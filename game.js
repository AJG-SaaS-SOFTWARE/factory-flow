(() => {
  const COLORS = {
    R: { name: 'Rouge', cls: 'red', hex: '#ee6b64' },
    B: { name: 'Bleu', cls: 'blue', hex: '#5aa9f7' },
    Y: { name: 'Jaune', cls: 'yellow', hex: '#f1c65b' },
    G: { name: 'Vert', cls: 'green', hex: '#65c987' }
  };

  // processing = nombre de tours pendant lesquels une machine reste occupée après réception.
  // maintenance = indisponibilité initiale en tours.
  const LEVELS = window.FACTORY_FLOW_LEVELS;

  const els = Object.fromEntries([
    'levelLabel','progressLabel','turnLabel','objectiveText','queueCount','queue','machines','bufferCount','bufferSlots','bufferBtn','messageBox','messageTitle','messageText','tutorialCard','tutorialStep','tutorialText','prevBtn','nextBtn','resultModal','resultIcon','resultTitle','resultText','resultTurns','resultBuffers','modalPrimary','modalSecondary','resetBtn','hintBtn','soundBtn','objectiveCard','bufferPanel'
  ].map(id => [id, document.getElementById(id)]));

  let state = null;
  let soundOn = true;
  let audioCtx = null;

  const statsKey = 'factoryFlowPrototypeStatsV1';
  const analytics = loadAnalytics();

  function loadAnalytics(){
    try { return JSON.parse(localStorage.getItem(statsKey)) || {sessions:0,levelStarts:{},wins:{},fails:{},bufferUses:0}; }
    catch { return {sessions:0,levelStarts:{},wins:{},fails:{},bufferUses:0}; }
  }
  function saveAnalytics(){ localStorage.setItem(statsKey, JSON.stringify(analytics)); }
  analytics.sessions = (analytics.sessions || 0) + 1; saveAnalytics();

  function event(type, payload={}){
    const detail = {type, ts:Date.now(), level:(state?.levelIndex ?? 0)+1, ...payload};
    window.dispatchEvent(new CustomEvent('factoryflow:event',{detail}));
    console.debug('[FactoryFlow]', detail);
  }

  function tone(freq=440,duration=.06,type='sine',gain=.04){
    if(!soundOn) return;
    try{
      audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
      const o=audioCtx.createOscillator(), g=audioCtx.createGain();
      o.type=type; o.frequency.value=freq; g.gain.value=gain;
      o.connect(g); g.connect(audioCtx.destination); o.start();
      g.gain.exponentialRampToValueAtTime(.0001,audioCtx.currentTime+duration);
      o.stop(audioCtx.currentTime+duration);
    }catch{}
  }
  function vibrate(ms=20){ if(navigator.vibrate) navigator.vibrate(ms); }

  function initLevel(index, reason='start'){
    const l=LEVELS[index];
    state = {
      levelIndex:index,
      incoming:[...l.queue],
      buffer:[],
      bufferCap:l.buffer,
      selectedBufferIndex:null,
      machines:Object.fromEntries(Object.entries(l.machines).map(([c,m])=>[c,{color:c,processing:m.processing||0,busy:0,maintenance:m.maintenance||0,done:0}])),
      total:l.queue.length, processed:0, turns:0, bufferUses:0, won:false, failed:false
    };
    analytics.levelStarts[index+1]=(analytics.levelStarts[index+1]||0)+1; saveAnalytics();
    event('level_start',{reason,title:l.title});
    setMessage(index===0?'À toi de jouer':'Nouvelle ligne', l.objective, '');
    render();
  }

  function activePiece(){
    if(state.selectedBufferIndex !== null) return {source:'buffer', color:state.buffer[state.selectedBufferIndex]};
    if(state.incoming.length) return {source:'incoming', color:state.incoming[0]};
    return null;
  }

  function advanceTurn(){
    state.turns++;
    Object.values(state.machines).forEach(m=>{
      if(m.maintenance>0) m.maintenance--;
      else if(m.busy>0) m.busy--;
    });
  }

  function machineReady(m){ return m.maintenance===0 && m.busy===0; }

  function sendToMachine(color){
    if(state.won || state.failed) return;
    const p=activePiece();
    const m=state.machines[color];
    if(!p || !m) return;
    if(!machineReady(m)){
      setMessage('Machine indisponible', m.maintenance>0?`Maintenance : encore ${m.maintenance} tour(s).`:`Cycle en cours : encore ${m.busy} tour(s).`, 'bad');
      shakeMachine(color); tone(120,.09,'sawtooth',.025); vibrate([20,30,20]);
      return;
    }
    if(p.color!==color){
      setMessage('Mauvais poste', `La pièce ${COLORS[p.color].name.toLowerCase()} doit aller sur la machine ${COLORS[p.color].name.toLowerCase()}.`, 'bad');
      shakeMachine(color); tone(140,.08,'square',.025); vibrate(35); event('wrong_machine',{piece:p.color,target:color});
      return;
    }

    if(p.source==='incoming') state.incoming.shift();
    else {
      state.buffer.splice(state.selectedBufferIndex,1);
      state.selectedBufferIndex=null;
    }
    m.busy=m.processing+1;
    m.done++;
    state.processed++;
    advanceTurn();
    setMessage('Pièce traitée', `${COLORS[color].name} envoyée au bon poste.`, 'good');
    tone(520,.05,'sine',.035); setTimeout(()=>tone(720,.06,'sine',.03),35); vibrate(15);
    event('piece_processed',{color,source:p.source});
    checkEnd();
    render();
  }

  function putInBuffer(){
    if(state.won || state.failed || state.bufferCap===0) return;
    if(state.selectedBufferIndex!==null){
      state.selectedBufferIndex=null; render(); return;
    }
    if(!state.incoming.length) return;
    if(state.buffer.length>=state.bufferCap){
      fail('BUFFER SATURÉ', 'Plus aucune place disponible pour dévier la pièce suivante.');
      return;
    }
    const c=state.incoming.shift(); state.buffer.push(c); state.bufferUses++; analytics.bufferUses=(analytics.bufferUses||0)+1; saveAnalytics();
    advanceTurn();
    setMessage('Pièce mise en attente', `La pièce ${COLORS[c].name.toLowerCase()} est stockée dans le buffer.`, '');
    tone(260,.05,'triangle',.03); vibrate(12); event('buffer_add',{color:c,fill:state.buffer.length});
    checkEnd(); render();
  }

  function selectBuffer(i){
    if(state.won || state.failed || i>=state.buffer.length) return;
    state.selectedBufferIndex = state.selectedBufferIndex===i ? null : i;
    const c=state.buffer[i];
    setMessage(state.selectedBufferIndex===null?'Sélection annulée':'Pièce du buffer sélectionnée', state.selectedBufferIndex===null?'La pièce d’entrée redevient prioritaire.':`Envoie maintenant la pièce ${COLORS[c].name.toLowerCase()} vers son poste.`, '');
    tone(330,.04,'sine',.02); render();
  }

  function hasAnyMove(){
    const p=activePiece(); if(!p) return false;
    const m=state.machines[p.color];
    if(m && machineReady(m)) return true;
    if(p.source==='incoming' && state.buffer.length<state.bufferCap) return true;
    if(p.source==='buffer'){
      // l’utilisateur peut désélectionner puis utiliser l’entrée ou une autre pièce buffer.
      if(state.incoming.length){ const im=state.machines[state.incoming[0]]; if(im&&machineReady(im)) return true; if(state.buffer.length<state.bufferCap) return true; }
      return state.buffer.some((c,i)=>i!==state.selectedBufferIndex && machineReady(state.machines[c]));
    }
    return state.buffer.some(c=>machineReady(state.machines[c]));
  }

  function checkEnd(){
    if(state.processed===state.total){ win(); return; }
    // Jam réel : aucun traitement possible et aucune place buffer pour avancer le temps.
    if(!hasAnyMove()) fail('LIGNE BLOQUÉE','Les machines sont occupées et le buffer ne peut plus absorber de pièce.');
  }

  function win(){
    state.won=true; analytics.wins[state.levelIndex+1]=(analytics.wins[state.levelIndex+1]||0)+1; saveAnalytics();
    event('level_win',{turns:state.turns,bufferUses:state.bufferUses});
    tone(620,.09,'sine',.04); setTimeout(()=>tone(780,.1,'sine',.04),90); setTimeout(()=>tone(980,.13,'sine',.04),180); vibrate([25,40,25]);
    els.resultIcon.textContent='✅'; els.resultTitle.textContent='Ligne optimisée !'; els.resultText.textContent='Toutes les pièces ont été traitées sans bloquer l’usine.';
    els.resultTurns.textContent=state.turns; els.resultBuffers.textContent=state.bufferUses;
    els.modalPrimary.textContent=state.levelIndex<LEVELS.length-1?'Niveau suivant':'Rejouer le challenge'; els.modalSecondary.textContent='Rejouer ce niveau';
    els.resultModal.classList.remove('hidden');
  }

  function fail(title,text){
    if(state.failed||state.won) return;
    state.failed=true; analytics.fails[state.levelIndex+1]=(analytics.fails[state.levelIndex+1]||0)+1; saveAnalytics(); event('level_fail',{reason:title,turns:state.turns});
    tone(110,.18,'sawtooth',.035); vibrate([60,50,80]);
    els.resultIcon.textContent='🚨'; els.resultTitle.textContent=title; els.resultText.textContent=text;
    els.resultTurns.textContent=state.turns; els.resultBuffers.textContent=state.bufferUses; els.modalPrimary.textContent='Réessayer'; els.modalSecondary.textContent='Voir l’indice';
    els.resultModal.classList.remove('hidden');
  }

  function setMessage(title,text,type=''){
    els.messageTitle.textContent=title; els.messageText.textContent=text; els.messageBox.classList.remove('good','bad'); if(type) els.messageBox.classList.add(type);
  }
  function shakeMachine(color){ const node=document.querySelector(`[data-machine="${color}"]`); if(node){node.classList.remove('shake');void node.offsetWidth;node.classList.add('shake');} }

  function render(){
    const l=LEVELS[state.levelIndex];
    els.levelLabel.textContent=`${state.levelIndex+1} / ${LEVELS.length}`; els.progressLabel.textContent=`${state.processed} / ${state.total}`; els.turnLabel.textContent=state.turns;
    els.objectiveText.textContent=l.objective; els.queueCount.textContent=`${state.incoming.length} pièce${state.incoming.length>1?'s':''}`;
    els.queue.innerHTML='';
    state.incoming.slice(0,8).forEach((c,i)=>{ const d=document.createElement('div'); d.className=`part ${COLORS[c].cls}${i===0&&state.selectedBufferIndex===null?' current':''}`; d.textContent=c; d.title=COLORS[c].name; els.queue.appendChild(d); });
    if(!state.incoming.length){const d=document.createElement('div');d.className='part placeholder';d.textContent='✓';els.queue.appendChild(d)}

    els.machines.innerHTML='';
    const cols=Object.keys(state.machines); els.machines.style.gridTemplateColumns=cols.length<=2?'repeat(2,1fr)':'repeat(2,1fr)';
    cols.forEach(c=>{
      const m=state.machines[c], ready=machineReady(m), p=activePiece();
      const b=document.createElement('button'); b.type='button'; b.dataset.machine=c; b.className=`machine ${ready?'ready':'busy'} ${p?.color===c?'match':''}`;
      b.style.setProperty('--machine-color',COLORS[c].hex);
      const remaining=m.maintenance>0?m.maintenance:m.busy;
      const denom=Math.max(1,m.processing,m.maintenance||0);
      const pct=ready?100:Math.max(8,100-(remaining/denom*100));
      b.innerHTML=`<div class="machine-top"><span class="machine-name">POSTE ${COLORS[c].name.toUpperCase()}</span><i class="machine-light"></i></div><div class="machine-body"><div class="machine-drum"></div></div><div class="machine-foot"><span>${m.maintenance>0?'Maintenance':m.busy>0?'Cycle en cours':'Disponible'}</span><strong>${remaining?remaining+'t':'OK'}</strong></div><div class="machine-progress"><i style="width:${pct}%"></i></div>`;
      b.addEventListener('click',()=>sendToMachine(c)); els.machines.appendChild(b);
    });

    els.bufferPanel.style.display=state.bufferCap?'block':'none'; els.bufferCount.textContent=`${state.buffer.length} / ${state.bufferCap}`; els.bufferSlots.innerHTML='';
    for(let i=0;i<state.bufferCap;i++){
      const slot=document.createElement('button');slot.type='button';slot.className='buffer-slot';
      if(i<state.buffer.length){ const c=state.buffer[i]; const d=document.createElement('div'); d.className=`part buffered ${COLORS[c].cls}${state.selectedBufferIndex===i?' selected':''}`; d.textContent=c; slot.appendChild(d); slot.addEventListener('click',()=>selectBuffer(i)); }
      else { slot.disabled=true; slot.innerHTML='<div class="part placeholder">+</div>'; }
      els.bufferSlots.appendChild(slot);
    }
    els.bufferBtn.disabled=!state.bufferCap || !state.incoming.length || state.buffer.length>=state.bufferCap || state.selectedBufferIndex!==null;
    els.bufferBtn.textContent=state.selectedBufferIndex!==null?'Désélectionner la pièce du buffer':'Mettre la pièce en attente';
    if(state.selectedBufferIndex!==null){ els.bufferBtn.disabled=false; els.bufferBtn.onclick=()=>{state.selectedBufferIndex=null;render();}; } else els.bufferBtn.onclick=putInBuffer;

    const step = state.levelIndex===0 ? 1 : state.levelIndex<3 ? 2 : state.levelIndex<6 ? 3 : 4;
    const tut = step===1?'Touchez la machine de la même couleur que la première pièce.' : step===2?'Une machine occupée a besoin de tours pour se libérer. Le buffer permet de changer l’ordre.' : step===3?'Touchez une pièce dans le buffer pour la traiter avant la pièce d’entrée.' : 'Anticipez les machines lentes : le buffer sert de sécurité, pas de stockage permanent.';
    els.tutorialStep.textContent=step; els.tutorialText.textContent=tut;
    els.prevBtn.disabled=state.levelIndex===0; els.nextBtn.disabled=!state.won;
  }

  els.prevBtn.addEventListener('click',()=>{ if(state.levelIndex>0)initLevel(state.levelIndex-1,'previous'); });
  els.nextBtn.addEventListener('click',()=>{ if(state.won&&state.levelIndex<LEVELS.length-1)initLevel(state.levelIndex+1,'next'); });
  els.resetBtn.addEventListener('click',()=>initLevel(state.levelIndex,'reset'));
  els.hintBtn.addEventListener('click',()=>{setMessage('Indice',LEVELS[state.levelIndex].hint,''); event('hint_open');});
  els.soundBtn.addEventListener('click',()=>{soundOn=!soundOn;els.soundBtn.textContent=soundOn?'🔊':'🔇';event('sound_toggle',{on:soundOn});});
  els.modalPrimary.addEventListener('click',()=>{
    els.resultModal.classList.add('hidden');
    if(state.won){ initLevel(state.levelIndex<LEVELS.length-1?state.levelIndex+1:state.levelIndex,'modal_next'); }
    else initLevel(state.levelIndex,'retry');
  });
  els.modalSecondary.addEventListener('click',()=>{
    els.resultModal.classList.add('hidden');
    if(state.failed){
      const idx=state.levelIndex;
      initLevel(idx,'hint_retry');
      setMessage('Indice',LEVELS[idx].hint,'');
    } else initLevel(state.levelIndex,'replay');
  });

  window.FactoryFlowDebug = {
    levels: LEVELS,
    getState:()=>JSON.parse(JSON.stringify(state)),
    getAnalytics:()=>JSON.parse(localStorage.getItem(statsKey)||'{}'),
    jumpTo:(n)=>initLevel(Math.max(0,Math.min(LEVELS.length-1,n-1)),'debug_jump'),
    resetAnalytics:()=>{localStorage.removeItem(statsKey); location.reload();}
  };

  function initQaMode(){
    const params=new URLSearchParams(location.search);
    if(params.get('qa')!=='1') return;
    const panel=document.getElementById('qaPanel'), levels=document.getElementById('qaLevels'), stats=document.getElementById('qaStats');
    panel.classList.remove('hidden');
    LEVELS.forEach((l,i)=>{
      const b=document.createElement('button'); b.textContent=`L${i+1}`; b.title=l.title; b.addEventListener('click',()=>{initLevel(i,'qa_jump'); refresh();}); levels.appendChild(b);
    });
    const refresh=()=>{stats.textContent=JSON.stringify(window.FactoryFlowDebug.getAnalytics(),null,2);};
    document.getElementById('qaRefresh').addEventListener('click',refresh);
    document.getElementById('qaClose').addEventListener('click',()=>panel.classList.add('hidden'));
    document.getElementById('qaCopy').addEventListener('click',async()=>{
      const data=JSON.stringify(window.FactoryFlowDebug.getAnalytics(),null,2);
      try{await navigator.clipboard.writeText(data); setMessage('QA','Statistiques copiées dans le presse-papiers.','good');}
      catch{setMessage('QA','Copie automatique non disponible : sélectionne le JSON dans le panneau.','');}
    });
    refresh();
  }

  initLevel(0);
  initQaMode();
})();
