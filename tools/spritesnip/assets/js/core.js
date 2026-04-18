// ===== PROJECT & MULTI-TAB SYSTEM =====
let projectName='My Project';
let sheets=[]; // [{id,name,img,imgW,imgH,sprites,categories,tagCategories,...}]
let activeSheetId=null;
let nextSheetId=1;

// Current sheet state (mirrors active sheet)
let img=null,imgW=0,imgH=0,zoom=1,panX=0,panY=0,tool='select';
let sprites=[],categories=[],selectedSpriteIds=new Set(),activeCategoryId=null;
let nextSpriteId=1,nextCatId=1,nextSubcatId=1;
let drawing=false,drawStart=null,drawCurrent=null;
let isPanning=false,panStart=null,spaceHeld=false,lastPanX=0,lastPanY=0;
let bgMode='checker',panelCollapsed=false,undoStack=[],redoStack=[],selectMode=false,openCategories=new Set();
let originalFileData=null,originalFileName='';
let lassoPoints=[],lassoActive=false,dragSubcat=null;
let activeSubcatId=null;
let moveActive=false,moveStartPx=null,moveOrigPositions=null,lassoStartPos=null;
let pendingDeselect=false;
const MAX_UNDO=80;
const catColors=['#ff6b6b','#4ecdc4','#ffe66d','#a29bfe','#fd79a8','#00b894','#e17055','#0984e3','#e056a0','#00cec9','#fdcb6e','#6c5ce7'];

const SNIP_TOOL_LABELS={select:'Sprite Box',lasso:'Lasso Select',move:'Move',category:'Group Region',subcategory:'Sub-group Region',repeat:'Repeat Pattern',pan:'Pan',erase:'Erase Box',tag:'Tag'};
const PE_TOOL_LABELS={pencil:'Pencil',eraser:'Eraser',fill:'Fill Bucket',eyedropper:'Eyedropper',dither:'Dither','pe-line':'Line','pe-rect':'Rectangle','pe-circle':'Circle','pe-select':'Selection','pe-move':'Move',pan:'Pan','sc-select':'Select & Move','sc-lasso':'Lasso Select'};
function updateActiveToolLabel(){
  const el=document.getElementById('activeToolLabel');
  if(!el)return;
  const hasWorkspace=!!(img||peMode);
  if(!hasWorkspace){el.style.display='none';el.textContent='';return;}
  const mode=peMode==='compose'?'COMPOSE':((peMode==='edit'||peMode==='edit-sheet')?'EDIT':'SNIP');
  const toolName=(peMode?PE_TOOL_LABELS[typeof peTool!=='undefined'?peTool:'']:SNIP_TOOL_LABELS[tool])||'';
  if(!toolName){el.style.display='none';el.textContent='';return;}
  el.style.display='inline-flex';
  el.innerHTML='<b>'+mode+'</b><span>·</span><span>'+toolName+'</span>';
}

// TAG SYSTEM
let tagCategories=[
  {id:'tc_1',name:'View / Angle',color:'#3b82f6',tags:['front','back','side-L','side-R','3/4','top','bottom']},
  {id:'tc_2',name:'Animation',color:'#8b5cf6',tags:['idle','walk','run','attack','jump','fall','death','hit','cast']},
  {id:'tc_3',name:'Colorway',color:'#14b8a6',tags:['default','alt-1','alt-2','alt-3','red','blue','green','gold']}
];
let nextTagCatId=4,activeTagCatId=null,activeTag=null,tagLassoActive=false,tagLassoPoints=[];
let multiTagMode=false,multiTags={};
let tagCatVisibility={};
let showCatBoxes=true,showSubBoxes=true,showSprBoxes=true;

// Animation state
let animFrames=[],animPlaying=false,animTimer=null,animFrameIdx=0;
// Track subcategories that have animations
let animSubcatIds=new Set();
// Per-animation config: animConfigs[subcatId] = {delay, anchor, baseLayers:[{spriteId, onTop}]}
let animConfigs={};
// Current base layers for the active animation being edited
let animBaseLayers=[]; // [{spriteId, onTop}]

function getSpriteTags(s){return s.tags||{};}
function setTag(s,catId,val){if(!s.tags)s.tags={};s.tags[catId]=val;}
function removeTag(s,catId){if(s.tags)delete s.tags[catId];}

// ===== SHEET/TAB MANAGEMENT =====
function saveSheetState(){
  if(!activeSheetId)return;
  const sh=sheets.find(s=>s.id===activeSheetId);
  if(!sh)return;
  sh.sprites=sprites;sh.categories=categories;sh.tagCategories=tagCategories;
  sh.nextSpriteId=nextSpriteId;sh.nextCatId=nextCatId;sh.nextSubcatId=nextSubcatId;sh.nextTagCatId=nextTagCatId;
  sh.zoom=zoom;sh.panX=panX;sh.panY=panY;sh.bgMode=bgMode;
  sh.undoStack=undoStack;sh.redoStack=redoStack;
  sh.selectedSpriteIds=[...selectedSpriteIds];sh.activeCategoryId=activeCategoryId;
  sh.openCategories=[...openCategories];sh.activeSubcatId=activeSubcatId;
  sh.originalFileData=originalFileData;sh.originalFileName=originalFileName;
  sh.animSubcatIds=[...animSubcatIds];
  sh.animConfigs=JSON.parse(JSON.stringify(animConfigs));
}
function loadSheetState(shId){
  const sh=sheets.find(s=>s.id===shId);if(!sh)return;
  activeSheetId=shId;
  img=sh.img;imgW=sh.imgW;imgH=sh.imgH;
  sprites=sh.sprites||[];categories=sh.categories||[];tagCategories=sh.tagCategories||[{id:'tc_1',name:'View / Angle',color:'#3b82f6',tags:['front','back','side-L','side-R','3/4','top','bottom']},{id:'tc_2',name:'Animation',color:'#8b5cf6',tags:['idle','walk','run','attack','jump','fall','death','hit','cast']},{id:'tc_3',name:'Colorway',color:'#14b8a6',tags:['default','alt-1','alt-2','alt-3','red','blue','green','gold']}];
  nextSpriteId=sh.nextSpriteId||1;nextCatId=sh.nextCatId||1;nextSubcatId=sh.nextSubcatId||1;nextTagCatId=sh.nextTagCatId||4;
  zoom=sh.zoom||1;panX=sh.panX||0;panY=sh.panY||0;bgMode=sh.bgMode||'checker';
  undoStack=sh.undoStack||[];redoStack=sh.redoStack||[];
  selectedSpriteIds=new Set(sh.selectedSpriteIds||[]);activeCategoryId=sh.activeCategoryId||null;
  openCategories=new Set(sh.openCategories||[]);activeSubcatId=sh.activeSubcatId||null;
  originalFileData=sh.originalFileData||null;originalFileName=sh.originalFileName||'';
  animSubcatIds=new Set(sh.animSubcatIds||[]);
  animConfigs=sh.animConfigs?JSON.parse(JSON.stringify(sh.animConfigs)):{};
  selectMode=false;
}

function showSheetWorkspace(){
  document.getElementById('dropzone').style.display='none';
  canvasWrap.classList.remove('dropzone-visible');
  document.getElementById('toolbar').style.display='flex';
  const p=document.getElementById('panel');
  p.style.display='flex';
  if(panelCollapsed)p.classList.add('collapsed');else p.classList.remove('collapsed');
  document.getElementById('bottomBar').style.display='flex';
  document.getElementById('autoDropdown').style.display='inline-block';
  document.getElementById('exportDropdown').style.display='inline-block';
}
function showEmptyWorkspace(message){
  stopAnimPlay();
  img=null;imgW=0;imgH=0;
  sprites=[];categories=[];selectedSpriteIds=new Set();activeCategoryId=null;activeSubcatId=null;
  openCategories=new Set();
  document.getElementById('dropzone').style.display='flex';
  canvasWrap.classList.add('dropzone-visible');
  document.getElementById('toolbar').style.display='none';
  const p=document.getElementById('panel');
  p.style.display='none';
  p.classList.remove('collapsed');
  document.getElementById('bottomBar').style.display='none';
  document.getElementById('autoDropdown').style.display='none';
  document.getElementById('exportDropdown').style.display='none';
  const dims=document.getElementById('imgDims'); if(dims)dims.textContent='—';
  const coord=document.getElementById('coordInfo'); if(coord)coord.textContent='0, 0';
  const zoomLbl=document.getElementById('zoomLevel'); if(zoomLbl)zoomLbl.textContent='100%';
  updateModeIndicator();
  updateActiveToolLabel();
  renderSheetTabs();
  updateExportTabVisibility();
  setStatus(message||'Load a sprite sheet to begin');
}
function addSheetAsync(file){
  return new Promise(resolve=>addSheet(file,resolve));
}
function getJSZipOrToast(){
  if(typeof JSZip==='undefined'){
    toast('ZIP features are unavailable because JSZip failed to load. Refresh and try again.');
    return null;
  }
  return JSZip;
}

function switchSheet(shId){
  // If in edit/compose mode, return to snip first, then switch
  if(typeof peMode!=='undefined'&&peMode&&peMode!=='edit-sheet'){
    returnToSnipMode();
    // After returnToSnipMode, peMode should be null. Now switch sheet normally.
    requestAnimationFrame(()=>{
      if(peMode){peMode=null;restoreToolbarToSnip();const p=document.getElementById('panel');if(p&&p.dataset.origInner){p.innerHTML=p.dataset.origInner;delete p.dataset.origInner;}document.getElementById('peMirrorIndicator').style.display='none';updateModeIndicator();}
      _doSwitchSheet(shId);
    });
    return;
  }
  _doSwitchSheet(shId);
}
function _doSwitchSheet(shId){
  if(typeof peMode!=='undefined'&&peMode==='edit-sheet'){
    // Exit edit-sheet inline
    peMode=null;restoreToolbarToSnip();document.getElementById('peMirrorIndicator').style.display='none';
    const panel=document.getElementById('panel');
    if(panel.dataset.origInner){panel.innerHTML=panel.dataset.origInner;delete panel.dataset.origInner;}
  }
  if(activeSheetId===shId&&img){
    showSheetWorkspace();
    updateModeIndicator();
    updateActiveToolLabel();
    render();refreshAll();
    return;
  }
  stopAnimPlay();
  if(activeSheetId) saveSheetState();
  loadSheetState(shId);
  renderSheetTabs();
  showSheetWorkspace();
  document.getElementById('imgDims').textContent=imgW+' × '+imgH;
  updateExportTabVisibility();
  updateSpriteTagSelects();
  refreshAll();
  updateModeIndicator();
  updateActiveToolLabel();
}
function addSheet(file,callback){
  const r=new FileReader();
  r.onload=e=>{
    const dataUrl=e.target.result;
    const i=new Image();
    i.onload=()=>{
      const sh={id:nextSheetId++,name:file.name.replace(/\.[^.]+$/,''),img:i,imgW:i.width,imgH:i.height,
        sprites:[],categories:[],tagCategories:JSON.parse(JSON.stringify(tagCategories)),
        nextSpriteId:1,nextCatId:1,nextSubcatId:1,nextTagCatId:4,
        zoom:1,panX:0,panY:0,bgMode:'checker',
        undoStack:[],redoStack:[],selectedSpriteIds:[],activeCategoryId:null,
        openCategories:[],activeSubcatId:null,
        originalFileData:dataUrl,originalFileName:file.name,animSubcatIds:[],animConfigs:{}};
      sheets.push(sh);
      renderSheetTabs();
      switchSheet(sh.id);
      zoomFit();
      if(callback)callback(sh);
    };
    i.src=dataUrl;
  };
  r.readAsDataURL(file);
}
function closeSheet(shId){
  const idx=sheets.findIndex(s=>s.id===shId);
  if(idx<0)return;
  sheets.splice(idx,1);
  if(!sheets.length){
    activeSheetId=null;
    showEmptyWorkspace('All sheets closed — import images or start a new file.');
    toast('Closed last sheet');
    return;
  }
  if(activeSheetId===shId){
    const newIdx=Math.min(idx,sheets.length-1);
    switchSheet(sheets[newIdx].id);
  } else {
    renderSheetTabs();updateExportTabVisibility();
  }
}
function renameSheet(shId){
  const sh=sheets.find(s=>s.id===shId);if(!sh)return;
  const n=prompt('Rename sheet:',sh.name);
  if(n!==null&&n.trim()){sh.name=n.trim();renderSheetTabs();}
}
function renameProject(){
  const n=prompt('Project name:',projectName);
  if(n!==null&&n.trim()){projectName=n.trim();document.getElementById('projectNameLabel').textContent='.'+projectName;}
}
function renderSheetTabs(){
  const c=document.getElementById('sheetTabs');
  c.innerHTML=sheets.map(sh=>'<div class="sheet-tab'+(sh.id===activeSheetId?' active':'')+'" data-shid="'+sh.id+'" ondblclick="renameSheet('+sh.id+')"><span>'+esc(sh.name)+'</span><button class="close-tab" onclick="event.stopPropagation();closeSheet('+sh.id+')">×</button></div>').join('');
  c.querySelectorAll('.sheet-tab').forEach(el=>{
    el.addEventListener('click',e=>{if(e.target.closest('.close-tab'))return;switchSheet(parseInt(el.dataset.shid));});
  });
}
function updateExportTabVisibility(){
  document.getElementById('exportCurrentTabItem').style.display=sheets.length>=2?'flex':'none';
  const jsonItem=document.getElementById('importJsonItem');
  if(jsonItem) jsonItem.style.display=sheets.length>=1?'flex':'none';
}

// ===== DROPDOWN MENUS =====
function toggleDD(id){
  const el=document.getElementById(id);
  const wasOpen=el.classList.contains('open');
  closeAllDD();
  if(!wasOpen)el.classList.add('open');
}
function closeAllDD(){document.querySelectorAll('.dropdown-menu').forEach(m=>m.classList.remove('open'));}
document.addEventListener('click',e=>{if(!e.target.closest('.dropdown'))closeAllDD();});

// ===== UNDO/STATE =====
function saveState(){undoStack.push(JSON.stringify({sprites,categories,nextSpriteId,nextCatId,nextSubcatId,tagCategories}));if(undoStack.length>MAX_UNDO)undoStack.shift();redoStack=[];updateUndoRedo();}
function undo(){if(!undoStack.length)return;redoStack.push(JSON.stringify({sprites,categories,nextSpriteId,nextCatId,nextSubcatId,tagCategories}));const s=JSON.parse(undoStack.pop());sprites=s.sprites;categories=s.categories;nextSpriteId=s.nextSpriteId;nextCatId=s.nextCatId;nextSubcatId=s.nextSubcatId;if(s.tagCategories)tagCategories=s.tagCategories;selectedSpriteIds.clear();refreshAll();toast('Undo');}
function redo(){if(!redoStack.length)return;undoStack.push(JSON.stringify({sprites,categories,nextSpriteId,nextCatId,nextSubcatId,tagCategories}));const s=JSON.parse(redoStack.pop());sprites=s.sprites;categories=s.categories;nextSpriteId=s.nextSpriteId;nextCatId=s.nextCatId;nextSubcatId=s.nextSubcatId;if(s.tagCategories)tagCategories=s.tagCategories;selectedSpriteIds.clear();refreshAll();toast('Redo');}
function updateUndoRedo(){const undoBtn=document.getElementById('undoBtn'),redoBtn=document.getElementById('redoBtn');if(undoBtn)undoBtn.disabled=!undoStack.length;if(redoBtn)redoBtn.disabled=!redoStack.length;}
function refreshAll(){updateSpriteList();updateCategoryList();render();updateUndoRedo();updateSelInfo();updateAnimSubcatSelect();}

// ===== FILE HANDLING =====
const canvasWrap=document.getElementById('canvasWrap'),mainCanvas=document.getElementById('mainCanvas'),overlayCanvas=document.getElementById('overlayCanvas'),interactionLayer=document.getElementById('interactionLayer');
canvasWrap.classList.add('dropzone-visible');
const mCtx=mainCanvas.getContext('2d'),oCtx=overlayCanvas.getContext('2d');
const dropzoneBox=document.getElementById('dropzoneBox'),fileInput=document.getElementById('fileInput'),jsonImportInput=document.getElementById('jsonImportInput'),projectImportInput=document.getElementById('projectImportInput'),yyImportInput=document.getElementById('yyImportInput');

