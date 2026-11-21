import './catalog.js';
import './terrain.js';

const copy = {
  ru: {moon:'Луна', earth:'← Земля', list:'Миссии и станции', missions:'Миссии', stations:'Проекты станций',
    overview:'Вся Луна', tilt:'Наклон', closer:'Приблизить', farther:'Отдалить', back:'← К каталогу',
    status:'Статус', date:'Дата', participants:'Участники', location:'Место', sources:'Источники',
    model:'Рассмотреть в 3D', loading:'Загрузка поверхности…', error:'Не удалось загрузить поверхность.', retry:'Повторить',
    loadingSite:'Загрузка съёмки места посадки…', siteError:'Доступен общий вид. Подробную съёмку загрузить не удалось.',
    terrain:'LROC / LOLA · NASA, GSFC, ASU', local:'Участок Apollo 11 · LROC NAC · NASA, GSFC, ASU',
    controls:'Вращайте Луну перетаскиванием. Для приближения используйте колесо или щипок.',
    orbit:'Проектная окололунная орбита', orbitNote:'Схема без масштаба. Положение станции во времени не рассчитывается.',
    concept:'Концептуальная реконструкция', official:'Официальная модель'},
  en: {moon:'Moon', earth:'← Earth', list:'Missions and stations', missions:'Missions', stations:'Station projects',
    overview:'Whole Moon', tilt:'Tilt', closer:'Zoom in', farther:'Zoom out', back:'← Catalogue',
    status:'Status', date:'Date', participants:'Participants', location:'Location', sources:'Sources',
    model:'Explore in 3D', loading:'Loading lunar surface…', error:'Could not load the surface.', retry:'Retry',
    loadingSite:'Loading landing-site survey…', siteError:'Global view available. The local survey could not be loaded.',
    terrain:'LROC / LOLA · NASA, GSFC, ASU', local:'Apollo 11 site · LROC NAC · NASA, GSFC, ASU',
    controls:'Drag to rotate. Scroll or pinch to zoom.',
    orbit:'Proposed lunar orbit', orbitNote:'Diagram is not to scale. No live station position is shown.',
    concept:'Conceptual reconstruction', official:'Official model'}
};