dropzoneBox.addEventListener('click',()=>fileInput.click());
dropzoneBox.addEventListener('dragover',e=>{e.preventDefault();dropzoneBox.classList.add('dragover');});
dropzoneBox.addEventListener('dragleave',()=>dropzoneBox.classList.remove('dragover'));
dropzoneBox.addEventListener('drop',e=>{e.preventDefault();dropzoneBox.classList.remove('dragover');if(e.dataTransfer.files.length)handleFiles(e.dataTransfer.files);});
// Prevent file drops anywhere except the dropzone box
document.addEventListener('dragover',e=>{if(e.dataTransfer&&e.dataTransfer.types&&e.dataTransfer.types.includes('Files')){if(!e.target.closest('#dropzoneBox'))e.preventDefault();}});
document.addEventListener('drop',e=>{if(!e.target.closest('#dropzoneBox')){e.preventDefault();e.stopPropagation();}});
fileInput.addEventListener('change',e=>{if(e.target.files.length)handleFiles(e.target.files);e.target.value='';});
jsonImportInput.addEventListener('change',e=>{if(e.target.files[0])importJSON(e.target.files[0]);e.target.value='';});
projectImportInput.addEventListener('change',e=>{if(e.target.files[0])importProject(e.target.files[0]);e.target.value='';});
yyImportInput.addEventListener('change',e=>{if(e.target.files[0])importYY(e.target.files[0]);e.target.value='';});

async function handleFiles(files){
  const imgs=[...files].filter(f=>f&&f.type&&f.type.startsWith('image/'));
  if(!imgs.length){toast('Only image files can be imported here');return;}
  for(const f of imgs){
    await addSheetAsync(f);
  }
}

function setBg(mode,el){bgMode=mode;document.querySelectorAll('.bg-swatch').forEach(s=>s.classList.remove('active'));if(el)el.classList.add('active');render();}

// ===== TAG SYSTEM FUNCTIONS =====
function toggleTagCatVis(tcid){if(tagCatVisibility[tcid])delete tagCatVisibility[tcid];else tagCatVisibility[tcid]=true;renderTagPopover();render();}
function toggleTagPopoverMinimize(){document.getElementById('tagPopover').classList.toggle('minimized');}
function toggleMultiTagMode(){
  multiTagMode=!multiTagMode;
  const btn=document.getElementById('multiTagBtn');
  btn.classList.toggle('active-mode',multiTagMode);
  btn.innerHTML=multiTagMode?'Multi ✓':'Multi';
  if(!multiTagMode){multiTags={};}
  if(multiTagMode){activeTagCatId=null;activeTag=null;}
  renderTagPopover();render();
}
function isMultiTagActive(tcid,tag){return multiTags[tcid]===tag;}
function toggleMultiTag(tcid,tag){if(multiTags[tcid]===tag)delete multiTags[tcid];else multiTags[tcid]=tag;renderTagPopover();render();}
function applyMultiTagsToSprite(s){let changed=false;for(const[tcid,val]of Object.entries(multiTags)){setTag(s,tcid,val);changed=true;}return changed;}
function spriteHasAllMultiTags(s){const tags=getSpriteTags(s);for(const[tcid,val]of Object.entries(multiTags)){if(tags[tcid]!==val)return false;}return true;}
function openTagPopover(){document.getElementById('tagPopover').classList.add('open');renderTagPopover();}
function closeTagPopover(){document.getElementById('tagPopover').classList.remove('open');activeTagCatId=null;activeTag=null;multiTagMode=false;multiTags={};const btn=document.getElementById('multiTagBtn');if(btn){btn.classList.remove('active-mode');btn.textContent='Multi';}}
function renderTagPopover(){
  const body=document.getElementById('tagPopoverBody');let h='';
  const tagCatCounts={};tagCategories.forEach(tc=>{let c=0;sprites.forEach(s=>{if(s.tags&&s.tags[tc.id])c++;});tagCatCounts[tc.id]=c;});
  tagCategories.forEach(tc=>{const visOn=tagCatVisibility[tc.id];
    h+='<div class="tag-cat-section"><div class="tag-cat-title"><button class="tag-cat-vis'+(visOn?' on':'')+'" data-tcvis="'+tc.id+'" title="Highlight tagged sprites ('+tagCatCounts[tc.id]+'/'+sprites.length+')"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button><span class="tag-cat-title-text">'+esc(tc.name)+'</span><span style="font-family:var(--font-mono);font-size:8px;color:var(--text2);">'+tagCatCounts[tc.id]+'/'+sprites.length+'</span></div><div class="tag-list">';
    tc.tags.forEach(tag=>{
      const singleActive=!multiTagMode&&activeTagCatId===tc.id&&activeTag===tag;
      const multiActive=multiTagMode&&multiTags[tc.id]===tag;
      h+='<div class="tag-chip'+(singleActive?' active':'')+(multiActive?' multi-active':'')+'" style="background:'+tc.color+'" data-tcid="'+tc.id+'" data-tag="'+esc(tag)+'">'+esc(tag)+'</div>';});
    h+='</div></div>';});
  body.innerHTML=h;
  body.querySelectorAll('.tag-cat-vis').forEach(btn=>{btn.addEventListener('click',()=>{toggleTagCatVis(btn.dataset.tcvis);});});
  body.querySelectorAll('.tag-chip').forEach(el=>{el.addEventListener('click',()=>{
    if(multiTagMode){toggleMultiTag(el.dataset.tcid,el.dataset.tag);}
    else{if(activeTagCatId===el.dataset.tcid&&activeTag===el.dataset.tag){activeTagCatId=null;activeTag=null;}else{activeTagCatId=el.dataset.tcid;activeTag=el.dataset.tag;}renderTagPopover();render();}
  });});
}
function openTagMgmt(){document.getElementById('tagMgmtModal').style.display='flex';renderTagMgmt();}
function closeTagMgmt(){document.getElementById('tagMgmtModal').style.display='none';renderTagPopover();updateSpriteTagSelects();}
function renderTagMgmt(focusCatId){
  const body=document.getElementById('tagMgmtBody');const prevScroll=body.scrollTop;let h='';
  tagCategories.forEach(tc=>{
    h+='<div class="tag-mgmt-cat" data-tmcat="'+tc.id+'" style="margin-bottom:12px;"><div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">'
      +'<input type="color" value="'+tc.color+'" data-tccolor="'+tc.id+'" style="width:20px;height:20px;border:1px solid var(--border);border-radius:3px;padding:0;cursor:pointer;">'
      +'<input type="text" value="'+esc(tc.name)+'" data-tcname="'+tc.id+'" style="flex:1;padding:4px 6px;margin-bottom:0;">'
      +'<button class="btn sm danger" onclick="deleteTagCategory(\''+tc.id+'\')">×</button></div>'
      +'<div class="tag-mgmt-taglist" data-tmlist="'+tc.id+'" style="max-height:160px;overflow-y:auto;margin-bottom:4px;border:1px solid var(--border);border-radius:4px;padding:2px;">';
    tc.tags.forEach((tag,i)=>{h+='<div class="tag-mgmt-item"><input type="text" value="'+esc(tag)+'" data-tctag="'+tc.id+'-'+i+'"><button class="del-btn" onclick="deleteTagFromCategory(\''+tc.id+'\','+i+')">×</button></div>';});
    if(!tc.tags.length)h+='<div style="padding:4px 6px;font-size:9px;color:var(--text2);text-align:center;">No tags yet</div>';
    h+='</div><button class="btn sm" onclick="addTagToCategory(\''+tc.id+'\')">+ Tag</button></div>';});
  body.innerHTML=h;
  body.querySelectorAll('[data-tcname]').forEach(inp=>{inp.addEventListener('change',()=>{const tc=tagCategories.find(c=>c.id===inp.dataset.tcname);if(tc)tc.name=inp.value.trim()||tc.name;});});
  body.querySelectorAll('[data-tccolor]').forEach(inp=>{inp.addEventListener('change',()=>{const tc=tagCategories.find(c=>c.id===inp.dataset.tccolor);if(tc)tc.color=inp.value;});});
  body.querySelectorAll('[data-tctag]').forEach(inp=>{inp.addEventListener('change',()=>{const[tcid,idx]=inp.dataset.tctag.split('-');const tc=tagCategories.find(c=>c.id===tcid);if(tc&&tc.tags[parseInt(idx)]!==undefined){const oldVal=tc.tags[parseInt(idx)];const newVal=inp.value.trim();if(oldVal!==newVal&&newVal){tc.tags[parseInt(idx)]=newVal;sprites.forEach(s=>{if(s.tags&&s.tags[tcid]===oldVal)s.tags[tcid]=newVal;});}}});});
  body.scrollTop=prevScroll;
  if(focusCatId){const tl=body.querySelector('[data-tmlist="'+focusCatId+'"]');if(tl)tl.scrollTop=tl.scrollHeight;}
}
function addTagCategory(){tagCategories.push({id:'tc_'+(nextTagCatId++),name:'Custom',color:catColors[tagCategories.length%catColors.length],tags:['tag1']});renderTagMgmt();}
function deleteTagCategory(id){tagCategories=tagCategories.filter(c=>c.id!==id);sprites.forEach(s=>{if(s.tags)delete s.tags[id];});renderTagMgmt();}
function addTagToCategory(id){const tc=tagCategories.find(c=>c.id===id);if(tc){tc.tags.push('new');renderTagMgmt(id);}}
function deleteTagFromCategory(id,idx){const tc=tagCategories.find(c=>c.id===id);if(tc){tc.tags.splice(idx,1);renderTagMgmt(id);}}
function updateSpriteTagSelects(){
  const cs=document.getElementById('spriteTagCatSelect'),vs=document.getElementById('spriteTagValSelect');
  if(!cs)return;cs.innerHTML='<option value="">Group...</option>';
  tagCategories.forEach(tc=>{cs.innerHTML+='<option value="'+tc.id+'">'+esc(tc.name)+'</option>';});
  vs.innerHTML='<option value="">Tag...</option>';
}
function updateSpriteTagValueSelect(){
  const vs=document.getElementById('spriteTagValSelect');vs.innerHTML='<option value="">Tag...</option>';
  const tc=tagCategories.find(c=>c.id===document.getElementById('spriteTagCatSelect').value);
  if(tc)tc.tags.forEach(t=>{vs.innerHTML+='<option value="'+esc(t)+'">'+esc(t)+'</option>';});
}
function applyTagToSelected(){
  const cs=document.getElementById('spriteTagCatSelect'),vs=document.getElementById('spriteTagValSelect');
  if(!cs.value||!vs.value)return;if(!selectedSpriteIds.size){toast('Select sprites first');return;}
  saveState();sprites.forEach(s=>{if(selectedSpriteIds.has(s.id))setTag(s,cs.value,vs.value);});
  refreshAll();toast('Tagged '+selectedSpriteIds.size+' sprite(s)');vs.value='';
}
function removeTagsFromSelected(){
  if(!selectedSpriteIds.size){toast('Select sprites first');return;}
  const cs=document.getElementById('spriteTagCatSelect');saveState();
  sprites.forEach(s=>{if(selectedSpriteIds.has(s.id)){if(cs.value)removeTag(s,cs.value);else s.tags={};}});
  refreshAll();toast('Removed tags');
}

// ===== RENDER =====
function render(){
  if(peMode&&peMode!=='edit-sheet'){peRender();return;}
  if(!img)return;
  const cw=Math.floor(canvasWrap.clientWidth||0),ch=Math.floor(canvasWrap.clientHeight||0),pw=imgW*zoom,ph=imgH*zoom;
  if(cw<8||ch<8){if(peMode==='edit-sheet'&&typeof peScheduleStableRender==='function')peScheduleStableRender(12);return;}
  mainCanvas.width=cw;mainCanvas.height=ch;overlayCanvas.width=cw;overlayCanvas.height=ch;
  mainCanvas.style.width=cw+'px';mainCanvas.style.height=ch+'px';overlayCanvas.style.width=cw+'px';overlayCanvas.style.height=ch+'px';
  const ox=panX,oy=panY;
  mCtx.fillStyle='#0a0a0d';mCtx.fillRect(0,0,cw,ch);
  mCtx.save();mCtx.beginPath();mCtx.rect(ox,oy,pw,ph);mCtx.clip();
  if(bgMode==='checker'){const cs=Math.max(4,Math.round(8*zoom));for(let y=0;y<ph;y+=cs)for(let x=0;x<pw;x+=cs){mCtx.fillStyle=(Math.floor(x/cs)+Math.floor(y/cs))%2===0?'#1a1a20':'#222228';mCtx.fillRect(ox+x,oy+y,cs,cs);}}
  else{mCtx.fillStyle=bgMode;mCtx.fillRect(ox,oy,pw,ph);}
  mCtx.restore();mCtx.imageSmoothingEnabled=false;mCtx.drawImage(img,ox,oy,pw,ph);
  if(zoom>=6){mCtx.save();mCtx.strokeStyle='rgba(255,255,255,0.06)';mCtx.lineWidth=0.5;const x0=Math.max(0,Math.floor(-ox/zoom)),x1=Math.min(imgW,Math.ceil((cw-ox)/zoom)),y0=Math.max(0,Math.floor(-oy/zoom)),y1=Math.min(imgH,Math.ceil((ch-oy)/zoom));for(let x=x0;x<=x1;x++){const sx=ox+x*zoom;mCtx.beginPath();mCtx.moveTo(sx,Math.max(0,oy));mCtx.lineTo(sx,Math.min(ch,oy+ph));mCtx.stroke();}for(let y=y0;y<=y1;y++){const sy=oy+y*zoom;mCtx.beginPath();mCtx.moveTo(Math.max(0,ox),sy);mCtx.lineTo(Math.min(cw,ox+pw),sy);mCtx.stroke();}mCtx.restore();}
  oCtx.clearRect(0,0,cw,ch);
  if(showCatBoxes)categories.forEach(cat=>{if(!cat.region)return;const r=cat.region,sx=ox+r.x*zoom,sy=oy+r.y*zoom,sw=r.w*zoom,sh=r.h*zoom;const _chi=activeCategoryId===cat.id;oCtx.save();oCtx.strokeStyle=cat.color;oCtx.lineWidth=_chi?3:2;oCtx.setLineDash([6,3]);oCtx.strokeRect(sx,sy,sw,sh);oCtx.fillStyle=cat.color+(_chi?'25':'12');oCtx.fillRect(sx,sy,sw,sh);oCtx.setLineDash([]);oCtx.font=`600 ${Math.max(9,Math.min(13,zoom*3))}px 'JetBrains Mono'`;oCtx.fillStyle=cat.color;oCtx.fillText(cat.name,sx+3,sy-3>10?sy-3:sy+12);oCtx.restore();});
  if(showSubBoxes)categories.forEach(cat=>{if(!cat.subcats)return;cat.subcats.forEach(sc=>{if(!sc.region)return;const r=sc.region,sx=ox+r.x*zoom,sy=oy+r.y*zoom,sw=r.w*zoom,sh=r.h*zoom;const _shi=activeSubcatId===sc.id;oCtx.save();oCtx.strokeStyle=sc.color;oCtx.lineWidth=_shi?2.5:1.5;oCtx.setLineDash([4,2]);oCtx.strokeRect(sx,sy,sw,sh);oCtx.fillStyle=sc.color+(_shi?'20':'0a');oCtx.fillRect(sx,sy,sw,sh);oCtx.setLineDash([]);
    // Draw subcategory name with bolt if has animation
    const hasBolt=animSubcatIds.has(sc.id);
    const label=sc.name+(hasBolt?' \u2022anim':'');
    oCtx.font=`500 ${Math.max(8,Math.min(11,zoom*2.5))}px 'JetBrains Mono'`;oCtx.fillStyle=sc.color;oCtx.fillText(label,sx+3,sy-2>10?sy-2:sy+10);oCtx.restore();});});
  if(showSprBoxes)sprites.forEach(s=>{
    const sx=ox+s.x*zoom,sy=oy+s.y*zoom,sw=s.w*zoom,sh=s.h*zoom,sel=selectedSpriteIds.has(s.id);
    const cat=categories.find(c=>c.id===s.categoryId),sc=cat&&s.subcatId?(cat.subcats||[]).find(sc=>sc.id===s.subcatId):null;
    const baseCol=sc?sc.color:(cat?cat.color:'#ff6b35');
    const _grpHi=(activeCategoryId&&s.categoryId===activeCategoryId)||(activeSubcatId&&s.subcatId===activeSubcatId);
    const _tagHi=(activeTagCatId&&activeTag&&s.tags&&s.tags[activeTagCatId]===activeTag)||(multiTagMode&&Object.keys(multiTags).length&&spriteHasAllMultiTags(s));
    let _tagCatVis=false;
    for(const tcid of Object.keys(tagCatVisibility)){if(s.tags&&s.tags[tcid]){_tagCatVis=true;break;}}
    oCtx.save();
    if(sel){oCtx.strokeStyle='#ffffff';oCtx.lineWidth=2;oCtx.strokeRect(sx,sy,sw,sh);oCtx.fillStyle='rgba(255,107,53,0.18)';oCtx.fillRect(sx,sy,sw,sh);oCtx.strokeStyle=baseCol;oCtx.lineWidth=1;oCtx.setLineDash([3,2]);oCtx.strokeRect(sx+2,sy+2,sw-4,sh-4);oCtx.setLineDash([]);}
    else if(_tagHi){oCtx.strokeStyle='#3b82f6';oCtx.lineWidth=2;oCtx.strokeRect(sx,sy,sw,sh);oCtx.fillStyle='rgba(59,130,246,0.25)';oCtx.fillRect(sx,sy,sw,sh);}
    else if(_tagCatVis){oCtx.strokeStyle='#ff9f1c';oCtx.lineWidth=1.5;oCtx.strokeRect(sx,sy,sw,sh);oCtx.fillStyle='rgba(255,159,28,0.15)';oCtx.fillRect(sx,sy,sw,sh);}
    else if(_grpHi){oCtx.strokeStyle=baseCol;oCtx.lineWidth=2;oCtx.strokeRect(sx,sy,sw,sh);oCtx.fillStyle=baseCol+'30';oCtx.fillRect(sx,sy,sw,sh);}
    else{oCtx.strokeStyle=baseCol;oCtx.lineWidth=1;oCtx.strokeRect(sx,sy,sw,sh);oCtx.fillStyle=baseCol+'0a';oCtx.fillRect(sx,sy,sw,sh);}
    if(zoom>=1.5){oCtx.font=`500 ${Math.max(7,Math.min(10,zoom*2))}px 'JetBrains Mono'`;oCtx.fillStyle=(sel||_grpHi||_tagHi||_tagCatVis)?'#ffffff':baseCol;oCtx.fillText(s.name||'#'+s.id,sx+2,sy-2>8?sy-2:sy+9);}
    // Draw object contour outline if present
    if(s.objectContour&&s.objectContour.length&&zoom>=1){
      const contourColor=sel?'#ffffff':(cat?cat.color:'#3b82f6');
      oCtx.fillStyle=contourColor;
      oCtx.globalAlpha=0.85;
      s.objectContour.forEach(p=>{
        // Draw a pixel-sized dot at each edge pixel
        oCtx.fillRect(ox+p.x*zoom,oy+p.y*zoom,Math.max(1,zoom),Math.max(1,zoom));
      });
      oCtx.globalAlpha=1;
    }
    // Dim excluded pixels at higher zoom
    if(s.excludeMask&&Object.keys(s.excludeMask).length&&zoom>=3){
      oCtx.fillStyle='rgba(0,0,0,0.5)';
      for(const key of Object.keys(s.excludeMask)){
        const[epx,epy]=key.split(',').map(Number);
        if(epx>=s.x&&epx<s.x+s.w&&epy>=s.y&&epy<s.y+s.h){
          oCtx.fillRect(ox+epx*zoom,oy+epy*zoom,zoom,zoom);
        }
      }
    } else if(s.excludeMask&&Object.keys(s.excludeMask).length&&zoom<3){
      // At low zoom, show a small scissors indicator
      oCtx.fillStyle='rgba(255,60,60,0.8)';oCtx.font="bold 9px 'JetBrains Mono'";
      oCtx.fillText('✂',sx+sw-12,sy+sh-3);
    }
    oCtx.restore();
  });
  if(drawing&&drawStart&&drawCurrent&&(tool==='select'||tool==='category'||tool==='subcategory')){
    const r=getPixelRect(drawStart,drawCurrent),sx=ox+r.x*zoom,sy=oy+r.y*zoom,sw=r.w*zoom,sh=r.h*zoom;oCtx.save();
    if(tool==='select'){oCtx.strokeStyle='#ff6b35';oCtx.lineWidth=2;oCtx.setLineDash([4,2]);oCtx.strokeRect(sx,sy,sw,sh);oCtx.fillStyle='rgba(255,107,53,0.1)';oCtx.fillRect(sx,sy,sw,sh);oCtx.setLineDash([]);oCtx.font="600 10px 'JetBrains Mono'";oCtx.fillStyle='#ff6b35';oCtx.fillText(r.w+'×'+r.h,sx+2,sy-3>10?sy-3:sy+sh+11);}
    else if(tool==='category'){const cc=catColors[(nextCatId-1)%catColors.length];oCtx.strokeStyle=cc;oCtx.lineWidth=2;oCtx.setLineDash([6,3]);oCtx.strokeRect(sx,sy,sw,sh);oCtx.fillStyle=cc+'15';oCtx.fillRect(sx,sy,sw,sh);}
    else if(tool==='subcategory'){const cc=catColors[((nextSubcatId-1)+3)%catColors.length];oCtx.strokeStyle=cc;oCtx.lineWidth=1.5;oCtx.setLineDash([4,2]);oCtx.strokeRect(sx,sy,sw,sh);oCtx.fillStyle=cc+'10';oCtx.fillRect(sx,sy,sw,sh);}
    oCtx.restore();
  }
  if(tagLassoActive&&tagLassoPoints.length>1){oCtx.save();oCtx.strokeStyle='#3b82f6';oCtx.lineWidth=2;oCtx.setLineDash([5,3]);oCtx.beginPath();tagLassoPoints.forEach((p,i)=>{const sx=ox+p.px*zoom+zoom/2,sy=oy+p.py*zoom+zoom/2;if(i===0)oCtx.moveTo(sx,sy);else oCtx.lineTo(sx,sy);});oCtx.stroke();oCtx.fillStyle='rgba(59,130,246,0.08)';oCtx.fill();oCtx.setLineDash([]);oCtx.restore();}
  if(lassoActive&&lassoPoints.length>1){oCtx.save();oCtx.strokeStyle='#ff6b35';oCtx.lineWidth=2;oCtx.setLineDash([5,3]);oCtx.beginPath();lassoPoints.forEach((p,i)=>{const sx=ox+p.px*zoom+zoom/2,sy=oy+p.py*zoom+zoom/2;if(i===0)oCtx.moveTo(sx,sy);else oCtx.lineTo(sx,sy);});oCtx.stroke();oCtx.fillStyle='rgba(255,107,53,0.08)';oCtx.fill();oCtx.setLineDash([]);oCtx.restore();}
  // Render grid overlay if active
  if(typeof gridVisible!=='undefined'&&gridVisible){try{renderGridOverlay();}catch(e){}}
}

function getPixelRect(a,b){const x1=Math.min(a.px,b.px),y1=Math.min(a.py,b.py),x2=Math.max(a.px,b.px),y2=Math.max(a.py,b.py);return{x:x1,y:y1,w:x2-x1+1,h:y2-y1+1};}
function screenToPixel(sx,sy){return{px:Math.max(0,Math.min(imgW-1,Math.floor((sx-panX)/zoom))),py:Math.max(0,Math.min(imgH-1,Math.floor((sy-panY)/zoom)))};}
function getEventPos(e){const r=canvasWrap.getBoundingClientRect();if(e.touches&&e.touches.length)return{x:e.touches[0].clientX-r.left,y:e.touches[0].clientY-r.top};return{x:e.clientX-r.left,y:e.clientY-r.top};}
function pointInPolygon(px,py,poly){let inside=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const xi=poly[i].px,yi=poly[i].py,xj=poly[j].px,yj=poly[j].py;if(((yi>py)!==(yj>py))&&(px<(xj-xi)*(py-yi)/(yj-yi)+xi))inside=!inside;}return inside;}

// ===== PINCH ZOOM FIX: preserve selection =====
let lastTouchDist=0,lastPinchCx=0,lastPinchCy=0;
let pinchZoomActive=false;
interactionLayer.addEventListener('touchstart',e=>{
  if(e.touches.length===2){
    e.preventDefault();
    pinchZoomActive=true;
    pendingDeselect=false;
    // Cancel snip mode operations
    if(moveActive){moveActive=false;if(moveOrigPositions){moveOrigPositions.forEach((orig,id)=>{const s=sprites.find(s=>s.id===id);if(s){s.x=orig.x;s.y=orig.y;}});};moveStartPx=null;moveOrigPositions=null;}
    if(isPanning){isPanning=false;canvasWrap.classList.remove('panning');}
    if(lassoActive){lassoActive=false;lassoPoints=[];}
    if(tagLassoActive){tagLassoActive=false;tagLassoPoints=[];}
    drawing=false;
    // Cancel edit mode operations
    peDrawing=false;peDrawStart=null;peDrawCurrent=null;
    scDragging=false;
    const dx=e.touches[0].clientX-e.touches[1].clientX,dy=e.touches[0].clientY-e.touches[1].clientY;
    lastTouchDist=Math.hypot(dx,dy);
  }
},{passive:false});
interactionLayer.addEventListener('touchmove',e=>{
  if(e.touches.length===2){
    e.preventDefault();
    const dx=e.touches[0].clientX-e.touches[1].clientX,dy=e.touches[0].clientY-e.touches[1].clientY;
    const dist=Math.hypot(dx,dy),r=canvasWrap.getBoundingClientRect();
    const cx=(e.touches[0].clientX+e.touches[1].clientX)/2-r.left,cy=(e.touches[0].clientY+e.touches[1].clientY)/2-r.top;
    if(lastPinchCx&&lastPinchCy){panX+=cx-lastPinchCx;panY+=cy-lastPinchCy;}
    if(peMode&&peMode!=='edit-sheet'&&typeof peZoomAt==='function'){peZoomAt(cx,cy,zoom*(dist/lastTouchDist));}
    else {zoomAt(cx,cy,zoom*(dist/lastTouchDist)); if(peMode)peRender();else render();}
    lastTouchDist=dist;lastPinchCx=cx;lastPinchCy=cy;
  } else {lastPinchCx=0;lastPinchCy=0;}
},{passive:false});
interactionLayer.addEventListener('touchend',e=>{
  if(e.touches.length<2){lastPinchCx=0;lastPinchCy=0;pinchZoomActive=false;}
},{passive:true});

interactionLayer.addEventListener('pointerdown',onPtrDown);interactionLayer.addEventListener('pointermove',onPtrMove);interactionLayer.addEventListener('pointerup',onPtrUp);interactionLayer.addEventListener('pointerleave',onPtrUp);interactionLayer.addEventListener('wheel',onWheel,{passive:false});interactionLayer.addEventListener('contextmenu',e=>e.preventDefault());

function onPtrDown(e){
  if(peMode==='edit-sheet'){peSheetHandleDown(e);return;}
  if(peMode){peHandleDown(e);return;}
  if(!img||pinchZoomActive)return;
  // Intercept for remove-bg eyedropper
  if(rmbgEyedropperActive&&e.button===0)return; // Let the click handler above handle it
  const pos=getEventPos(e);
  if(e.button===1||spaceHeld||tool==='pan'){isPanning=true;panStart=pos;lastPanX=panX;lastPanY=panY;canvasWrap.classList.add('panning');interactionLayer.setPointerCapture(e.pointerId);return;}
  if(e.button!==0)return;const px=screenToPixel(pos.x,pos.y);
  if(tool==='tag'){
    const mode=document.getElementById('tagApplyMode').value;
    if(mode==='click'){const hit=findSpriteAt(px.px,px.py);
      if(!hit)return;
      if(multiTagMode&&Object.keys(multiTags).length){
        saveState();
        if(spriteHasAllMultiTags(hit)){for(const tcid of Object.keys(multiTags))removeTag(hit,tcid);refreshAll();toast('Untagged sprite');}
        else{applyMultiTagsToSprite(hit);refreshAll();toast('Tagged: '+Object.values(multiTags).join(', '));}
      } else if(activeTagCatId&&activeTag){
        saveState();const tags=getSpriteTags(hit);
        if(tags[activeTagCatId]===activeTag){removeTag(hit,activeTagCatId);refreshAll();toast('Untagged: '+activeTag);}
        else{setTag(hit,activeTagCatId,activeTag);refreshAll();toast('Tagged: '+activeTag);}
      } else {toast('Pick a tag first');}
      return;}
    if(mode==='lasso'){tagLassoActive=true;tagLassoPoints=[px];lassoStartPos=pos;interactionLayer.setPointerCapture(e.pointerId);return;}
    return;
  }
  if(tool==='erase'){const h=findSpriteAt(px.px,px.py);if(h){saveState();sprites=sprites.filter(s=>s.id!==h.id);selectedSpriteIds.delete(h.id);refreshAll();toast('Removed #'+h.id);}return;}
  if(tool==='repeat'){if(selectedSpriteIds.size<2){toast('Select 2+ adjacent sprites first');return;}document.getElementById('repeatModal').style.display='flex';updateRepeatPreview();return;}
  if(tool==='lasso'){lassoActive=true;lassoPoints=[px];lassoStartPos=pos;interactionLayer.setPointerCapture(e.pointerId);return;}
  if(tool==='move'){
    const hit=findSpriteAt(px.px,px.py);
    if(hit){
      if(selectedSpriteIds.has(hit.id)){
        moveActive=true;moveStartPx=px;moveOrigPositions=new Map();
        sprites.forEach(s=>{if(selectedSpriteIds.has(s.id))moveOrigPositions.set(s.id,{x:s.x,y:s.y});});
        saveState();interactionLayer.setPointerCapture(e.pointerId);return;
      }
      if(e.shiftKey||e.ctrlKey||e.metaKey){if(selectedSpriteIds.has(hit.id))selectedSpriteIds.delete(hit.id);else selectedSpriteIds.add(hit.id);}
      else{selectedSpriteIds.clear();selectedSpriteIds.add(hit.id);}
      if(!selectMode&&selectedSpriteIds.size)toggleSelectMode();else{updateSpriteList();updateSelInfo();render();}
      toast('Selected '+hit.name);return;
    } else {
      // On touch, defer deselection to allow pinch gesture to be detected
      if(e.pointerType==='touch'&&selectedSpriteIds.size){
        pendingDeselect=true;interactionLayer.setPointerCapture(e.pointerId);
      } else if(selectedSpriteIds.size){selectedSpriteIds.clear();updateSpriteList();updateSelInfo();render();toast('Deselected');}
      return;
    }
  }
  if(tool==='select'||tool==='category'||tool==='subcategory'){drawing=true;drawStart=px;drawCurrent=px;interactionLayer.setPointerCapture(e.pointerId);}
}
function onPtrMove(e){
  if(peMode==='edit-sheet'){peSheetHandleMove(e);return;}
  if(peMode){peHandleMove(e);return;}
  if(!img)return;const pos=getEventPos(e),px=screenToPixel(pos.x,pos.y);
  document.getElementById('coordInfo').textContent=px.px+', '+px.py;
  if(isPanning){panX=lastPanX+(pos.x-panStart.x);panY=lastPanY+(pos.y-panStart.y);render();return;}
  if(moveActive&&moveStartPx&&moveOrigPositions){
    const dx=px.px-moveStartPx.px,dy=px.py-moveStartPx.py;
    moveOrigPositions.forEach((orig,id)=>{const s=sprites.find(s=>s.id===id);if(s){s.x=Math.max(0,Math.min(imgW-s.w,orig.x+dx));s.y=Math.max(0,Math.min(imgH-s.h,orig.y+dy));}});
    render();return;
  }
  if(tagLassoActive){const last=tagLassoPoints[tagLassoPoints.length-1];if(!last||last.px!==px.px||last.py!==px.py){tagLassoPoints.push(px);render();}return;}
  if(lassoActive){const last=lassoPoints[lassoPoints.length-1];if(!last||last.px!==px.px||last.py!==px.py){lassoPoints.push(px);render();}return;}
  if(drawing){drawCurrent=screenToPixel(pos.x,pos.y);render();}
}
function onPtrUp(e){
  if(peMode==='edit-sheet'){peSheetHandleUp(e);return;}
  if(peMode){peHandleUp(e);return;}
  if(pendingDeselect){
    pendingDeselect=false;
    if(!pinchZoomActive){selectedSpriteIds.clear();updateSpriteList();updateSelInfo();render();toast('Deselected');}
    return;
  }
  if(isPanning){isPanning=false;canvasWrap.classList.remove('panning');return;}
  if(moveActive){
    moveActive=false;const movedIds=moveOrigPositions?[...moveOrigPositions.keys()]:[];
    moveStartPx=null;moveOrigPositions=null;
    sprites.forEach(s=>{if(movedIds.includes(s.id)){s.categoryId=null;s.subcatId=null;}});
    assignSpritesToCategories();refreshAll();
    if(movedIds.length)toast('Moved '+movedIds.length+' sprite(s)');return;
  }
  if(tagLassoActive){
    tagLassoActive=false;
    if(tagLassoPoints.length>2){
      const hasMulti=multiTagMode&&Object.keys(multiTags).length;const hasSingle=activeTagCatId&&activeTag;
      if(hasMulti||hasSingle){saveState();let count=0;
        sprites.forEach(s=>{if(pointInPolygon(s.x+s.w/2,s.y+s.h/2,tagLassoPoints)){
          if(hasMulti){applyMultiTagsToSprite(s);count++;}else{setTag(s,activeTagCatId,activeTag);count++;}
        }});if(count)toast('Tagged '+count+' sprite(s)');else toast('No sprites in lasso area');refreshAll();}
      else {toast('Pick a tag first');}
    }
    tagLassoPoints=[];render();return;
  }
  if(lassoActive){
    lassoActive=false;
    const pos=getEventPos(e),dist=lassoStartPos?Math.hypot(pos.x-lassoStartPos.x,pos.y-lassoStartPos.y):0;
    if(dist<5){const px=screenToPixel(pos.x,pos.y),hit=findSpriteAt(px.px,px.py);selectedSpriteIds.clear();
      if(hit){selectedSpriteIds.add(hit.id);if(!selectMode)toggleSelectMode();else{updateSpriteList();updateSelInfo();render();}toast('Selected '+hit.name);}
      else{if(selectMode){updateSpriteList();updateSelInfo();}render();}
    } else if(lassoPoints.length>2){selectedSpriteIds.clear();const found=[];sprites.forEach(s=>{if(pointInPolygon(s.x+s.w/2,s.y+s.h/2,lassoPoints))found.push(s.id);});
      if(found.length){if(!selectMode)toggleSelectMode();found.forEach(id=>selectedSpriteIds.add(id));updateSpriteList();updateSelInfo();render();toast('Lasso selected '+found.length+' sprite(s)');}
      else{if(selectMode){updateSpriteList();updateSelInfo();}toast('No sprites in lasso area');}
    }
    lassoPoints=[];lassoStartPos=null;render();return;
  }
  if(drawing&&drawStart&&drawCurrent){
    const r=getPixelRect(drawStart,drawCurrent);
    if(r.w>=2&&r.h>=2){
      if(tool==='select'){saveState();sprites.push({id:nextSpriteId++,x:r.x,y:r.y,w:r.w,h:r.h,name:'sprite_'+(sprites.length+1),categoryId:activeCategoryId,subcatId:null,tags:{}});assignSpritesToCategories();refreshAll();toast('Added sprite ('+r.w+'×'+r.h+')');}
      else if(tool==='category'){saveState();const color=catColors[(nextCatId-1)%catColors.length];const nc={id:nextCatId++,name:'Category '+(categories.length+1),color,region:{x:r.x,y:r.y,w:r.w,h:r.h},subcats:[]};categories.push(nc);openCategories.add(nc.id);assignSpritesToCategories();refreshAll();toast('Added category region');}
      else if(tool==='subcategory'){const cx=r.x+r.w/2,cy=r.y+r.h/2;let pc=null;for(const cat of categories){if(!cat.region)continue;const cr=cat.region;if(cx>=cr.x&&cx<cr.x+cr.w&&cy>=cr.y&&cy<cr.y+cr.h){pc=cat;break;}}if(!pc&&activeCategoryId)pc=categories.find(c=>c.id===activeCategoryId);if(!pc){toast('Draw inside a category region');drawing=false;drawStart=null;drawCurrent=null;render();return;}saveState();if(!pc.subcats)pc.subcats=[];const idx=pc.subcats.length;
      let sx=r.x,sy=r.y,sw=r.w,sh=r.h;
      if(pc.region){const pr=pc.region;sx=Math.max(sx,pr.x);sy=Math.max(sy,pr.y);sw=Math.min(sx+sw,pr.x+pr.w)-sx;sh=Math.min(sy+sh,pr.y+pr.h)-sy;if(sw<2||sh<2){toast('Sub-group must fit inside group');drawing=false;drawStart=null;drawCurrent=null;render();return;}}
      pc.subcats.push({id:nextSubcatId++,name:'Sub-group '+(idx+1),color:catColors[(idx+3)%catColors.length],region:{x:sx,y:sy,w:sw,h:sh}});openCategories.add(pc.id);assignSpritesToSubcategories();refreshAll();toast('Added sub-group to '+pc.name);}
    }
    drawing=false;drawStart=null;drawCurrent=null;render();
  }
}
function onWheel(e){if(peMode&&peMode!=='edit-sheet'){e.preventDefault();const pos=getEventPos(e);if(typeof peZoomAt==='function'){peZoomAt(pos.x,pos.y,zoom*(1-e.deltaY*0.003));}else{zoomAt(pos.x,pos.y,zoom*(1-e.deltaY*0.003));peRender();}return;}if(!img)return;e.preventDefault();const pos=getEventPos(e);zoomAt(pos.x,pos.y,zoom*(1-e.deltaY*0.003));render();}
function zoomAt(cx,cy,nz){nz=Math.max(0.1,Math.min(80,nz));const r=nz/zoom;panX=cx-(cx-panX)*r;panY=cy-(cy-panY)*r;zoom=nz;document.getElementById('zoomLevel').textContent=Math.round(zoom*100)+'%';}
function zoomBy(d){const cw=canvasWrap.clientWidth/2,ch=canvasWrap.clientHeight/2;if(peMode&&peMode!=='edit-sheet'&&typeof peZoomAt==='function'){peZoomAt(cw,ch,zoom+d);return;}zoomAt(cw,ch,zoom+d);render();}
function zoomFit(){if(!img)return;const cw=canvasWrap.clientWidth,ch=canvasWrap.clientHeight,m=40;zoom=Math.min((cw-m*2)/imgW,(ch-m*2)/imgH);panX=(cw-imgW*zoom)/2;panY=(ch-imgH*zoom)/2;document.getElementById('zoomLevel').textContent=Math.round(zoom*100)+'%';render();}