let explorer;
let stylesheet;
function loadStyles(){
  if(!stylesheet) stylesheet=new Promise((resolve,reject)=>{
    const link=document.createElement('link');
    link.rel='stylesheet'; link.href=new URL('./explorer.css',import.meta.url).href;
    link.onload=resolve;
    link.onerror=()=>{link.remove();stylesheet=null;reject(new Error('lunar stylesheet'));};
    document.head.append(link);
  });
  return stylesheet;
}
function element(tag,text,className){
  const node=document.createElement(tag);
  if(text) node.textContent=text;
  if(className) node.className=className;
  return node;
}
function link(label,url){
  const a=element('a',label);
  a.href=url; a.target='_blank'; a.rel='noopener';
  return a;
}
function setup(){
  const dialog=element('dialog'); dialog.id='moonExplorer';
  dialog.setAttribute('aria-labelledby','moonTitle');
  dialog.innerHTML=`
    <div class="moon-layout">
      <header class="moon-header"><button type="button" id="moonEarth"></button><h1 id="moonTitle"></h1></header>
      <div class="moon-stage">
        <canvas id="moonSurface" tabindex="0"></canvas>
        <div id="moonOrbit" hidden>
          <div class="moon-orbit-panel">
            <h3></h3>
            <svg viewBox="0 0 340 160" aria-hidden="true">
              <path d="M70 77 C63 55 83 35 125 32 C215 20 315 48 314 83 C311 123 220 145 145 128 C102 117 77 95 70 77 Z" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="6 5"/>
              <circle cx="93" cy="65" r="18" fill="#aeafb6"/><path d="M92 47a18 18 0 0 1 0 36c9-9 9-26 0-36" fill="#626876"/>
            </svg>
            <p></p>
          </div>
        </div>
        <div class="moon-status" role="status" hidden><span></span><button type="button" hidden></button></div>
        <div class="moon-nav">
          <button id="moonHome" type="button"></button><button id="moonMinus" type="button">−</button><button id="moonPlus" type="button">+</button>
          <label><span></span><input id="moonTilt" type="range" min="0" max="72" step="1" value="0"></label>
        </div>
        <a id="moonTerrainSource" target="_blank" rel="noopener"></a>
      </div>
      <aside class="moon-sidebar">
        <section id="moonCatalog"></section><article id="moonCard" hidden></article>
      </aside>
    </div>`;
  document.body.append(dialog);
  const q=s=>dialog.querySelector(s);
  let canvas=q('#moonSurface');
  const catalog=q('#moonCatalog'), card=q('#moonCard');
  const orbit=q('#moonOrbit'), status=q('.moon-status'), tilt=q('#moonTilt');
  let host,lang,words,controller,pending,selected,lastView,failed=false;
  const items=window.RASSVET_MOON_CATALOG;
  function showStatus(message,retry=false){
    status.hidden=!message; status.querySelector('span').textContent=message;
    const button=status.querySelector('button'); button.hidden=!retry; button.textContent=words.retry;
  }
  function updateSource(local){
    const a=q('#moonTerrainSource');
    a.textContent=local?words.local:words.terrain;
    a.href=local?'https://data.lroc.im-ldi.com/lroc/view_rdr/NAC_DTM_APOLLO11':'https://svs.gsfc.nasa.gov/4720/';
  }
  function showOrbit(visible){
    orbit.hidden=!visible;
    for(const node of [q('#moonMinus'),q('#moonPlus'),q('.moon-nav label'),q('#moonTerrainSource')]) node.hidden=visible;
  }
  function navigate(item){
    if(!controller) return;
    if(!item.target){controller.reset();return;}
    controller.focus(item.target.lat,item.target.lon,{detail:item.id==='apollo11'});
  }
  function choose(item,move=true){
    selected=item;
    catalog.hidden=true; card.hidden=false; card.replaceChildren();
    const back=element('button',words.back,'moon-back'); back.id='moonCatalogBack';
    back.onclick=()=>{showCatalog();catalog.querySelector('[data-object="'+item.id+'"]')?.focus();};
    card.append(back,element('h2',item.name[lang]));
    const details=element('dl');
    for(const key of ['date','participants','status','location']){
      if(item[key]?.[lang]) details.append(element('dt',words[key]),element('dd',item[key][lang]));
    }
    const model=element('button',words.model,'moon-primary'); model.id='moonModel';
    model.onclick=()=>{
      const view=controller?.getState();
      const modelDialog=host.showModel(item,model);
      if(!view) return;
      controller.pause();
      modelDialog.addEventListener('close',()=>{
        if(!dialog.open) return;
        controller.setState(view);controller.resume();
      },{once:true});
    };
    const origin=element('p',item.model.kind==='reconstruction'?words.concept:words.official,'moon-kind');
    const sources=element('details'); sources.append(element('summary',words.sources));
    for(const source of item.sources) sources.append(link(source.name[lang],source.url));
    card.append(element('p',item.description[lang]),model,origin,details,sources);
    q('.moon-sidebar').scrollTop=0;
    showOrbit(item.id==='gateway');
    if(move){navigate(item);back.focus({preventScroll:true});}
  }
  function showCatalog(){
    selected=null; card.hidden=true; catalog.hidden=false; showOrbit(false);
    q('.moon-sidebar').scrollTop=0;
  }
  function renderList(){
    catalog.replaceChildren(element('h2',words.list));
    for(const [kind,label] of [['mission',words.missions],['station',words.stations]]){
      catalog.append(element('h3',label));
      for(const item of items.filter(entry=>entry.kind===kind)){
        const button=element('button',item.name[lang],'moon-object');
        button.type='button'; button.dataset.object=item.id;
        button.onclick=()=>choose(item);
        catalog.append(button);
      }
    }
  }
  function markers(){
    controller?.setMarkers(items.filter(item=>item.target?.type==='landing')
      .map(item=>({id:item.id,lat:item.target.lat,lon:item.target.lon,label:item.name[lang]})));
  }
  async function start(){
    if(controller){controller.resume();markers();return;}
    if(pending) return pending;
    showStatus(words.loading);failed=false;
    pending=(async()=>{
      try{
        controller=await window.RassvetMoonTerrain.create(canvas,{
          base:new URL('../assets/moon/terrain/',import.meta.url).href,
          onPick:id=>{const item=items.find(entry=>entry.id===id);if(item) choose(item);},
          onStatus:kind=>{
            if(kind==='detail-loading') showStatus(words.loadingSite);
            if(kind==='detail-error') showStatus(words.siteError,true);
            if(kind==='detail-ready') showStatus('');
            if(kind==='error' && controller){failed=true;showStatus(words.error,true);}
          },
          onView:state=>{
            if(state.tilt!==lastView?.tilt) tilt.value=state.tilt;
            if(state.detail!==lastView?.detail) updateSource(state.detail==='apollo11');
            lastView=state;
          }
        });
        markers();showStatus('');
        if(!dialog.open) controller.pause();
        else if(selected) navigate(selected);
      }catch(err){failed=true;showStatus(words.error,true);console.warn('[rassvet] lunar surface',err);}
      finally{pending=null;}
    })();
    return pending;
  }
  status.querySelector('button').onclick=()=>{
    if(!failed && controller && selected){navigate(selected);return;}
    if(controller){
      controller.destroy();controller=null;
      const next=canvas.cloneNode(false);canvas.replaceWith(next);canvas=next;
    }
    start();
  };
  q('#moonEarth').onclick=()=>dialog.close();
  dialog.addEventListener('close',()=>{
    controller?.pause();
    host.onClose();
    host.opener.focus({preventScroll:true});
  });
  q('#moonMinus').onclick=()=>controller?.zoom(1/1.5);
  q('#moonPlus').onclick=()=>controller?.zoom(1.5);
  tilt.oninput=()=>controller?.tilt(Number(tilt.value));
  q('#moonHome').onclick=()=>{controller?.reset();showCatalog();};
  return {open(options){
    host=options;lang=host.lang;words=copy[lang];
    q('#moonTitle').textContent=words.moon;
    q('#moonEarth').textContent=words.earth;
    q('#moonHome').textContent=words.overview;
    q('#moonPlus').setAttribute('aria-label',words.closer);
    q('#moonMinus').setAttribute('aria-label',words.farther);
    q('.moon-nav label span').textContent=words.tilt;
    canvas.setAttribute('aria-label',words.controls);
    orbit.querySelector('h3').textContent=words.orbit;
    orbit.querySelector('p').textContent=words.orbitNote;
    renderList(); if(selected) choose(selected,false); else showCatalog();
    updateSource(lastView?.detail==='apollo11'); if(failed) showStatus(words.error,true);
    dialog.showModal();q('#moonEarth').focus();start();
  }};
}
export async function openExplorer(host){
  await loadStyles();
  explorer??=setup();
  explorer.open(host);
}