document.addEventListener('keydown',e=>{
  if(peMode)return; // Let edit/compose handler deal with it (except edit-sheet which is handled by capture)
  if(e.target.tagName==='INPUT'||e.target.tagName==='SELECT')return;
  if(e.code==='Space'){spaceHeld=true;e.preventDefault();}
  if(e.key==='s')setTool('select');if(e.key==='l')setTool('lasso');if(e.key==='m')setTool('move');if(e.key==='c')setTool('category');if(e.key==='g')setTool('subcategory');if(e.key==='r')setTool('repeat');if(e.key==='e')setTool('erase');if(e.key==='v'||e.key==='h')setTool('pan');if(e.key==='t')setTool('tag');if(e.key==='f')zoomFit();
  if(e.key==='Delete'||e.key==='Backspace')deleteSelected();
  if((e.metaKey||e.ctrlKey)&&e.key==='a'){e.preventDefault();selectAllSprites();}
  if((e.metaKey||e.ctrlKey)&&e.key==='z'&&!e.shiftKey){e.preventDefault();undo();}
  if((e.metaKey||e.ctrlKey)&&(e.key==='y'||(e.key==='z'&&e.shiftKey))){e.preventDefault();redo();}
  if((e.metaKey||e.ctrlKey)&&e.key==='d'){e.preventDefault();duplicateSelected();}
  if(e.key==='Escape'){selectedSpriteIds.clear();if(selectMode)toggleSelectMode();closeTagPopover();refreshAll();}
  if(e.key==='+'||e.key==='=')zoomBy(0.5);if(e.key==='-')zoomBy(-0.5);if(e.key==='Tab'){e.preventDefault();togglePanel();}
});
document.addEventListener('keyup',e=>{if(e.code==='Space')spaceHeld=false;});
window.addEventListener('resize',()=>{if(peMode==='edit-sheet'&&typeof peScheduleStableRender==='function'){peScheduleStableRender(16);}else if(peMode){peRender();}else if(img)render();});

function setTool(t){tool=t;document.querySelectorAll('.tool-btn[data-tool]').forEach(b=>{b.classList.toggle('active',b.dataset.tool===t);b.classList.remove('tt-flash');if(b.dataset.tool===t){void b.offsetWidth;b.classList.add('tt-flash');setTimeout(()=>b.classList.remove('tt-flash'),1300);}});canvasWrap.className='canvas-wrap'+(t==='pan'?' panning':'')+(t==='repeat'?' repeating':'')+(t==='tag'?' tagging':'');canvasWrap.style.cursor=t==='pan'?'grab':(t==='erase'?'pointer':(t==='move'?'move':(t==='tag'?'cell':'crosshair')));const m={select:'Draw boxes around sprites',lasso:'Draw lasso to select sprites',move:'Click to select, drag selected to move',category:'Draw a group region',subcategory:'Draw a sub-group region inside a group',repeat:'Select 2+ sprites, click canvas to repeat',pan:'Click & drag to pan',erase:'Click sprite boxes to remove',tag:'Apply tags to sprites'};setStatus(m[t]||'');updateActiveToolLabel();if(t==='tag')openTagPopover();else closeTagPopover();}

function toggleSelectMode(){selectMode=!selectMode;const btn=document.getElementById('selectModeBtn'),tb=document.getElementById('selectToolbar'),tagBar=document.getElementById('spriteTagBar');if(selectMode){btn.classList.add('active-mode');btn.innerHTML='<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg> Select';tb.style.display='flex';if(tagBar)tagBar.style.display='flex';}else{btn.classList.remove('active-mode');btn.innerHTML='<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;"><rect x="3" y="3" width="18" height="18" rx="2"/></svg> Select';tb.style.display='none';if(tagBar)tagBar.style.display='none';selectedSpriteIds.clear();}updateSpriteList();render();updateSelInfo();}
function updateSelInfo(){
  const el=document.getElementById('selInfo');if(el)el.textContent=selectedSpriteIds.size+' sel';
  const fb=document.getElementById('floatSelBar'),fi=document.getElementById('floatSelInfo');
  if(fb){const show=selectedSpriteIds.size>0&&panelCollapsed;fb.style.display=show?'flex':'none';if(fi)fi.textContent=selectedSpriteIds.size+' sel';}
  updateExportSpriteVisibility();
}
function findSpriteAt(px,py){for(let i=sprites.length-1;i>=0;i--){const s=sprites[i];if(px>=s.x&&px<s.x+s.w&&py>=s.y&&py<s.y+s.h)return s;}return null;}

// ===== TAG FILTER =====
let activeTagFilters={};let tagFilterActive=false;
function toggleTagFilter(){tagFilterActive=!tagFilterActive;const bar=document.getElementById('tagFilterBar'),btn=document.getElementById('filterBtn');bar.style.display=tagFilterActive?'flex':'none';btn.classList.toggle('active-mode',tagFilterActive);if(tagFilterActive)renderTagFilterChips();else{activeTagFilters={};updateSpriteList();}}
function renderTagFilterChips(){
  const container=document.getElementById('tagFilterChips');let h='';
  tagCategories.forEach(tc=>{tc.tags.forEach(tag=>{const isOn=activeTagFilters[tc.id]&&activeTagFilters[tc.id].has(tag);h+='<div class="filter-chip'+(isOn?' on':'')+'" style="background:'+tc.color+'" data-ftcid="'+tc.id+'" data-ftag="'+esc(tag)+'">'+esc(tag)+'</div>';});});
  container.innerHTML=h;
  container.querySelectorAll('.filter-chip').forEach(el=>{el.addEventListener('click',()=>{const tcid=el.dataset.ftcid,tag=el.dataset.ftag;if(!activeTagFilters[tcid])activeTagFilters[tcid]=new Set();if(activeTagFilters[tcid].has(tag)){activeTagFilters[tcid].delete(tag);if(!activeTagFilters[tcid].size)delete activeTagFilters[tcid];}else activeTagFilters[tcid].add(tag);renderTagFilterChips();updateSpriteList();updateFilterSummary();});});
}
function clearTagFilter(){activeTagFilters={};renderTagFilterChips();updateSpriteList();updateFilterSummary();}
function toggleFilterCollapse(){const bar=document.getElementById('tagFilterBar');bar.classList.toggle('collapsed');updateFilterSummary();}
function updateFilterSummary(){const el=document.getElementById('filterActiveSummary');if(!el)return;const count=Object.values(activeTagFilters).reduce((a,s)=>a+s.size,0);el.textContent=count?count+' active':'';}
function spritePassesTagFilter(s){if(!Object.keys(activeTagFilters).length)return true;const tags=getSpriteTags(s);for(const[tcid,vals]of Object.entries(activeTagFilters)){if(!tags[tcid]||!vals.has(tags[tcid]))return false;}return true;}
function toggleViewSpr(){showSprBoxes=!showSprBoxes;document.getElementById('viewSprToggle').classList.toggle('on',showSprBoxes);render();}
function toggleViewCat(){showCatBoxes=!showCatBoxes;document.getElementById('viewCatToggle').classList.toggle('on',showCatBoxes);render();}
function toggleViewSub(){showSubBoxes=!showSubBoxes;document.getElementById('viewSubToggle').classList.toggle('on',showSubBoxes);render();}
function esc(str){return String(str).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');}

// ===== SPRITE LIST =====
function updateSpriteList(){
  const list=document.getElementById('spriteList');
  const countEl=document.getElementById('spriteCount');
  if(countEl)countEl.textContent='('+sprites.length+')';
  if(!list)return;
  const filteredSprites=tagFilterActive?sprites.filter(s=>spritePassesTagFilter(s)):sprites;
  if(!sprites.length){list.innerHTML='<div style="padding:16px;text-align:center;color:var(--text2);font-size:11px;">No sprites yet.<br>Draw boxes on the image.</div>';return;}
  if(tagFilterActive&&!filteredSprites.length&&sprites.length){list.innerHTML='<div style="padding:16px;text-align:center;color:var(--text2);font-size:11px;">No sprites match filter.</div>';return;}
  list.innerHTML=filteredSprites.map(s=>{
    const cat=categories.find(c=>c.id===s.categoryId),sc=cat&&s.subcatId?(cat.subcats||[]).find(x=>x.id===s.subcatId):null;
    const sel=selectedSpriteIds.has(s.id),dc=sc?sc.color:(cat?cat.color:null);
    return '<div class="sprite-item '+(sel?'selected':'')+'" data-sprite-id="'+s.id+'">'
      +(selectMode?'<div class="select-check">'+(sel?'✓':'')+'</div>':'')
      +'<div class="thumb"><canvas data-sid="'+s.id+'" width="32" height="32"></canvas></div>'
      +'<div class="info"><div class="name">'+esc(s.name)+'</div><div class="dims">'+s.x+','+s.y+' '+s.w+'×'+s.h+(cat?' · '+esc(cat.name):'')+(sc?' / '+esc(sc.name):'')+'</div>'+(function(){const tags=getSpriteTags(s);const keys=Object.keys(tags);if(!keys.length)return '';let th='<div class="tag-pills">';keys.forEach(k=>{const tc=tagCategories.find(c=>c.id===k);if(tc)th+='<span class="tag-pill" style="background:'+tc.color+'">'+esc(tags[k])+'</span>';});return th+'</div>';}())+'</div>'
      +(dc?'<div class="cat-dot" style="background:'+dc+'"></div>':'')
      +'<button class="del-btn" data-action="edit" title="Edit pixel art" style="font-size:9px;">✎</button>'
      +'<button class="del-btn" data-action="delete">×</button></div>';
  }).join('');
  filteredSprites.forEach(s=>{const c=list.querySelector('canvas[data-sid="'+s.id+'"]');if(!c)return;const ctx=c.getContext('2d');ctx.imageSmoothingEnabled=false;const sc=Math.min(32/s.w,32/s.h),dw=s.w*sc,dh=s.h*sc;for(let y=0;y<32;y+=4)for(let x=0;x<32;x+=4){ctx.fillStyle=(Math.floor(x/4)+Math.floor(y/4))%2===0?'#2a2a32':'#1a1a20';ctx.fillRect(x,y,4,4);}
    const offX=(32-dw)/2,offY=(32-dh)/2;
    // Render sprite at full resolution with exclude mask applied, then scale to thumbnail
    if(s.excludeMask&&Object.keys(s.excludeMask).length){
      const tc=document.createElement('canvas');tc.width=s.w;tc.height=s.h;
      const tx=tc.getContext('2d');tx.drawImage(img,s.x,s.y,s.w,s.h,0,0,s.w,s.h);
      const id=tx.getImageData(0,0,s.w,s.h);const dd=id.data;
      for(let py=0;py<s.h;py++)for(let px=0;px<s.w;px++){
        const key=(s.x+px)+','+(s.y+py);
        if(s.excludeMask[key]){const i=(py*s.w+px)*4;dd[i+3]=0;}
      }
      tx.putImageData(id,0,0);
      ctx.drawImage(tc,0,0,s.w,s.h,offX,offY,dw,dh);
    } else {
      ctx.drawImage(img,s.x,s.y,s.w,s.h,offX,offY,dw,dh);
    }
  });
  list.onclick=handleSpriteClick;list.ondblclick=handleSpriteDblClick;
}
function handleSpriteClick(e){const item=e.target.closest('.sprite-item');if(!item)return;const id=parseInt(item.dataset.spriteId);if(e.target.closest('[data-action="delete"]')){e.stopPropagation();saveState();removeSprite(id);return;}if(e.target.closest('[data-action="edit"]')){e.stopPropagation();selectedSpriteIds.clear();selectedSpriteIds.add(id);updateSpriteList();render();updateSelInfo();editSelectedSprite();return;}if(selectMode){if(selectedSpriteIds.has(id))selectedSpriteIds.delete(id);else selectedSpriteIds.add(id);}else{if(e.shiftKey||e.ctrlKey||e.metaKey){if(selectedSpriteIds.has(id))selectedSpriteIds.delete(id);else selectedSpriteIds.add(id);}else{if(selectedSpriteIds.has(id)&&selectedSpriteIds.size===1)selectedSpriteIds.clear();else{selectedSpriteIds.clear();selectedSpriteIds.add(id);}}}updateSpriteList();render();updateSelInfo();}
function handleSpriteDblClick(e){const item=e.target.closest('.sprite-item');if(!item)return;renameSprite(parseInt(item.dataset.spriteId));}

function selectAllSprites(){const pool=tagFilterActive?sprites.filter(s=>spritePassesTagFilter(s)):sprites;pool.forEach(s=>selectedSpriteIds.add(s.id));if(!selectMode)toggleSelectMode();else{updateSpriteList();render();updateSelInfo();}}
function deselectAllSprites(){selectedSpriteIds.clear();updateSpriteList();render();updateSelInfo();}
function removeSprite(id){sprites=sprites.filter(s=>s.id!==id);selectedSpriteIds.delete(id);refreshAll();}
function deleteSelected(){if(!selectedSpriteIds.size)return;saveState();const n=selectedSpriteIds.size;sprites=sprites.filter(s=>!selectedSpriteIds.has(s.id));selectedSpriteIds.clear();refreshAll();toast('Deleted '+n+' sprite(s)');}
function renameSprite(id){const s=sprites.find(s=>s.id===id);if(!s)return;const n=prompt('Rename sprite:',s.name);if(n!==null&&n.trim()){saveState();s.name=n.trim();refreshAll();}}
function clearAll(){if(!sprites.length&&!categories.length)return;if(!confirm('Clear all sprites and groups?'))return;saveState();sprites=[];categories=[];selectedSpriteIds.clear();refreshAll();toast('All cleared');}
function duplicateSelected(){if(!selectedSpriteIds.size){toast('Select sprites first');return;}saveState();const sel=sprites.filter(s=>selectedSpriteIds.has(s.id)),newIds=[];sel.forEach(s=>{const ns={id:nextSpriteId++,x:Math.min(s.x+10,imgW-s.w),y:Math.min(s.y+10,imgH-s.h),w:s.w,h:s.h,name:'sprite_'+(sprites.length+newIds.length+1),categoryId:s.categoryId,subcatId:s.subcatId,tags:s.tags?{...s.tags}:{}};sprites.push(ns);newIds.push(ns.id);});selectedSpriteIds.clear();newIds.forEach(id=>selectedSpriteIds.add(id));refreshAll();setTool('move');toast('Duplicated '+sel.length+' — drag to place');}
function bulkRenameSprites(){if(!selectedSpriteIds.size){toast('Select sprites first');return;}document.getElementById('bulkRenameStart').value='1';document.getElementById('bulkRenamePad').checked=false;document.getElementById('bulkRenameModal').style.display='flex';buildRenameVarChips();updateRenamePreview();}
function resolveRenamePattern(pattern,s,idx,start,pad){
  let r=pattern;r=r.replace(/\{n\}/g,String(start+idx).padStart(pad,'0')).replace(/\{name\}/g,s.name||'');
  const cat=categories.find(c=>c.id===s.categoryId),sc=cat&&s.subcatId?(cat.subcats||[]).find(x=>x.id===s.subcatId):null;
  r=r.replace(/\{group\}/g,cat?cat.name:'').replace(/\{subgroup\}/g,sc?sc.name:'').replace(/\{w\}/g,s.w).replace(/\{h\}/g,s.h).replace(/\{x\}/g,s.x).replace(/\{y\}/g,s.y);
  const tags=getSpriteTags(s);tagCategories.forEach(tc=>{const key='{'+tc.name.toLowerCase().replace(/[\s\/]+/g,'_')+'}';r=r.replace(new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'g'),tags[tc.id]||'');});
  return r.replace(/_+/g,'_').replace(/^_|_$/g,'');
}
function buildRenameVarChips(){
  const c=document.getElementById('renameVarChips');const vars=['{n}','{name}','{group}','{subgroup}','{w}','{h}','{x}','{y}'];
  tagCategories.forEach(tc=>{vars.push('{'+tc.name.toLowerCase().replace(/[\s\/]+/g,'_')+'}');});
  c.innerHTML=vars.map(v=>'<span class="var-chip" data-var="'+v+'">'+v+'</span>').join('');
  c.querySelectorAll('.var-chip').forEach(ch=>{ch.addEventListener('click',()=>{const inp=document.getElementById('bulkRenamePattern');const st=inp.selectionStart,en=inp.selectionEnd;inp.value=inp.value.slice(0,st)+ch.dataset.var+inp.value.slice(en);inp.focus();inp.selectionStart=inp.selectionEnd=st+ch.dataset.var.length;updateRenamePreview();});});
  document.getElementById('bulkRenamePattern').oninput=updateRenamePreview;
  document.getElementById('bulkRenameStart').oninput=updateRenamePreview;
  document.getElementById('bulkRenamePad').onchange=updateRenamePreview;
}
function updateRenamePreview(){
  const pattern=document.getElementById('bulkRenamePattern').value||'{name}',start=parseInt(document.getElementById('bulkRenameStart').value)||1;
  const sel=sprites.filter(s=>selectedSpriteIds.has(s.id));
  const pad=document.getElementById('bulkRenamePad').checked?String(start+sel.length-1).length:0;
  const prev=document.getElementById('renamePreview'),mx=Math.min(sel.length,8);
  // Simulate deduplication to show accurate preview
  const nameCount={};const nameOrder={};
  sel.forEach((s,i)=>{const nm=resolveRenamePattern(pattern,s,i,start,pad);nameCount[nm]=(nameCount[nm]||0)+1;});
  // Names that appear more than once need _1, _2 etc
  const usedNames=new Map();
  let h='';for(let i=0;i<mx;i++){const s=sel[i];let nm=resolveRenamePattern(pattern,s,i,start,pad);
    let final=nm;
    if(nameCount[nm]>1){const idx=(usedNames.get(nm)||0)+1;usedNames.set(nm,idx);final=nm+'_'+idx;}
    else{usedNames.set(nm,1);}
    h+='<div><span class="preview-old">'+esc(s.name)+'</span> → <span class="preview-new">'+esc(final)+'</span></div>';}
  if(sel.length>mx)h+='<div style="color:var(--text2);">... +'+(sel.length-mx)+' more</div>';prev.innerHTML=h;
}
function executeBulkRename(){const pattern=document.getElementById('bulkRenamePattern').value||'{name}',start=parseInt(document.getElementById('bulkRenameStart').value)||1;const _selArr=sprites.filter(s=>selectedSpriteIds.has(s.id));const pad=document.getElementById('bulkRenamePad').checked?String(start+_selArr.length-1).length:0;saveState();
  // First pass: compute all names to detect duplicates
  const rawNames=[];_selArr.forEach((s,i)=>{rawNames.push(resolveRenamePattern(pattern,s,i,start,pad));});
  const nameCount={};rawNames.forEach(nm=>{nameCount[nm]=(nameCount[nm]||0)+1;});
  // Second pass: assign final names with _1, _2 for duplicates
  const usedNames=new Map();
  // Also track names from non-selected sprites
  sprites.forEach(s=>{if(!selectedSpriteIds.has(s.id)){usedNames.set(s.name,(usedNames.get(s.name)||0)+1);}});
  let i=0;
  sprites.forEach(s=>{if(selectedSpriteIds.has(s.id)){let nm=rawNames[i];
    if(nameCount[nm]>1){
      // This name has duplicates among selected, add sequential _N
      const idx=(usedNames.get(nm)||0)+1;
      usedNames.set(nm,idx);
      nm=nm+'_'+idx;
    } else if(usedNames.has(nm)){
      // Conflicts with non-selected sprite
      let suf=2;while(usedNames.has(nm+'_'+suf))suf++;nm=nm+'_'+suf;
      usedNames.set(nm,1);
    } else {
      usedNames.set(nm,1);
    }
    s.name=nm;i++;}});
  document.getElementById('bulkRenameModal').style.display='none';refreshAll();toast('Renamed '+selectedSpriteIds.size+' sprite(s)');}
function renameAllInSubcat(catId,subId){const matched=sprites.filter(s=>s.categoryId===catId&&s.subcatId===subId);if(!matched.length){toast('No sprites in this sub-group');return;}selectedSpriteIds.clear();matched.forEach(s=>selectedSpriteIds.add(s.id));if(!selectMode)toggleSelectMode();else{updateSpriteList();updateSelInfo();render();}bulkRenameSprites();}

// ===== REPEAT TOOL — FIXED FOR UP/DOWN + CUSTOM PADDING =====
document.getElementById('repeatCustomPad').addEventListener('change',function(){
  document.getElementById('repeatPadRow').style.display=this.checked?'block':'none';
  updateRepeatPreview();
});
document.getElementById('repeatDir').addEventListener('change',updateRepeatPreview);
document.getElementById('repeatCount').addEventListener('input',updateRepeatPreview);
document.getElementById('repeatPadVal').addEventListener('input',updateRepeatPreview);

function computeRepeatOffsets(){
  const sel=sprites.filter(s=>selectedSpriteIds.has(s.id));
  if(sel.length<2)return{fX:0,fY:0,sel};
  const dir=document.getElementById('repeatDir').value;
  const count=parseInt(document.getElementById('repeatCount').value)||1;
  const useCustomPad=document.getElementById('repeatCustomPad').checked;
  const customPad=parseInt(document.getElementById('repeatPadVal').value)||0;

  const xSorted=[...sel].sort((a,b)=>a.x-b.x);
  const ySorted=[...sel].sort((a,b)=>a.y-b.y);
  const xSpread=(xSorted[xSorted.length-1].x+xSorted[xSorted.length-1].w)-xSorted[0].x;
  const ySpread=(ySorted[ySorted.length-1].y+ySorted[ySorted.length-1].h)-ySorted[0].y;

  let fX=0,fY=0;
  if(dir==='right'||dir==='left'){
    // Compute gap from leftmost two sprites' x edges
    let gap=0;
    if(xSorted.length>=2) gap=xSorted[1].x-(xSorted[0].x+xSorted[0].w);
    if(useCustomPad) gap=customPad;
    const step=xSpread+Math.max(gap,0);
    // For single-column patterns, use first sprite width + gap
    const effectiveStep=xSpread>0?step:(sel[0].w+gap);
    fX=dir==='right'?effectiveStep:-effectiveStep;
  } else {
    // UP/DOWN: compute gap from topmost two sprites' y edges
    let gap=0;
    if(ySorted.length>=2) gap=ySorted[1].y-(ySorted[0].y+ySorted[0].h);
    if(useCustomPad) gap=customPad;
    const step=ySpread+Math.max(gap,0);
    const effectiveStep=ySpread>0?step:(sel[0].h+gap);
    fY=dir==='down'?effectiveStep:-effectiveStep;
  }
  return{fX,fY,sel,count};
}

function updateRepeatPreview(){
  const cv=document.getElementById('repeatPreviewCanvas');
  const ctx=cv.getContext('2d');
  if(!img||selectedSpriteIds.size<2){ctx.clearRect(0,0,cv.width,cv.height);return;}
  const{fX,fY,sel,count}=computeRepeatOffsets();

  // Compute bounds of original + all copies
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for(let i=0;i<=count;i++){
    sel.forEach(s=>{
      const nx=s.x+fX*i,ny=s.y+fY*i;
      minX=Math.min(minX,nx);minY=Math.min(minY,ny);
      maxX=Math.max(maxX,nx+s.w);maxY=Math.max(maxY,ny+s.h);
    });
  }
  const tw=maxX-minX,th=maxY-minY;
  const pw=Math.min(360,tw),ph=Math.min(120,th);
  cv.width=pw;cv.height=ph;
  const scale=Math.min(pw/tw,ph/th,4);
  ctx.clearRect(0,0,pw,ph);
  ctx.imageSmoothingEnabled=false;

  // Draw original sprites
  sel.forEach(s=>{
    const dx=(s.x-minX)*scale,dy=(s.y-minY)*scale;
    ctx.strokeStyle='rgba(255,107,53,0.8)';ctx.lineWidth=1;
    ctx.strokeRect(dx,dy,s.w*scale,s.h*scale);
    ctx.drawImage(img,s.x,s.y,s.w,s.h,dx,dy,s.w*scale,s.h*scale);
  });
  // Draw copies
  for(let i=1;i<=count;i++){
    const alpha=Math.max(0.2,1-i*0.15);
    ctx.globalAlpha=alpha;
    sel.forEach(s=>{
      const nx=s.x+fX*i,ny=s.y+fY*i;
      const dx=(nx-minX)*scale,dy=(ny-minY)*scale;
      ctx.strokeStyle='rgba(255,159,28,0.6)';ctx.lineWidth=1;ctx.setLineDash([2,2]);
      ctx.strokeRect(dx,dy,s.w*scale,s.h*scale);ctx.setLineDash([]);
      ctx.drawImage(img,s.x,s.y,s.w,s.h,dx,dy,s.w*scale,s.h*scale);
    });
  }
  ctx.globalAlpha=1;
}

function runRepeat(){
  const sel=sprites.filter(s=>selectedSpriteIds.has(s.id));
  if(sel.length<2){toast('Need 2+ selected sprites');return;}
  const{fX,fY,count}=computeRepeatOffsets();
  saveState();const nS=[];
  for(let i=1;i<=count;i++)sel.forEach(s=>{
    const nx=s.x+fX*i,ny=s.y+fY*i;
    if(nx>=0&&ny>=0&&nx+s.w<=imgW&&ny+s.h<=imgH)nS.push({id:nextSpriteId++,x:nx,y:ny,w:s.w,h:s.h,name:'sprite_'+(sprites.length+nS.length+1),categoryId:s.categoryId,subcatId:s.subcatId,tags:{}});
  });
  sprites.push(...nS);assignSpritesToCategories();refreshAll();
  document.getElementById('repeatModal').style.display='none';
  toast('Created '+nS.length+' sprites via repeat');
}

// ===== CATEGORIES =====
function addCategory(){saveState();const color=catColors[(nextCatId-1)%catColors.length],nc={id:nextCatId++,name:'Category '+(categories.length+1),color,region:null,subcats:[]};categories.push(nc);activeCategoryId=nc.id;openCategories.add(nc.id);refreshAll();toast('Created category');}
function addSubcatToActive(){const cat=categories.find(c=>c.id===activeCategoryId);if(!cat){toast('Select a category first');return;}saveState();if(!cat.subcats)cat.subcats=[];const idx=cat.subcats.length;cat.subcats.push({id:nextSubcatId++,name:'Sub-group '+(idx+1),color:catColors[(idx+3)%catColors.length],region:null});openCategories.add(cat.id);refreshAll();toast('Added sub-group');}

function updateCategoryList(){
  const list=document.getElementById('categoryList');
  const countEl=document.getElementById('catTabCount');
  if(countEl)countEl.textContent='('+categories.length+')';
  if(!list)return;
  if(!categories.length){list.innerHTML='<div style="padding:16px;text-align:center;color:var(--text2);font-size:11px;">No groups yet.</div>';return;}
  let html='';
  categories.forEach(cat=>{const count=sprites.filter(s=>s.categoryId===cat.id).length,active=activeCategoryId===cat.id,isOpen=openCategories.has(cat.id);
    html+='<div class="cat-folder" data-cat-id="'+cat.id+'"><div class="cat-folder-header '+(active?'active':'')+' '+(isOpen?'open':'')+'" data-cat-id="'+cat.id+'"><div class="folder-icon">▸</div><div class="color-swatch" style="background:'+cat.color+'"></div><div class="cat-name"><input value="'+esc(cat.name)+'" data-cat-rename="'+cat.id+'" onclick="event.stopPropagation()"></div><div class="cat-count">'+count+'</div><button class="del-btn" data-action="del-cat" data-cat-id="'+cat.id+'">×</button></div><div class="cat-folder-children '+(isOpen?'':'collapsed')+'" data-cat-children="'+cat.id+'">';
    if(cat.subcats&&cat.subcats.length)cat.subcats.forEach(sc=>{const scount=sprites.filter(s=>s.categoryId===cat.id&&s.subcatId===sc.id).length;
      const hasBolt=animSubcatIds.has(sc.id);
      html+='<div class="subcat-folder" draggable="true" data-drag-cat="'+cat.id+'" data-drag-sub="'+sc.id+'"><div class="subcat-folder-header" data-cat-id="'+cat.id+'" data-sub-id="'+sc.id+'" style="'+(activeSubcatId===sc.id?'border-color:'+sc.color+';background:'+sc.color+'15;':'')+'"><div class="sub-dot" style="background:'+sc.color+'"></div><div class="sub-name"><input value="'+esc(sc.name)+'" data-sub-rename="'+cat.id+'-'+sc.id+'" onclick="event.stopPropagation()"></div>'+(hasBolt?'<span class="bolt-icon"><svg width="10" height="10" viewBox="0 0 24 24" fill="#fbbf24" stroke="none"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg></span>':'')+'<div class="sub-count">'+scount+'</div><div class="sub-actions"><button class="rename-all-btn" data-action="rename-all-sub" data-cat-id="'+cat.id+'" data-sub-id="'+sc.id+'" title="Rename all sprites">Aa</button><button class="del-btn" data-action="del-sub" data-cat-id="'+cat.id+'" data-sub-id="'+sc.id+'">×</button></div></div></div>';});
    html+='</div></div>';});
  list.innerHTML=html;attachCategoryEvents(list);
}

function attachCategoryEvents(list){
  list.querySelectorAll('.cat-folder-header').forEach(el=>{el.addEventListener('click',e=>{if(e.target.tagName==='INPUT'||e.target.closest('[data-action]'))return;const catId=parseInt(el.dataset.catId);if(openCategories.has(catId))openCategories.delete(catId);else openCategories.add(catId);selectCategory(catId);});});
  list.querySelectorAll('[data-cat-rename]').forEach(inp=>{const catId=parseInt(inp.dataset.catRename);inp.addEventListener('focus',()=>{inp._orig=inp.value;});inp.addEventListener('blur',()=>{const cat=categories.find(c=>c.id===catId);if(cat&&inp.value.trim()&&inp.value.trim()!==inp._orig){saveState();cat.name=inp.value.trim();render();}});inp.addEventListener('keydown',e=>{if(e.key==='Enter')inp.blur();if(e.key==='Escape'){inp.value=inp._orig||'';inp.blur();}});});
  list.querySelectorAll('[data-sub-rename]').forEach(inp=>{const[catId,subId]=inp.dataset.subRename.split('-').map(Number);inp.addEventListener('focus',()=>{inp._orig=inp.value;});inp.addEventListener('blur',()=>{const cat=categories.find(c=>c.id===catId),sc=cat?(cat.subcats||[]).find(s=>s.id===subId):null;if(sc&&inp.value.trim()&&inp.value.trim()!==inp._orig){saveState();sc.name=inp.value.trim();const matched=sprites.filter(s=>s.categoryId===catId&&s.subcatId===subId);const base=sc.name.toLowerCase().replace(/\s+/g,'_');matched.forEach((s,i)=>{s.name=base+'_'+(i+1);});render();updateSpriteList();}});inp.addEventListener('keydown',e=>{if(e.key==='Enter')inp.blur();if(e.key==='Escape'){inp.value=inp._orig||'';inp.blur();}});});
  list.querySelectorAll('[data-action="del-cat"]').forEach(btn=>{btn.addEventListener('click',e=>{e.stopPropagation();saveState();removeCat(parseInt(btn.dataset.catId));});});
  list.querySelectorAll('[data-action="del-sub"]').forEach(btn=>{btn.addEventListener('click',e=>{e.stopPropagation();saveState();removeSubcat(parseInt(btn.dataset.catId),parseInt(btn.dataset.subId));});});
  list.querySelectorAll('[data-action="rename-all-sub"]').forEach(btn=>{btn.addEventListener('click',e=>{e.stopPropagation();renameAllInSubcat(parseInt(btn.dataset.catId),parseInt(btn.dataset.subId));});});
  list.querySelectorAll('.subcat-folder-header').forEach(el=>{el.addEventListener('click',e=>{if(e.target.tagName==='INPUT'||e.target.closest('[data-action]'))return;const catId=parseInt(el.dataset.catId),subId=parseInt(el.dataset.subId);if(activeSubcatId===subId){activeSubcatId=null;}else{activeSubcatId=subId;activeCategoryId=catId;}if(selectedSpriteIds.size)assignSelectedToSubcat(catId,subId);updateCategoryList();render();});});
  list.querySelectorAll('.subcat-folder[draggable]').forEach(el=>{el.addEventListener('dragstart',e=>{dragSubcat={catId:parseInt(el.dataset.dragCat),subId:parseInt(el.dataset.dragSub)};e.dataTransfer.effectAllowed='move';el.style.opacity='0.5';});el.addEventListener('dragend',()=>{el.style.opacity='1';dragSubcat=null;list.querySelectorAll('.drag-over').forEach(x=>x.classList.remove('drag-over'));});});
  list.querySelectorAll('.cat-folder-children').forEach(el=>{el.addEventListener('dragover',e=>{if(!dragSubcat)return;e.preventDefault();e.dataTransfer.dropEffect='move';});el.addEventListener('drop',e=>{e.preventDefault();if(!dragSubcat)return;moveSubcatToCategory(dragSubcat.catId,dragSubcat.subId,parseInt(el.dataset.catChildren));dragSubcat=null;});});
  list.querySelectorAll('.subcat-folder-header').forEach(el=>{el.addEventListener('dragover',e=>{if(!dragSubcat)return;e.preventDefault();el.classList.add('drag-over');});el.addEventListener('dragleave',()=>{el.classList.remove('drag-over');});el.addEventListener('drop',e=>{e.preventDefault();el.classList.remove('drag-over');if(!dragSubcat)return;moveSubcatToCategory(dragSubcat.catId,dragSubcat.subId,parseInt(el.dataset.catId),parseInt(el.dataset.subId));dragSubcat=null;});});
}
function moveSubcatToCategory(fromCatId,subId,toCatId,beforeSubId){if(fromCatId===toCatId&&!beforeSubId)return;const fromCat=categories.find(c=>c.id===fromCatId),toCat=categories.find(c=>c.id===toCatId);if(!fromCat||!toCat)return;const subIdx=(fromCat.subcats||[]).findIndex(s=>s.id===subId);if(subIdx===-1)return;saveState();const[sub]=fromCat.subcats.splice(subIdx,1);if(!toCat.subcats)toCat.subcats=[];if(beforeSubId){const idx=toCat.subcats.findIndex(s=>s.id===beforeSubId);if(idx!==-1)toCat.subcats.splice(idx,0,sub);else toCat.subcats.push(sub);}else toCat.subcats.push(sub);sprites.forEach(s=>{if(s.subcatId===subId)s.categoryId=toCatId;});openCategories.add(toCatId);refreshAll();toast('Moved sub-group');}
function selectCategory(id){if(activeCategoryId===id){activeCategoryId=null;activeSubcatId=null;}else{activeCategoryId=id;activeSubcatId=null;}updateCategoryList();render();}
function removeCat(id){categories=categories.filter(c=>c.id!==id);sprites.forEach(s=>{if(s.categoryId===id){s.categoryId=null;s.subcatId=null;}});if(activeCategoryId===id)activeCategoryId=null;openCategories.delete(id);refreshAll();}
function removeSubcat(catId,subId){const c=categories.find(c=>c.id===catId);if(c)c.subcats=c.subcats.filter(s=>s.id!==subId);sprites.forEach(s=>{if(s.subcatId===subId)s.subcatId=null;});animSubcatIds.delete(subId);refreshAll();}
function assignSelectedToSubcat(catId,subId){if(!selectedSpriteIds.size)return;saveState();sprites.forEach(s=>{if(selectedSpriteIds.has(s.id)){s.categoryId=catId;s.subcatId=subId;}});refreshAll();toast('Assigned sprites to sub-group');}
function assignSpritesToCategories(){sprites.forEach(s=>{if(s.categoryId)return;const cx=s.x+s.w/2,cy=s.y+s.h/2;for(const cat of categories){if(!cat.region)continue;const r=cat.region;if(cx>=r.x&&cx<r.x+r.w&&cy>=r.y&&cy<r.y+r.h){s.categoryId=cat.id;if(cat.subcats)for(const sc of cat.subcats){if(!sc.region)continue;const sr=sc.region;if(cx>=sr.x&&cx<sr.x+sr.w&&cy>=sr.y&&cy<sr.y+sr.h){s.subcatId=sc.id;break;}}break;}}});}
function assignSpritesToSubcategories(){sprites.forEach(s=>{if(s.subcatId)return;const cx=s.x+s.w/2,cy=s.y+s.h/2;for(const cat of categories){if(!cat.subcats)continue;for(const sc of cat.subcats){if(!sc.region)continue;const sr=sc.region;if(cx>=sr.x&&cx<sr.x+sr.w&&cy>=sr.y&&cy<sr.y+sr.h){s.categoryId=cat.id;s.subcatId=sc.id;break;}}}});}

function switchTab(tab){document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active',t.dataset.tab===tab));document.getElementById('spritesTab').style.display=tab==='sprites'?'flex':'none';document.getElementById('categoriesTab').style.display=tab==='categories'?'flex':'none';document.getElementById('animateTab').style.display=tab==='animate'?'flex':'none';if(tab==='animate'){resetAnimPanel();updateAnimSubcatSelect();}if(tab!=='animate'){stopAnimPlay();} if(tab==='sprites'&&selectMode&&!selectedSpriteIds.size)toggleSelectMode();}
function togglePanel(){panelCollapsed=!panelCollapsed;const p=document.getElementById('panel');if(panelCollapsed)p.classList.add('collapsed');else{p.classList.remove('collapsed');if(selectMode&&!selectedSpriteIds.size)toggleSelectMode();}updateSelInfo();setTimeout(()=>{if(img)render();},220);}
function runAutoDetect(){
  saveState();sprites=[];selectedSpriteIds.clear();nextSpriteId=1;
  const tc=document.createElement('canvas');tc.width=imgW;tc.height=imgH;
  const tx=tc.getContext('2d');tx.drawImage(img,0,0);
  const d=tx.getImageData(0,0,imgW,imgH).data;
  let hasAlpha=false,bgColor=null;
  const cornerPixels=[[0,0],[imgW-1,0],[0,imgH-1],[imgW-1,imgH-1]];
  const cornerColors=cornerPixels.map(([x,y])=>{const i=(y*imgW+x)*4;return{r:d[i],g:d[i+1],b:d[i+2],a:d[i+3]};});
  const alphaCorners=cornerColors.filter(c=>c.a<20);
  if(alphaCorners.length>=2) hasAlpha=true;
  else bgColor=cornerColors[0];
  const op=new Uint8Array(imgW*imgH);
  for(let i=0;i<imgW*imgH;i++){if(hasAlpha){op[i]=d[i*4+3]>10?1:0;}else{const r=d[i*4],g=d[i*4+1],b=d[i*4+2];op[i]=(Math.abs(r-bgColor.r)+Math.abs(g-bgColor.g)+Math.abs(b-bgColor.b))>30?1:0;}}
  const lb=new Int32Array(imgW*imgH);let lc=0;const bounds=[];
  function flood(sx,sy,l){const st=[[sx,sy]];let nX=sx,xX=sx,nY=sy,xY=sy;while(st.length){const[x,y]=st.pop();const i=y*imgW+x;if(x<0||x>=imgW||y<0||y>=imgH)continue;if(lb[i]||!op[i])continue;lb[i]=l;if(x<nX)nX=x;if(x>xX)xX=x;if(y<nY)nY=y;if(y>xY)xY=y;st.push([x-1,y],[x+1,y],[x,y-1],[x,y+1]);}return{minX:nX,minY:nY,maxX:xX,maxY:xY};}
  for(let y=0;y<imgH;y++)for(let x=0;x<imgW;x++){const i=y*imgW+x;if(op[i]&&!lb[i]){lc++;bounds.push(flood(x,y,lc));}}
  const maxArea=imgW*imgH*0.8;let added=0;
  bounds.forEach(b=>{const x=b.minX,y=b.minY,w=b.maxX-b.minX+1,h=b.maxY-b.minY+1;if(w>=4&&h>=4&&w*h<maxArea){sprites.push({id:nextSpriteId++,x,y,w,h,name:'sprite_'+(sprites.length+1),categoryId:null,subcatId:null,tags:{}});added++;}});
  assignSpritesToCategories();refreshAll();toast('Detected '+added+' sprites');
}

// ===== EXPORT =====
function buildManifest(){
  const sh=sheets.find(s=>s.id===activeSheetId);
  return{project:projectName,sheet:sh?sh.name:'sprites',source:{width:imgW,height:imgH},sprites:sprites.map(s=>{const c=categories.find(x=>x.id===s.categoryId),sc=c&&s.subcatId?(c.subcats||[]).find(x=>x.id===s.subcatId):null;return{name:s.name,x:s.x,y:s.y,w:s.w,h:s.h,category:c?.name||null,subcategory:sc?.name||null,tags:getSpriteTags(s)};}),categories:categories.map(c=>({name:c.name,color:c.color,region:c.region,subcategories:(c.subcats||[]).map(sc=>({name:sc.name,color:sc.color,region:sc.region||null}))})),tagCategories:tagCategories.map(tc=>({name:tc.name,color:tc.color,tags:tc.tags})),animations:[...animSubcatIds].map(scId=>{let scName='';categories.forEach(c=>{(c.subcats||[]).forEach(sc=>{if(sc.id===scId)scName=sc.name;});});const cfg=animConfigs[scId]||{};const baseNames=(cfg.baseLayers||[]).map(bl=>{const s=sprites.find(sp=>sp.id===bl.spriteId);return s?s.name:null;}).filter(Boolean);return{subcategory:scName,delay:cfg.delay||100,anchor:cfg.anchor||'bottom',baseLayers:baseNames,baseOnTop:cfg.baseLayers&&cfg.baseLayers.length>0?cfg.baseLayers[0].onTop:false};})};
}

async function exportSheetZip(sheetId){
  saveSheetState();
  const sh=sheets.find(s=>s.id===sheetId);if(!sh)return null;
  const wasActive=activeSheetId;
  loadSheetState(sheetId);
  const JSZipLib=getJSZipOrToast();if(!JSZipLib)return;
  const zip=new JSZipLib();
  const tc=document.createElement('canvas'),tx=tc.getContext('2d');
  function add(f,s){tc.width=s.w;tc.height=s.h;tx.clearRect(0,0,s.w,s.h);tx.drawImage(img,s.x,s.y,s.w,s.h,0,0,s.w,s.h);
    // Apply exclusion mask if present
    if(s.excludeMask&&Object.keys(s.excludeMask).length){
      const id=tx.getImageData(0,0,s.w,s.h);const dd=id.data;
      for(let py=0;py<s.h;py++)for(let px=0;px<s.w;px++){
        const key=(s.x+px)+','+(s.y+py);
        if(s.excludeMask[key]){const i=(py*s.w+px)*4;dd[i+3]=0;}
      }
      tx.putImageData(id,0,0);
    }
    f.file(s.name.replace(/[^a-zA-Z0-9_-]/g,'_')+'.png',tc.toDataURL('image/png').split(',')[1],{base64:true});}
  const ug=sprites.filter(s=>!s.categoryId),gr={};
  sprites.forEach(s=>{if(s.categoryId){const cat=categories.find(c=>c.id===s.categoryId);let fp=cat?cat.name.replace(/[^a-zA-Z0-9_-]/g,'_'):'cat_'+s.categoryId;if(s.subcatId&&cat){const sc=(cat.subcats||[]).find(x=>x.id===s.subcatId);if(sc)fp+='/'+sc.name.replace(/[^a-zA-Z0-9_-]/g,'_');}if(!gr[fp])gr[fp]=[];gr[fp].push(s);}});
  ug.forEach(s=>add(zip,s));
  Object.entries(gr).forEach(([p,sp])=>{const f=zip.folder(p);sp.forEach(s=>add(f,s));});
  {const shName=(sh?sh.name:'sheet').replace(/[^a-zA-Z0-9_-]/g,'_');if(originalFileData){const ext=(originalFileName||'sheet.png').split('.').pop()||'png';zip.file(shName+'.'+ext,originalFileData.split(',')[1],{base64:true});}else if(img&&img.width&&img.height){const fc=document.createElement('canvas');fc.width=img.width;fc.height=img.height;fc.getContext('2d').drawImage(img,0,0);zip.file(shName+'.png',fc.toDataURL('image/png').split(',')[1],{base64:true});}}

  // Export animation frames as PNGs + GIF using inline encoder
  for(const scId of animSubcatIds){
    let scName='',catName='';
    categories.forEach(c=>{(c.subcats||[]).forEach(sc=>{if(sc.id===scId){scName=sc.name;catName=c.name;}});});
    const frames=sprites.filter(s=>s.subcatId===scId).sort((a,b)=>a.x===b.x?a.y-b.y:a.x-b.x);
    if(frames.length){
      const folderName=(catName?catName.replace(/[^a-zA-Z0-9_-]/g,'_')+'/':'')+'animations/'+scName.replace(/[^a-zA-Z0-9_-]/g,'_');
      const gifFolder=zip.folder(folderName);
      frames.forEach((s,i)=>{
        tc.width=s.w;tc.height=s.h;tx.clearRect(0,0,s.w,s.h);tx.drawImage(img,s.x,s.y,s.w,s.h,0,0,s.w,s.h);
        gifFolder.file('frame_'+(i+1)+'.png',tc.toDataURL('image/png').split(',')[1],{base64:true});
      });
      try{
        const gifBlob=await exportAnimGif(scId);
        if(gifBlob){const gifData=await gifBlob.arrayBuffer();gifFolder.file(scName.replace(/[^a-zA-Z0-9_-]/g,'_')+'.gif',gifData);}
      }catch(e){console.warn('GIF generation skipped',e);}
    }
  }

  zip.file('manifest.json',JSON.stringify(buildManifest(),null,2));
  if(wasActive!==sheetId)loadSheetState(wasActive);
  return zip;
}

async function exportCurrentTab(){
  if(!sprites.length){toast('No sprites to export');return;}
  try{
  setStatus('Exporting current tab...');
  const zip=await exportSheetZip(activeSheetId);
  if(!zip){toast('Export failed');return;}
  const sh=sheets.find(s=>s.id===activeSheetId);
  const blob=await zip.generateAsync({type:'blob'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);
  a.download=(sh?sh.name:'sprites').replace(/[^a-zA-Z0-9_-]/g,'_')+'.zip';a.click();
  setStatus('Exported');toast('ZIP downloaded!');
  }catch(err){setStatus('Export error');toast('Export error: '+err.message);console.error(err);}
}

async function exportProject(){
  if(!sheets.length){toast('No sheets to export');return;}
  try{
  setStatus('Exporting project...');
  saveSheetState();
  const JSZipLib=getJSZipOrToast();if(!JSZipLib)return;
  const zip=new JSZipLib();
  for(const sh of sheets){
    const sheetZip=await exportSheetZip(sh.id);
    if(!sheetZip)continue;
    const sheetFolder=zip.folder(sh.name.replace(/[^a-zA-Z0-9_-]/g,'_'));
    const sheetFiles=sheetZip.files;
    for(const[path,file] of Object.entries(sheetFiles)){
      if(!file.dir){const content=await file.async('uint8array');sheetFolder.file(path,content);}
    }
  }
  // Project manifest
  zip.file('project.json',JSON.stringify({projectName,sheets:sheets.map(sh=>sh.name)},null,2));
  const blob=await zip.generateAsync({type:'blob'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);
  a.download=projectName.replace(/[^a-zA-Z0-9_-]/g,'_')+'.zip';a.click();
  setStatus('Project exported');toast('Project ZIP downloaded!');
  }catch(err){setStatus('Export error');toast('Export error: '+err.message);console.error(err);}
}

function exportJSON(){
  if(!sprites.length){toast('No sprites to export');return;}
  const sh=sheets.find(s=>s.id===activeSheetId);
  const b=new Blob([JSON.stringify(buildManifest(),null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(b);
  a.download=(sh?sh.name:'sprites').replace(/[^a-zA-Z0-9_-]/g,'_')+'.json';a.click();
  toast('JSON downloaded');
}

function importJSON(file){const r=new FileReader();r.onload=e=>{try{const d=JSON.parse(e.target.result);if(!d.sprites||!Array.isArray(d.sprites)){toast('Invalid JSON');return;}saveState();if(d.categories&&Array.isArray(d.categories)){categories=d.categories.map((c,i)=>({id:nextCatId++,name:c.name||'Category '+(i+1),color:c.color||catColors[i%catColors.length],region:c.region||null,subcats:(c.subcategories||[]).map((sc,j)=>({id:nextSubcatId++,name:sc.name||'Sub '+(j+1),color:sc.color||catColors[(j+3)%catColors.length],region:sc.region||null}))}));}
    if(d.tagCategories&&Array.isArray(d.tagCategories)){tagCategories=d.tagCategories.map((tc,i)=>({id:'tc_'+(nextTagCatId++),name:tc.name,color:tc.color||catColors[i%catColors.length],tags:tc.tags||[]}));}
    const catMap={};categories.forEach(c=>{catMap[c.name]=c;openCategories.add(c.id);});
    d.sprites.forEach(s=>{const cat=s.category?catMap[s.category]:null;let subId=null;if(cat&&s.subcategory){const sc=cat.subcats.find(x=>x.name===s.subcategory);if(sc)subId=sc.id;}
    let importedTags={};if(s.tags&&typeof s.tags==='object'){for(const[oldKey,val]of Object.entries(s.tags)){const matchedTc=tagCategories.find(tc=>tc.id===oldKey)||tagCategories.find(tc=>tc.tags.includes(val));if(matchedTc)importedTags[matchedTc.id]=val;}}
    sprites.push({id:nextSpriteId++,x:s.x,y:s.y,w:s.w,h:s.h,name:s.name||'sprite_'+(sprites.length+1),categoryId:cat?cat.id:null,subcatId:subId,tags:importedTags});});
    updateSpriteTagSelects();refreshAll();toast('Imported '+d.sprites.length+' sprites');}catch(err){toast('JSON parse error: '+err.message);}};r.readAsText(file);}

// ===== GAMEMAKER .YY SPRITE IMPORT =====
// Supports two workflows:
//   1. Sheet already loaded → parse .yy and map frame regions onto current sheet
//   2. No sheet loaded → stitch individual frame PNGs into a sheet, then import
function importYY(file){
  const r=new FileReader();
  r.onload=e=>{
    let yy;
    try{yy=JSON.parse(e.target.result);}
    catch(err){toast('Invalid .yy file (JSON parse error)');return;}

    // Validate it's a GMS2 sprite resource
    const resourceType=yy.resourceType||yy.modelName||'';
    if(!resourceType.toLowerCase().includes('sprite')&&!yy.frames&&!yy.sequence){
      toast('This .yy file does not appear to be a sprite resource');return;
    }

    // Extract sprite name
    const spriteName=yy.name||(file.name.replace(/\.yy$/i,''))||'sprite';

    // Extract frame list — GMS2 stores them in yy.frames[]
    // Each frame has a name (GUID) which corresponds to a PNG file
    const frames=yy.frames||[];
    if(!frames.length){toast('No frames found in .yy file');return;}

    // Determine frame order from sequence if available
    // sequence.tracks[0].keyframes.Keyframes[].Key is the frame index (0-based)
    let orderedFrames=[...frames];
    try{
      const kfs=yy.sequence&&yy.sequence.tracks&&yy.sequence.tracks[0]&&
                yy.sequence.tracks[0].keyframes&&yy.sequence.tracks[0].keyframes.Keyframes;
      if(kfs&&kfs.length===frames.length){
        const order=kfs.map(k=>({key:k.Key,id:(k.Channels&&k.Channels['0']&&k.Channels['0'].Id&&k.Channels['0'].Id.name)||null}));
        order.sort((a,b)=>a.key-b.key);
        orderedFrames=order.map(o=>frames.find(f=>f.name===o.id)||frames[o.key]||frames[0]);
      }
    }catch(_){}

    // Sprite dimensions
    const fw=yy.width||64;
    const fh=yy.height||64;

    // If a sheet is already loaded: map frames as sprite regions
    // Assume frames are arranged left-to-right matching their order in the sheet
    if(img&&imgW&&imgH){
      _applyYYFramesToSheet(spriteName,orderedFrames,fw,fh,yy);
      return;
    }

    // No sheet loaded: ask user to provide the PNG frame files
    _showYYFramePickerModal(spriteName,orderedFrames,fw,fh,yy);
  };
  r.readAsText(file);
}

function _applyYYFramesToSheet(spriteName,frames,fw,fh,yy){
  // Map each frame to a region on the current sheet by scanning left→right, top→bottom
  // matching frame dimensions. If exact positions found, use them; otherwise lay them
  // out assuming a standard horizontal strip.
  saveState();
  let added=0;
  const cols=Math.floor(imgW/fw);
  frames.forEach((fr,i)=>{
    const col=i%cols, row=Math.floor(i/cols);
    const x=col*fw, y=row*fh;
    if(x+fw<=imgW&&y+fh<=imgH){
      const frameName=fr.name||(spriteName+'_'+i);
      sprites.push({id:nextSpriteId++,x,y,w:fw,h:fh,
        name:spriteName+'_'+i,
        categoryId:null,subcatId:null,tags:{}});
      added++;
    }
  });
  assignSpritesToCategories();
  refreshAll();
  toast('Imported '+added+' frame'+(added!==1?'s':'')+' from .yy ('+fw+'×'+fh+' each)');
}

function _showYYFramePickerModal(spriteName,frames,fw,fh,yy){
  // Build a modal asking user to supply the PNG files for each frame
  const frameGuids=frames.map(f=>f.name||'').filter(Boolean);

  const modal=document.createElement('div');
  modal.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;z-index:9999;';
  modal.innerHTML=`
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:22px 26px;max-width:480px;width:90%;font-family:var(--font-mono);color:var(--text);">
      <div style="font-size:13px;font-weight:700;margin-bottom:6px;">Import GameMaker Sprite</div>
      <div style="font-size:11px;color:var(--text2);margin-bottom:14px;">
        <b>${escHtml(spriteName)}</b> — ${frames.length} frame${frames.length!==1?'s':''} @ ${fw}×${fh}px<br>
        Select the PNG frame files from this sprite's folder. They'll be stitched into a horizontal sheet.
      </div>
      <div style="margin-bottom:14px;">
        <label style="font-size:10px;color:var(--text2);display:block;margin-bottom:4px;">Frame PNGs (select all from the sprite folder)</label>
        <input type="file" id="yyFramePngs" accept="image/png,image/*" multiple
          style="font-size:11px;color:var(--text);background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius);padding:5px 8px;width:100%;box-sizing:border-box;">
      </div>
      <div id="yyFrameStatus" style="font-size:10px;color:var(--text2);margin-bottom:12px;min-height:16px;"></div>
      <div style="display:flex;gap:8px;justify-content:flex-end;">
        <button id="yyFrameCancel" style="padding:5px 14px;background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);font-family:var(--font-mono);font-size:11px;cursor:pointer;">Cancel</button>
        <button id="yyFrameOk" style="padding:5px 14px;background:var(--accent);border:none;border-radius:var(--radius);color:#fff;font-family:var(--font-mono);font-size:11px;cursor:pointer;">Build Sheet</button>
      </div>
    </div>`;
  document.body.appendChild(modal);

  const statusEl=modal.querySelector('#yyFrameStatus');
  const pngInput=modal.querySelector('#yyFramePngs');

  pngInput.addEventListener('change',()=>{
    const n=pngInput.files.length;
    const matched=_matchYYFrameFiles(frames,pngInput.files);
    statusEl.textContent=n+' file'+(n!==1?'s':'')+' selected — '+matched.matched+' matched to frame order'+(matched.unmatched?' ('+matched.unmatched+' unmatched, will be appended)':'');
    statusEl.style.color=matched.matched>0?'var(--accent)':'var(--text2)';
  });

  modal.querySelector('#yyFrameCancel').addEventListener('click',()=>modal.remove());
  modal.querySelector('#yyFrameOk').addEventListener('click',async()=>{
    const files=pngInput.files;
    if(!files.length){toast('Select at least one PNG file');return;}
    modal.querySelector('#yyFrameOk').textContent='Building…';
    modal.querySelector('#yyFrameOk').disabled=true;
    try{
      await _buildSheetFromYYFrames(spriteName,frames,fw,fh,files);
      modal.remove();
    }catch(err){
      toast('Error building sheet: '+err.message);
      modal.querySelector('#yyFrameOk').textContent='Build Sheet';
      modal.querySelector('#yyFrameOk').disabled=false;
    }
  });
}

function _matchYYFrameFiles(frames,fileList){
  // Try to match files by GUID name
  const fileArr=[...fileList];
  const guidSet=new Set(frames.map(f=>(f.name||'').toLowerCase()));
  let matched=0,unmatched=0;
  fileArr.forEach(f=>{
    const base=f.name.replace(/\.[^.]+$/,'').toLowerCase();
    if(guidSet.has(base))matched++;else unmatched++;
  });
  return{matched,unmatched};
}

async function _buildSheetFromYYFrames(spriteName,frames,fw,fh,fileList){
  // Load all provided PNGs as images
  const fileArr=[...fileList];

  // Build a map: guid (lowercase) → Image
  const imgMap={};
  await Promise.all(fileArr.map(f=>new Promise((res,rej)=>{
    const reader=new FileReader();
    reader.onload=ev=>{
      const im=new Image();
      im.onload=()=>{imgMap[f.name.replace(/\.[^.]+$/,'').toLowerCase()]=im;res();};
      im.onerror=rej;
      im.src=ev.target.result;
    };
    reader.onerror=rej;
    reader.readAsDataURL(f);
  })));

  // Order images by frame sequence; fall back to alphabetical for unmatched
  const ordered=frames.map(fr=>{
    const key=(fr.name||'').toLowerCase();
    return imgMap[key]||null;
  }).filter(Boolean);

  // Append any unmatched images in file order
  const matchedKeys=new Set(frames.map(fr=>(fr.name||'').toLowerCase()));
  fileArr.forEach(f=>{
    const key=f.name.replace(/\.[^.]+$/,'').toLowerCase();
    if(!matchedKeys.has(key)&&imgMap[key])ordered.push(imgMap[key]);
  });

  if(!ordered.length){toast('No usable PNG frames found');return;}

  // Stitch into a horizontal sheet canvas
  const sheetW=fw*ordered.length, sheetH=fh;
  const sc=document.createElement('canvas');
  sc.width=sheetW; sc.height=sheetH;
  const sctx=sc.getContext('2d');
  ordered.forEach((im,i)=>{
    sctx.drawImage(im,0,0,im.width,im.height, i*fw,0,fw,fh);
  });

  // Convert to blob and create a File, then load as a sheet
  await new Promise(res=>{
    sc.toBlob(async blob=>{
      const sheetFile=new File([blob],spriteName+'.png',{type:'image/png'});
      await addSheetAsync(sheetFile);
      // Now add sprite regions for each frame
      frames.slice(0,ordered.length).forEach((_,i)=>{
        sprites.push({id:nextSpriteId++,x:i*fw,y:0,w:fw,h:fh,
          name:spriteName+'_'+i,categoryId:null,subcatId:null,tags:{}});
      });
      assignSpritesToCategories();
      refreshAll();
      toast('Built sheet: '+ordered.length+' frame'+(ordered.length!==1?'s':'')+' @ '+fw+'×'+fh);
      res();
    },'image/png');
  });
}

function escHtml(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

async function importProject(file){
  // Import project zip
  try{
    const data=await file.arrayBuffer();
    const JSZipLib=getJSZipOrToast();if(!JSZipLib)return;
    const zip=await JSZipLib.loadAsync(data);
    // Check for project.json
    const projFile=zip.file('project.json');
    if(!projFile){toast('Not a valid project ZIP');return;}
    const projData=JSON.parse(await projFile.async('text'));
    projectName=projData.projectName||'Imported Project';
    document.getElementById('projectNameLabel').textContent='.'+projectName;
    // Clear current
    sheets=[];activeSheetId=null;nextSheetId=1;
    // Load each sheet folder
    const sheetNames=projData.sheets||[];
    for(const shName of sheetNames){
      const prefix=shName.replace(/[^a-zA-Z0-9_-]/g,'_')+'/';
      // Find the original image (check both sheet name and legacy _original)
      let imgFile=null;
      const safeName=shName.replace(/[^a-zA-Z0-9_-]/g,'_');
      zip.forEach((path,entry)=>{if(path.startsWith(prefix)&&!entry.dir){const fn=path.slice(prefix.length);if(fn.includes('_original.')||fn.startsWith(safeName+'.'))imgFile=entry;}});
      if(!imgFile){zip.forEach((path,entry)=>{if(path.startsWith(prefix)&&!entry.dir&&/\.(png|jpg|jpeg|webp)$/i.test(path)&&!imgFile)imgFile=entry;});}
      if(!imgFile)continue;
      const imgBlob=await imgFile.async('blob');
      const imgDataUrl=await new Promise(res=>{const r=new FileReader();r.onload=e=>res(e.target.result);r.readAsDataURL(imgBlob);});
      const imgUrl=imgDataUrl;
      await new Promise(resolve=>{
        const i=new Image();i.onload=()=>{
          const sh={id:nextSheetId++,name:shName,img:i,imgW:i.width,imgH:i.height,
            sprites:[],categories:[],tagCategories:JSON.parse(JSON.stringify(tagCategories)),
            nextSpriteId:1,nextCatId:1,nextSubcatId:1,nextTagCatId:4,
            zoom:1,panX:0,panY:0,bgMode:'checker',
            undoStack:[],redoStack:[],selectedSpriteIds:[],activeCategoryId:null,
            openCategories:[],activeSubcatId:null,originalFileData:imgDataUrl,originalFileName:shName+'.png',animSubcatIds:[],animConfigs:{}};
          // Try to load manifest
          const manFile=zip.file(prefix+'manifest.json');
          if(manFile){
            manFile.async('text').then(txt=>{
              try{
                const m=JSON.parse(txt);
                // Rebuild from manifest
                if(m.categories)sh.categories=m.categories.map((c,ci)=>({id:ci+1,name:c.name,color:c.color,region:c.region,subcats:(c.subcategories||[]).map((sc,si)=>({id:(ci+1)*100+si+1,name:sc.name,color:sc.color,region:sc.region}))}));
                // Restore tag categories, preserving original tc_N ids
                if(m.tagCategories&&Array.isArray(m.tagCategories)){
                  sh.tagCategories=m.tagCategories.map((tc,i)=>({id:'tc_'+(i+1),name:tc.name,color:tc.color,tags:tc.tags||[]}));
                  sh.nextTagCatId=sh.tagCategories.length+1;
                }
                let nsi=1;
                if(m.sprites)sh.sprites=m.sprites.map(s=>{
                  const cat=sh.categories.find(c=>c.name===s.category);
                  const sc=cat&&s.subcategory?(cat.subcats||[]).find(x=>x.name===s.subcategory):null;
                  // Remap sprite tags by tc_N id to match restored tagCategories
                  let tags={};
                  if(s.tags&&typeof s.tags==='object'){
                    Object.entries(s.tags).forEach(([key,val])=>{
                      const match=sh.tagCategories.find(tc=>tc.id===key);
                      if(match)tags[match.id]=val;
                    });
                  }
                  return{id:nsi++,x:s.x,y:s.y,w:s.w,h:s.h,name:s.name,categoryId:cat?cat.id:null,subcatId:sc?sc.id:null,tags};
                });
                sh.nextSpriteId=nsi;
                // Restore animations from manifest
                if(m.animations&&Array.isArray(m.animations)){
                  m.animations.forEach(anim=>{
                    let scId=null;
                    sh.categories.forEach(c=>{(c.subcats||[]).forEach(sc=>{if(sc.name===anim.subcategory)scId=sc.id;});});
                    if(scId!==null){
                      sh.animSubcatIds.push(scId);
                      const baseLayers=(anim.baseLayers||[]).map(name=>{const sp=sh.sprites.find(s=>s.name===name);return sp?{spriteId:sp.id,onTop:!!anim.baseOnTop}:null;}).filter(Boolean);
                      sh.animConfigs[scId]={delay:anim.delay||100,anchor:anim.anchor||'bottom',baseLayers};
                    }
                  });
                }
              }catch(e){}
              sheets.push(sh);
              if(sheets.length===1)switchSheet(sh.id);
              renderSheetTabs();updateExportTabVisibility();
              resolve();
            });
          } else {sheets.push(sh);if(sheets.length===1)switchSheet(sh.id);renderSheetTabs();updateExportTabVisibility();resolve();}
        };i.src=imgUrl;
      });
    }
    if(sheets.length){toast('Imported project with '+sheets.length+' sheet(s)');}
    else{showEmptyWorkspace('No sheets found in project ZIP');toast('No sheets found in project');}
  }catch(err){toast('Import error: '+err.message);}
}

// ===== EXPORT SELECTED SPRITE AS PNG =====
function exportSelectedSpritePng(){
  if(!selectedSpriteIds.size){toast('Select a sprite first');return;}
  const sel=sprites.filter(s=>selectedSpriteIds.has(s.id));
  sel.forEach(s=>{
    const tc=document.createElement('canvas');tc.width=s.w;tc.height=s.h;
    tc.getContext('2d').drawImage(img,s.x,s.y,s.w,s.h,0,0,s.w,s.h);
    tc.toBlob(b=>{const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=s.name+'.png';a.click();});
  });
  toast('Exported '+sel.length+' sprite(s)');
}

function updateExportSpriteVisibility(){
  const el=document.getElementById('exportSpriteItem');
  if(el) el.style.display=(selectedSpriteIds.size>0&&!peMode)?'flex':'none';
}

// ===== BULK RECOLOR =====
function showBulkRecolorModal(){
  // Determine target sprites from selection, tag, group or subgroup
  const modal=document.createElement('div');
  modal.className='modal-overlay';modal.id='bulkRecolorModal';modal.style.display='flex';
  modal.onclick=e=>{if(e.target===modal)modal.remove();};

  // Build group/subgroup options
  let groupOpts='<option value="">— All sprites —</option>';
  groupOpts+='<option value="__selection__"'+(selectedSpriteIds.size?'':' disabled')+'>Current selection ('+selectedSpriteIds.size+')</option>';
  categories.forEach(cat=>{
    groupOpts+='<option value="cat_'+cat.id+'">Group: '+esc(cat.name)+'</option>';
    (cat.subcats||[]).forEach(sc=>{
      groupOpts+='<option value="sub_'+cat.id+'_'+sc.id+'">  Sub: '+esc(sc.name)+'</option>';
    });
  });
  // Tag-based options
  tagCategories.forEach(tc=>{
    tc.tags.forEach(tag=>{
      groupOpts+='<option value="tag_'+tc.id+'_'+tag+'">Tag: '+esc(tc.name)+' = '+esc(tag)+'</option>';
    });
  });

  modal.innerHTML='<div class="modal" style="width:min(520px,94vw);max-height:90vh;overflow-y:auto">'
    +'<h3 style="margin-bottom:8px">Bulk Recolor Sprites</h3>'
    +'<p style="font-size:11px;color:var(--text2);margin-bottom:10px;">Apply color adjustments to multiple sprites at once. Changes are applied to the source image pixels directly.</p>'
    +'<div style="margin-bottom:10px"><label style="font-size:10px;color:var(--text2);display:block;margin-bottom:3px">Target Sprites</label><select id="bulkRecolorTarget" style="width:100%;padding:5px 8px;border:1px solid var(--border);border-radius:var(--radius);background:var(--surface2);color:var(--text);font-family:var(--font-mono);font-size:11px;" onchange="bulkRecolorUpdateCount()">'+groupOpts+'</select></div>'
    +'<div id="bulkRecolorCount" style="font-family:var(--font-mono);font-size:10px;color:var(--text2);margin-bottom:10px">'+sprites.length+' sprite(s) will be affected</div>'
    +'<div style="display:flex;flex-direction:column;gap:5px">'
    +'<div><div style="display:flex;justify-content:space-between"><label style="font-size:10px;color:var(--text2)">Hue Shift</label><span id="bulkHueVal" style="font-family:var(--font-mono);font-size:10px;color:var(--text)">0\u00b0</span></div><input type="range" id="bulkHueSlider" min="-180" max="180" value="0" style="width:100%;accent-color:#00c2ff" oninput="document.getElementById(\'bulkHueVal\').textContent=this.value+\'\u00b0\'"></div>'
    +'<div><div style="display:flex;justify-content:space-between"><label style="font-size:10px;color:var(--text2)">Saturation</label><span id="bulkSatVal" style="font-family:var(--font-mono);font-size:10px;color:var(--text)">0</span></div><input type="range" id="bulkSatSlider" min="-100" max="100" value="0" style="width:100%;accent-color:#00c2ff" oninput="document.getElementById(\'bulkSatVal\').textContent=this.value"></div>'
    +'<div><div style="display:flex;justify-content:space-between"><label style="font-size:10px;color:var(--text2)">Lightness</label><span id="bulkLightVal" style="font-family:var(--font-mono);font-size:10px;color:var(--text)">0</span></div><input type="range" id="bulkLightSlider" min="-100" max="100" value="0" style="width:100%;accent-color:#00c2ff" oninput="document.getElementById(\'bulkLightVal\').textContent=this.value"></div>'
    +'<div><div style="display:flex;justify-content:space-between"><label style="font-size:10px;color:var(--text2)">Contrast</label><span id="bulkContrastVal" style="font-family:var(--font-mono);font-size:10px;color:var(--text)">0</span></div><input type="range" id="bulkContrastSlider" min="-100" max="100" value="0" style="width:100%;accent-color:#00c2ff" oninput="document.getElementById(\'bulkContrastVal\').textContent=this.value"></div>'
    +'<div><div style="display:flex;justify-content:space-between"><label style="font-size:10px;color:var(--text2)">Temperature</label><span id="bulkTempVal" style="font-family:var(--font-mono);font-size:10px;color:var(--text)">0</span></div><input type="range" id="bulkTempSlider" min="-50" max="50" value="0" style="width:100%;accent-color:#00c2ff" oninput="document.getElementById(\'bulkTempVal\').textContent=this.value"></div>'
    +'</div>'
    +'<div style="height:1px;background:var(--border);margin:8px 0"></div>'
    +'<div style="font-family:var(--font-mono);font-size:9px;color:var(--text2);margin-bottom:4px;text-transform:uppercase">Color Replace</div>'
    +'<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:6px">'
    +'<span style="font-size:10px;color:var(--text2)">From:</span>'
    +'<input type="color" id="bulkReplaceFrom" value="#ff0000" style="width:28px;height:28px;border:1px solid var(--border);border-radius:4px;padding:0;cursor:pointer">'
    +'<span style="font-size:10px;color:var(--text2)">To:</span>'
    +'<input type="color" id="bulkReplaceTo" value="#0000ff" style="width:28px;height:28px;border:1px solid var(--border);border-radius:4px;padding:0;cursor:pointer">'
    +'<span style="font-size:10px;color:var(--text2)">Tol:</span>'
    +'<input type="range" id="bulkReplaceTol" min="0" max="120" value="30" style="width:60px;accent-color:#00c2ff" oninput="document.getElementById(\'bulkReplaceTolVal\').textContent=this.value">'
    +'<span id="bulkReplaceTolVal" style="font-family:var(--font-mono);font-size:9px;color:var(--text)">30</span>'
    +'</div>'
    +'<div class="actions" style="margin-top:10px"><button class="btn" onclick="document.getElementById(\'bulkRecolorModal\').remove()">Cancel</button><button class="btn primary" onclick="executeBulkRecolor()">Apply to Sprites</button></div>'
    +'</div>';
  document.body.appendChild(modal);
  bulkRecolorUpdateCount();
}

function bulkRecolorGetTargetSprites(){
  const sel=document.getElementById('bulkRecolorTarget');
  if(!sel)return sprites;
  const v=sel.value;
  if(!v)return sprites;
  if(v==='__selection__')return sprites.filter(s=>selectedSpriteIds.has(s.id));
  if(v.startsWith('cat_')){const catId=parseInt(v.slice(4));return sprites.filter(s=>s.categoryId===catId);}
  if(v.startsWith('sub_')){const parts=v.slice(4).split('_');const catId=parseInt(parts[0]),subId=parseInt(parts[1]);return sprites.filter(s=>s.categoryId===catId&&s.subcatId===subId);}
  if(v.startsWith('tag_')){const rest=v.slice(4);const us=rest.indexOf('_');const tcId=rest.slice(0,us),tagVal=rest.slice(us+1);return sprites.filter(s=>s.tags&&s.tags[tcId]===tagVal);}
  return sprites;
}

function bulkRecolorUpdateCount(){
  const targets=bulkRecolorGetTargetSprites();
  const el=document.getElementById('bulkRecolorCount');
  if(el)el.textContent=targets.length+' sprite(s) will be affected';
}

function _rgbToHsl(r,g,b){r/=255;g/=255;b/=255;const mx=Math.max(r,g,b),mn=Math.min(r,g,b),l=(mx+mn)/2;let h=0,s=0;if(mx!==mn){const d=mx-mn;s=l>0.5?d/(2-mx-mn):d/(mx+mn);if(mx===r)h=((g-b)/d+(g<b?6:0))/6;else if(mx===g)h=((b-r)/d+2)/6;else h=((r-g)/d+4)/6;}return[Math.round(h*360),Math.round(s*100),Math.round(l*100)];}
function _hslToRgb(h,s,l){h/=360;s/=100;l/=100;let r,g,b;if(s===0){r=g=b=l;}else{const hue2rgb=(p,q,t)=>{if(t<0)t+=1;if(t>1)t-=1;if(t<1/6)return p+(q-p)*6*t;if(t<1/2)return q;if(t<2/3)return p+(q-p)*(2/3-t)*6;return p;};const q=l<0.5?l*(1+s):l+s-l*s,p=2*l-q;r=hue2rgb(p,q,h+1/3);g=hue2rgb(p,q,h);b=hue2rgb(p,q,h-1/3);}return[Math.round(r*255),Math.round(g*255),Math.round(b*255)];}
function _clamp(v,a,b){return v<a?a:v>b?b:v;}

function executeBulkRecolor(){
  const targets=bulkRecolorGetTargetSprites();
  if(!targets.length){toast('No sprites to recolor');return;}
  const hShift=parseInt(document.getElementById('bulkHueSlider').value)||0;
  const sShift=parseInt(document.getElementById('bulkSatSlider').value)||0;
  const lShift=parseInt(document.getElementById('bulkLightSlider').value)||0;
  const contrast=parseInt(document.getElementById('bulkContrastSlider').value)||0;
  const temp=parseInt(document.getElementById('bulkTempSlider').value)||0;
  const fromHex=document.getElementById('bulkReplaceFrom').value;
  const toHex=document.getElementById('bulkReplaceTo').value;
  const tol=parseInt(document.getElementById('bulkReplaceTol').value)||30;
  const hasAdjust=hShift||sShift||lShift||contrast||temp;
  const doReplace=fromHex!==toHex;
  if(!hasAdjust&&!doReplace){toast('No adjustments set');return;}

  saveState();

  // Work on a mutable copy of the source image
  const tc=document.createElement('canvas');tc.width=imgW;tc.height=imgH;
  const tCtx=tc.getContext('2d');tCtx.drawImage(img,0,0);
  const contrastF=contrast!==0?(259*(contrast+255))/(255*(259-contrast)):1;

  const fromRgb=doReplace?{r:parseInt(fromHex.slice(1,3),16),g:parseInt(fromHex.slice(3,5),16),b:parseInt(fromHex.slice(5,7),16)}:null;
  const toRgb=doReplace?{r:parseInt(toHex.slice(1,3),16),g:parseInt(toHex.slice(3,5),16),b:parseInt(toHex.slice(5,7),16)}:null;

  targets.forEach(s=>{
    const id=tCtx.getImageData(s.x,s.y,s.w,s.h);
    const d=id.data;
    for(let i=0;i<d.length;i+=4){
      if(d[i+3]===0)continue;
      // Color replace first
      if(doReplace&&fromRgb&&toRgb){
        const dr=Math.abs(d[i]-fromRgb.r),dg=Math.abs(d[i+1]-fromRgb.g),db=Math.abs(d[i+2]-fromRgb.b);
        const dist=Math.sqrt(dr*dr+dg*dg+db*db);
        if(dist<=tol){
          const blend=dist<=tol*0.5?1:1-((dist-tol*0.5)/(tol*0.5));
          d[i]=Math.round(d[i]*(1-blend)+toRgb.r*blend);
          d[i+1]=Math.round(d[i+1]*(1-blend)+toRgb.g*blend);
          d[i+2]=Math.round(d[i+2]*(1-blend)+toRgb.b*blend);
        }
      }
      if(hasAdjust){
        if(contrast!==0){d[i]=_clamp(Math.round(contrastF*(d[i]-128)+128),0,255);d[i+1]=_clamp(Math.round(contrastF*(d[i+1]-128)+128),0,255);d[i+2]=_clamp(Math.round(contrastF*(d[i+2]-128)+128),0,255);}
        if(temp!==0){d[i]=_clamp(d[i]+temp,0,255);d[i+2]=_clamp(d[i+2]-temp,0,255);}
        if(hShift!==0||sShift!==0||lShift!==0){
          const hsl=_rgbToHsl(d[i],d[i+1],d[i+2]);
          const h2=(hsl[0]+hShift+360)%360,sat2=_clamp(hsl[1]+sShift,0,100),lit2=_clamp(hsl[2]+lShift,0,100);
          const rgb=_hslToRgb(h2,sat2,lit2);d[i]=rgb[0];d[i+1]=rgb[1];d[i+2]=rgb[2];
        }
      }
    }
    tCtx.putImageData(id,s.x,s.y);
  });

  // Replace the source image with modified canvas
  const newImg=new Image();
  newImg.onload=function(){
    img=newImg;
    const sh=sheets.find(s=>s.id===activeSheetId);
    if(sh)sh.img=newImg;
    render();
    toast('Recolored '+targets.length+' sprite(s)');
  };
  newImg.src=tc.toDataURL();
  document.getElementById('bulkRecolorModal').remove();
}
