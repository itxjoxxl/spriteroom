// ===== PIXEL EDITOR ENGINE =====
let peMode=null; // null, 'edit', 'compose'
let peSprites=[], peActiveSpriteId=null, peNextSpriteId=1;
let peCurrentColor={r:0,g:0,b:0,a:255}, peBgColor={r:255,g:255,b:255,a:255};
let peBrushSz=1, peMirrorX=false, peMirrorY=false;
let peSelection=null, peClipboard=null;
let peUndoStack=[], peRedoStack=[], PE_MAX_UNDO=60;
let peAnimFps=8, peAnimPlaying=false, peAnimTimer=null, peOnionSkin=false, peOnionOp=0.3;
let peRecentColors=[], peTool='pencil';
let peDrawing=false, peDrawStart=null, peDrawCurrent=null, peLastDrawPx=-1, peLastDrawPy=-1;
let peMoveOrigin=null;
// Compose mode state
let scSheetW=256, scSheetH=256, scSheetSprites=[], scSelectedId=null, scNextId=1;
let scDragging=false, scDragStart=null, scDragOrigPos=null, scDragOrigAll=null;
let scLassoActive=false, scLassoPoints=[];
let peHoverPixel=null;
// Return state
let peReturnSheetId=null, peReturnSpriteRef=null;
let peComposeTargetSheetId=null;
// Saved snip state
let savedSnipState=null;
let peEditSessionKind='single';
let peProjectSourceSheetId=null;
let peProjectOriginalSpriteRefs=[];

const PE_PALETTES={pico8:['#000000','#1D2B53','#7E2553','#008751','#AB5236','#5F574F','#C2C3C7','#FFF1E8','#FF004D','#FFA300','#FFEC27','#00E436','#29ADFF','#83769C','#FF77A8','#FFCCAA'],db32:['#000000','#222034','#45283c','#663931','#8f563b','#df7126','#d9a066','#eec39a','#fbf236','#99e550','#6abe30','#37946e','#4b692f','#524b24','#323c39','#3f3f74','#306082','#5b6ee1','#639bff','#5fcde4','#cbdbfc','#ffffff','#9badb7','#847e87','#696a6a','#595652','#76428a','#ac3232','#d95763','#d77bba','#8f974a','#8a6f30'],nes:['#000000','#fcfcfc','#f8f8f8','#bcbcbc','#7c7c7c','#a4e4fc','#3cbcfc','#0078f8','#0000fc','#b8b8f8','#6888fc','#0058f8','#0000bc','#d8b8f8','#9878f8','#6844fc','#4428bc','#f8b8f8','#f878f8','#d800cc','#940084','#f8a4c0','#f85898','#e40058','#a80020','#f0d0b0','#f87858','#f83800','#a81000','#fce0a8','#fca044','#e45c10','#881400','#f8d878','#f8b800','#ac7c00','#503000','#d8f878','#b8f818','#00b800','#007800','#b8f8b8','#58d854','#00a800','#006800','#b8f8d8','#58f898','#00a844','#005800','#00fcfc','#00e8d8','#008888','#004058']};
let pePalette=[...PE_PALETTES.pico8];

function peClamp(v,a,b){return Math.max(a,Math.min(b,v));}
function peHexFromRgb(r,g,b){return'#'+[r,g,b].map(v=>v.toString(16).padStart(2,'0')).join('');}
function peRgbFromHex(h){h=h.replace('#','');return{r:parseInt(h.substr(0,2),16)||0,g:parseInt(h.substr(2,2),16)||0,b:parseInt(h.substr(4,2),16)||0};}
function peGetActiveSprite(){return peSprites.find(s=>s.id===peActiveSpriteId)||null;}
function peGetActiveFrame(){const s=peGetActiveSprite();return s?s.frames[s.activeFrame]:null;}
function peGetActiveLayer(){const s=peGetActiveSprite();const f=peGetActiveFrame();return f?f.layers[s.activeLayer]:null;}
function peCreateSpriteData(w,h,n,imgData){const id=peNextSpriteId++;const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d');let data;if(imgData){ctx.putImageData(imgData,0,0);data=ctx.getImageData(0,0,w,h);}else{data=ctx.createImageData(w,h);}return{id,name:n||'sprite_'+id,w,h,frames:[{layers:[{name:'Layer 1',visible:true,opacity:100,data}]}],activeFrame:0,activeLayer:0};}
function peCloneLayerData(layers){return layers.map(l=>({name:l.name,visible:l.visible,opacity:l.opacity||100,data:new ImageData(new Uint8ClampedArray(l.data.data),l.data.width,l.data.height)}));}
function peCloneFrameData(frames){return frames.map(f=>({layers:peCloneLayerData(f.layers)}));}
function peCompositeFrame(sp,fi){const f=sp.frames[fi],c=document.createElement('canvas');c.width=sp.w;c.height=sp.h;const ctx=c.getContext('2d');for(let i=f.layers.length-1;i>=0;i--){if(!f.layers[i].visible)continue;const lc=document.createElement('canvas');lc.width=sp.w;lc.height=sp.h;lc.getContext('2d').putImageData(f.layers[i].data,0,0);ctx.globalAlpha=(f.layers[i].opacity||100)/100;ctx.drawImage(lc,0,0);}return c;}

function peIsAnimationAsset(sp){return !!((sp&&sp.frames&&sp.frames.length>1)||(sp&&sp._assetType==='animation'));}
function peFindSubcatAnywhere(subId,cats){
  if(subId==null)return null;
  cats=cats||[];
  for(const cat of cats){
    const sub=(cat.subcats||[]).find(sc=>sc.id===subId);
    if(sub)return{category:cat,subcat:sub};
  }
  return null;
}
function peGetAssetGroupLabel(sp,cats){
  const found=peFindSubcatAnywhere(sp&&sp._snipSubcatId,cats||[]);
  if(found&&found.subcat&&found.subcat.name)return found.category.name+' / '+found.subcat.name;
  const cat=sp&&sp._snipCatId!=null?(cats||[]).find(c=>c.id===sp._snipCatId):null;
  return cat?cat.name:'Ungrouped';
}
function peCropSpriteImageData(sheetImg,sprite,outW,outH){
  const w=Math.max(1,outW||sprite.w||1),h=Math.max(1,outH||sprite.h||1);
  const tc=document.createElement('canvas');tc.width=w;tc.height=h;
  const tx=tc.getContext('2d');tx.imageSmoothingEnabled=false;
  if(sheetImg)tx.drawImage(sheetImg,sprite.x,sprite.y,sprite.w,sprite.h,0,0,sprite.w,sprite.h);
  if(sprite.excludeMask&&Object.keys(sprite.excludeMask).length){
    const id=tx.getImageData(0,0,w,h),dd=id.data;
    for(let py=0;py<sprite.h;py++)for(let px=0;px<sprite.w;px++){
      const key=(sprite.x+px)+','+(sprite.y+py);
      if(sprite.excludeMask[key]){const i=(py*w+px)*4;dd[i+3]=0;}
    }
    tx.putImageData(id,0,0);
  }
  return tx.getImageData(0,0,w,h);
}
function peGetProjectEditSheet(){
  return peProjectSourceSheetId?sheets.find(s=>s.id===peProjectSourceSheetId):null;
}
function peEnsureAnimationBucket(sheet,asset){
  if(!sheet.categories)sheet.categories=[];
  let found=asset._snipSubcatId!=null?peFindSubcatAnywhere(asset._snipSubcatId,sheet.categories):null;
  let cat=found?found.category:(asset._snipCatId!=null?(sheet.categories||[]).find(c=>c.id===asset._snipCatId):null);
  if(!cat){
    cat=(sheet.categories||[]).find(c=>/^animations$/i.test(c.name));
    if(!cat){
      const color=(typeof catColors!=='undefined'&&catColors.length)?catColors[(Math.max(1,sheet.nextCatId||1)-1)%catColors.length]:'#7c5cff';
      cat={id:sheet.nextCatId||1,name:'Animations',color,region:null,subcats:[]};
      sheet.nextCatId=(sheet.nextCatId||1)+1;
      sheet.categories.push(cat);
    }
  }
  if(!cat.subcats)cat.subcats=[];
  let sub=found?found.subcat:(asset._snipSubcatId!=null?(cat.subcats||[]).find(sc=>sc.id===asset._snipSubcatId):null);
  if(!sub){
    const idx=cat.subcats.length;
    const color=(typeof catColors!=='undefined'&&catColors.length)?catColors[(idx+3)%catColors.length]:'#00c2ff';
    sub={id:sheet.nextSubcatId||1,name:asset.name||('Animation '+(idx+1)),color,region:null};
    sheet.nextSubcatId=(sheet.nextSubcatId||1)+1;
    cat.subcats.push(sub);
  }
  if(asset.name)sub.name=asset.name;
  asset._snipCatId=cat.id;
  asset._snipSubcatId=sub.id;
  return{category:cat,subcat:sub};
}
function peBuildProjectEditAssets(sourceSheet,initialSpriteId){
  peSprites=[];peNextSpriteId=1;peProjectOriginalSpriteRefs=(sourceSheet&&sourceSheet.sprites?sourceSheet.sprites:[]).map(s=>JSON.parse(JSON.stringify(s)));
  if(!sourceSheet||!sourceSheet.img)return null;
  const animSet=new Set(sourceSheet.animSubcatIds||[]);
  const animCfgs=sourceSheet.animConfigs||{};
  const cats=sourceSheet.categories||[];
  const sheetSprites=(sourceSheet.sprites||[]).slice().sort((a,b)=>(a.y-b.y)||(a.x-b.x));
  const groups=[];const groupMap=new Map();
  sheetSprites.forEach(sprite=>{
    const isAnim=!!(sprite.subcatId!=null&&animSet.has(sprite.subcatId));
    const key=isAnim?('anim:'+sprite.subcatId):('sprite:'+sprite.id);
    if(!groupMap.has(key))groupMap.set(key,{isAnim,items:[]});
    groupMap.get(key).items.push(sprite);
  });
  groups.push(...groupMap.values());
  groups.sort((a,b)=>{const fa=a.items[0]||{},fb=b.items[0]||{};return (fa.y-fb.y)||(fa.x-fb.x);});
  let desiredId=null;
  groups.forEach((group,idx)=>{
    const items=group.items.slice().sort((a,b)=>(a.x-b.x)||(a.y-b.y));
    const maxW=Math.max(1,...items.map(it=>it.w||1));
    const maxH=Math.max(1,...items.map(it=>it.h||1));
    let assetName=items[0].name||('sprite_'+(idx+1));
    if(group.isAnim&&items[0].subcatId!=null){
      const found=peFindSubcatAnywhere(items[0].subcatId,cats);
      if(found&&found.subcat&&found.subcat.name)assetName=found.subcat.name;
    }
    const frames=items.map(it=>({layers:[{name:'Layer 1',visible:true,opacity:100,data:peCropSpriteImageData(sourceSheet.img,it,maxW,maxH)}]}));
    const cfg=(group.isAnim&&items[0].subcatId!=null&&animCfgs[items[0].subcatId])?animCfgs[items[0].subcatId]:{};
    const sp={
      id:peNextSpriteId++,name:assetName,w:maxW,h:maxH,frames,activeFrame:0,activeLayer:0,
      _frameRefs:items.map(it=>({spriteId:it.id,x:it.x,y:it.y,w:it.w,h:it.h,name:it.name,categoryId:it.categoryId||null,subcatId:it.subcatId||null,tags:it.tags?{...it.tags}:{},excludeMask:it.excludeMask?JSON.parse(JSON.stringify(it.excludeMask)):null})),
      _snipCatId:items[0].categoryId||null,_snipSubcatId:items[0].subcatId||null,_snipTags:items[0].tags?{...items[0].tags}:{},
      _assetType:group.isAnim?'animation':'sprite',_animDelay:cfg.delay||100,_animAnchor:cfg.anchor||'bottom',
      _animCanvasW:cfg.canvasW||maxW,_animCanvasH:cfg.canvasH||maxH,_animBaseLayers:cfg.baseLayers?JSON.parse(JSON.stringify(cfg.baseLayers)):[],_animOffsets:cfg.offsets?JSON.parse(JSON.stringify(cfg.offsets)):{}
    };
    peSprites.push(sp);
    if(initialSpriteId&&items.some(it=>it.id===initialSpriteId))desiredId=sp.id;
  });
  if(!peSprites.length&&sourceSheet.img){
    const tc=document.createElement('canvas');tc.width=Math.max(1,sourceSheet.imgW||1);tc.height=Math.max(1,sourceSheet.imgH||1);
    const tx=tc.getContext('2d');tx.drawImage(sourceSheet.img,0,0);
    const sp=peCreateSpriteData(tc.width,tc.height,(sourceSheet.name||'sheet')+'_sheet',tx.getImageData(0,0,tc.width,tc.height));
    sp._assetType='sprite';
    peSprites.push(sp);desiredId=sp.id;
  }
  peActiveSpriteId=desiredId||(peSprites[0]?peSprites[0].id:null);
  return peActiveSpriteId;
}
function peEnterProjectEditMode(sheetId,initialSpriteId){
  const sourceSheet=sheetId?sheets.find(s=>s.id===sheetId):null;
  if(!sourceSheet){toast('No sheet to edit');return;}
  if(peMode&&peMode!=='snip')return;
  saveSnipState();
  peMode='edit';
  peEditSessionKind='project';
  peProjectSourceSheetId=sourceSheet.id;
  peReturnSheetId=sourceSheet.id;
  peReturnSpriteRef=null;
  peBuildProjectEditAssets(sourceSheet,initialSpriteId||null);
  peUndoStack=[];peRedoStack=[];peTool='pencil';
  document.getElementById('panel').style.display='none';
  document.getElementById('toolbar').style.display='flex';
  document.getElementById('bottomBar').style.display='flex';
  document.getElementById('dropzone').style.display='none';
  canvasWrap.classList.remove('dropzone-visible');
  updateModeIndicator();
  swapToolbarToEdit();
  showEditPanel();
  peZoomFit();
  document.getElementById('peMirrorIndicator').style.display='flex';
  const count=peSprites.length;
  setStatus('Edit studio: '+count+' asset'+(count===1?'':'s'));
  if(typeof updateActiveToolLabel==='function')updateActiveToolLabel();
  toast('Edit studio opened — sprites and animations are editable in one place');
}
function peApplyProjectEditSessionToSheet(targetSheetId,opts){
  opts=opts||{};
  const sh=targetSheetId?sheets.find(s=>s.id===targetSheetId):null;
  if(!sh)return false;
  sh.categories=JSON.parse(JSON.stringify(sh.categories||[]));
  sh.tagCategories=JSON.parse(JSON.stringify(sh.tagCategories||tagCategories||[]));
  sh.nextCatId=sh.nextCatId||1;sh.nextSubcatId=sh.nextSubcatId||1;sh.nextSpriteId=sh.nextSpriteId||1;
  const originalRefs=(peProjectOriginalSpriteRefs&&peProjectOriginalSpriteRefs.length?peProjectOriginalSpriteRefs:(sh.sprites||[])).map(s=>JSON.parse(JSON.stringify(s)));
  let autoX=0,autoY=Math.max((sh.imgH||0)+4,Math.max(0,...originalRefs.map(r=>(r.y||0)+(r.h||0)))+4),autoRowH=0;
  const newSprites=[];const animIds=new Set();const animCfgs={};
  let needW=Math.max(1,sh.imgW||1),needH=Math.max(1,sh.imgH||1);
  const assets=peSprites.slice();
  assets.forEach(asset=>{
    if(!asset||!asset.frames||!asset.frames.length)return;
    const isAnim=peIsAnimationAsset(asset);
    let refs=(asset._frameRefs||[]).map(r=>JSON.parse(JSON.stringify(r)));
    if(!refs.length){
      refs=[];
      for(let i=0;i<asset.frames.length;i++){
        if(autoX+asset.w>Math.max(256,needW+128)){autoX=0;autoY+=autoRowH+4;autoRowH=0;}
        refs.push({spriteId:sh.nextSpriteId++,x:autoX,y:autoY,w:asset.w,h:asset.h,name:asset.name,categoryId:asset._snipCatId||null,subcatId:asset._snipSubcatId||null,tags:asset._snipTags?{...asset._snipTags}:{}});
        autoX+=asset.w+2;autoRowH=Math.max(autoRowH,asset.h);
      }
    } else {
      const base=refs[0];
      while(refs.length<asset.frames.length){
        const prev=refs[refs.length-1]||base;
        refs.push({spriteId:sh.nextSpriteId++,x:(prev?prev.x:base.x)+asset.w+2,y:(base?base.y:autoY),w:asset.w,h:asset.h,name:asset.name,categoryId:asset._snipCatId||null,subcatId:asset._snipSubcatId||null,tags:asset._snipTags?{...asset._snipTags}:{}});
      }
      refs=refs.slice(0,asset.frames.length);
    }
    let categoryId=asset._snipCatId||null,subcatId=asset._snipSubcatId||null;
    if(isAnim){
      const bucket=peEnsureAnimationBucket(sh,asset);
      categoryId=bucket.category.id;subcatId=bucket.subcat.id;
      animIds.add(subcatId);
      animCfgs[subcatId]={delay:asset._animDelay||100,anchor:asset._animAnchor||'bottom',canvasW:asset._animCanvasW||asset.w,canvasH:asset._animCanvasH||asset.h,baseLayers:asset._animBaseLayers?JSON.parse(JSON.stringify(asset._animBaseLayers)):[],offsets:asset._animOffsets?JSON.parse(JSON.stringify(asset._animOffsets)): {}};
    }else if(categoryId==null&&subcatId!=null){
      const found=peFindSubcatAnywhere(subcatId,sh.categories||[]);if(found)categoryId=found.category.id;
    }
    refs.forEach((ref,idx)=>{
      ref.spriteId=ref.spriteId||sh.nextSpriteId++;
      ref.w=asset.w;ref.h=asset.h;
      ref.categoryId=categoryId;ref.subcatId=subcatId;
      ref.tags=asset._snipTags?{...asset._snipTags}:{};
      ref.name=(isAnim&&asset.frames.length>1)?(asset.name+'_frame_'+(idx+1)):asset.name;
      needW=Math.max(needW,ref.x+asset.w);needH=Math.max(needH,ref.y+asset.h);
      newSprites.push({id:ref.spriteId,x:ref.x,y:ref.y,w:asset.w,h:asset.h,name:ref.name,categoryId,subcatId,tags:ref.tags});
    });
    asset._frameRefs=refs.map(r=>JSON.parse(JSON.stringify(r)));
    asset._snipCatId=categoryId;asset._snipSubcatId=subcatId;
  });
  const c=document.createElement('canvas');c.width=Math.max(1,needW);c.height=Math.max(1,needH);
  const ctx=c.getContext('2d');ctx.imageSmoothingEnabled=false;
  if(sh.img)ctx.drawImage(sh.img,0,0);
  originalRefs.forEach(r=>ctx.clearRect(r.x,r.y,r.w,r.h));
  assets.forEach(asset=>{(asset._frameRefs||[]).forEach((ref,idx)=>{const frameCanvas=peCompositeFrame(asset,Math.min(idx,asset.frames.length-1));ctx.drawImage(frameCanvas,ref.x,ref.y);});});
  sh.img=c;sh.imgW=c.width;sh.imgH=c.height;sh.originalFileData=c.toDataURL('image/png');sh.originalFileName=sh.originalFileName||'edited_sheet.png';
  sh.sprites=newSprites.sort((a,b)=>a.id-b.id);
  sh.nextSpriteId=Math.max(sh.nextSpriteId||1,1,...sh.sprites.map(s=>s.id+1));
  sh.animSubcatIds=[...animIds];
  sh.animConfigs=animCfgs;
  if(activeSheetId===targetSheetId){
    img=sh.img;imgW=sh.imgW;imgH=sh.imgH;originalFileData=sh.originalFileData;originalFileName=sh.originalFileName;
    sprites=sh.sprites;categories=sh.categories;tagCategories=sh.tagCategories;nextSpriteId=sh.nextSpriteId;nextCatId=sh.nextCatId;nextSubcatId=sh.nextSubcatId;
    animSubcatIds=new Set(sh.animSubcatIds||[]);animConfigs=JSON.parse(JSON.stringify(sh.animConfigs||{}));
    render();refreshAll();
  }
  peProjectOriginalSpriteRefs=sh.sprites.map(s=>JSON.parse(JSON.stringify(s)));
  saveSheetState&&saveSheetState();
  if(!opts.silent)toast('Edit studio changes applied to the current tab');
  return true;
}
function peSelectSpriteAsset(id){
  if(peActiveSpriteId===id){
    peClearActiveAssetSelection();
    return;
  }
  const sp=peSprites.find(s=>s.id===id);if(!sp)return;
  peActiveSpriteId=id;peSelection=null;peHoverPixel=null;
  sp.activeFrame=Math.max(0,Math.min(sp.activeFrame||0,(sp.frames||[]).length-1));
  sp.activeLayer=Math.max(0,Math.min(sp.activeLayer||0,((sp.frames[sp.activeFrame]||{layers:[{}]}).layers||[]).length-1));
  peZoomFit();peRefreshAll();setStatus('Editing: '+(sp.name||'sprite'));
}
function peClearActiveAssetSelection(){
  peActiveSpriteId=null;
  peSelection=null;
  peHoverPixel=null;
  const dims=document.getElementById('imgDims');if(dims)dims.textContent='—';
  const coord=document.getElementById('coordInfo');if(coord)coord.textContent='0, 0';
  peRefreshAll();
  setStatus(peSprites.length?'No asset selected — choose one from the list or add a new sprite':'No assets yet — create a sprite to start editing');
  toast('Deselected asset');
}
function peAddSpriteAsset(){
  peSaveState();
  const sp=peCreateSpriteData(32,32,'sprite_'+(peSprites.length+1));
  sp._assetType='sprite';sp._snipTags={};sp._snipCatId=null;sp._snipSubcatId=null;sp._frameRefs=[];
  peSprites.push(sp);peActiveSpriteId=sp.id;peZoomFit();peRefreshAll();toast('Added sprite asset');
}
function peDuplicateSpriteAsset(){
  const s=peGetActiveSprite();if(!s){toast('Select a sprite first');return;}
  peSaveState();
  const dup={id:peNextSpriteId++,name:(s.name||'sprite')+' copy',w:s.w,h:s.h,frames:peCloneFrameData(s.frames),activeFrame:s.activeFrame||0,activeLayer:s.activeLayer||0,
    _assetType:peIsAnimationAsset(s)?'animation':'sprite',_snipTags:s._snipTags?{...s._snipTags}:{},_snipCatId:s._snipCatId||null,_snipSubcatId:s._snipSubcatId||null,_frameRefs:[],
    _animDelay:s._animDelay||100,_animAnchor:s._animAnchor||'bottom',_animCanvasW:s._animCanvasW||s.w,_animCanvasH:s._animCanvasH||s.h,_animBaseLayers:s._animBaseLayers?JSON.parse(JSON.stringify(s._animBaseLayers)):[],_animOffsets:s._animOffsets?JSON.parse(JSON.stringify(s._animOffsets)):{}
  };
  peSprites.push(dup);peActiveSpriteId=dup.id;peZoomFit();peRefreshAll();toast('Duplicated asset');
}
function peDeleteSpriteAsset(){
  const s=peGetActiveSprite();if(!s){toast('Select a sprite first');return;}
  peSaveState();
  peSprites=peSprites.filter(sp=>sp.id!==s.id);
  peActiveSpriteId=peSprites.length?peSprites[Math.max(0,peSprites.length-1)].id:null;
  peSelection=null;peHoverPixel=null;peRefreshAll();toast('Deleted asset');
}
function peRenameActiveAsset(){
  const s=peGetActiveSprite();if(!s)return;
  const n=prompt('Asset name:',s.name||'sprite');
  if(n!==null&&n.trim()&&n.trim()!==s.name){peSaveState();s.name=n.trim();peRefreshAll();setStatus('Editing: '+s.name);toast('Renamed asset');}
}
function peSetAnimDelay(v){const s=peGetActiveSprite();if(!s)return;const n=Math.max(16,parseInt(v)||100);if((s._animDelay||100)===n)return;peSaveState();s._animDelay=n;peUpdateAnimMetaUi();}
function peSetAnimAnchor(v){const s=peGetActiveSprite();if(!s)return;const val=v||'bottom';if((s._animAnchor||'bottom')===val)return;peSaveState();s._animAnchor=val;peUpdateAnimMetaUi();}
function peUpdateAnimMetaUi(){
  const s=peGetActiveSprite();
  const meta=document.getElementById('peAnimMeta');
  const delay=document.getElementById('peAnimDelayInput');
  const anchor=document.getElementById('peAnimAnchorSelect');
  if(delay)delay.value=s?(s._animDelay||100):100;
  if(anchor)anchor.value=s?(s._animAnchor||'bottom'):'bottom';
  if(meta)meta.textContent=s?(peIsAnimationAsset(s)?('Animation · '+s.frames.length+' frame'+(s.frames.length===1?'':'s')):('Sprite · '+s.w+'×'+s.h)):'No asset selected';
}
function peRenderSpriteList(){
  const el=document.getElementById('peSpriteList');if(!el)return;
  const countBar=document.getElementById('peSpriteCount');if(countBar)countBar.textContent=peSprites.length+' asset'+(peSprites.length===1?'':'s');
  const peSelAct=document.getElementById('peSpritesSelActions');if(peSelAct)peSelAct.style.display=peActiveSpriteId?'flex':'none';
  const sheet=peGetProjectEditSheet();const cats=sheet?sheet.categories:(categories||[]);
  if(!peSprites.length){el.innerHTML='<div style="padding:16px;text-align:center;color:var(--text2);font-size:11px;">No assets yet.<br>Create a sprite to start editing.</div>';return;}
  el.innerHTML=peSprites.map(sp=>{
    const active=sp.id===peActiveSpriteId;
    const kind=peIsAnimationAsset(sp)?('Animation · '+sp.frames.length+'f'):('Sprite · '+sp.w+'×'+sp.h);
    const group=peGetAssetGroupLabel(sp,cats);
    return '<div class="pe-sprite-item'+(active?' active':'')+'" data-psid="'+sp.id+'"><div class="thumb"><canvas width="32" height="32" data-psth="'+sp.id+'" style="image-rendering:pixelated"></canvas></div><div class="info"><div class="name">'+esc(sp.name||'sprite')+'</div><div class="dims">'+esc(kind)+' · '+esc(group)+'</div></div></div>';
  }).join('');
  el.querySelectorAll('.pe-sprite-item').forEach(item=>item.addEventListener('click',()=>peSelectSpriteAsset(parseInt(item.dataset.psid))));
  peSprites.forEach(sp=>{
    const tc=el.querySelector('[data-psth="'+sp.id+'"]');if(!tc)return;
    const x=tc.getContext('2d');x.clearRect(0,0,32,32);x.imageSmoothingEnabled=false;x.drawImage(peCompositeFrame(sp,Math.min(sp.activeFrame||0,sp.frames.length-1)),0,0,32,32);
  });
}

// ===== PIXEL EDITOR: SAVE/UNDO =====
function peSaveState(){const s=peGetActiveSprite();if(peMode==='edit'){if(!s)return;const f=s.frames[s.activeFrame];peUndoStack.push({t:'p',sid:s.id,fi:s.activeFrame,layers:peCloneLayerData(f.layers)});}else if(peMode==='compose'){peUndoStack.push({t:'s',sheetW:scSheetW,sheetH:scSheetH,selectedId:scSelectedId,selectedIds:[...scSelectedIds],data:JSON.parse(JSON.stringify(scSheetSprites))});}if(peUndoStack.length>PE_MAX_UNDO)peUndoStack.shift();peRedoStack=[];}
function peUndo(){if(!peUndoStack.length)return;const st=peUndoStack.pop();if(st.t==='p'){const s=peSprites.find(x=>x.id===st.sid);if(!s)return;const f=s.frames[st.fi];peRedoStack.push({t:'p',sid:s.id,fi:st.fi,layers:peCloneLayerData(f.layers)});f.layers=st.layers;}else{peRedoStack.push({t:'s',sheetW:scSheetW,sheetH:scSheetH,selectedId:scSelectedId,selectedIds:[...scSelectedIds],data:JSON.parse(JSON.stringify(scSheetSprites))});scSheetSprites=st.data;scSheetW=st.sheetW||scSheetW;scSheetH=st.sheetH||scSheetH;scSelectedId=st.selectedId||null;scSelectedIds=new Set(st.selectedIds||[]);}peRefreshAll();}
function peRedo(){if(!peRedoStack.length)return;const st=peRedoStack.pop();if(st.t==='p'){const s=peSprites.find(x=>x.id===st.sid);if(!s)return;const f=s.frames[st.fi];peUndoStack.push({t:'p',sid:s.id,fi:st.fi,layers:peCloneLayerData(f.layers)});f.layers=st.layers;}else{peUndoStack.push({t:'s',sheetW:scSheetW,sheetH:scSheetH,selectedId:scSelectedId,selectedIds:[...scSelectedIds],data:JSON.parse(JSON.stringify(scSheetSprites))});scSheetSprites=st.data;scSheetW=st.sheetW||scSheetW;scSheetH=st.sheetH||scSheetH;scSelectedId=st.selectedId||null;scSelectedIds=new Set(st.selectedIds||[]);}peRefreshAll();}

// ===== PIXEL EDITOR: DRAWING PRIMITIVES =====
function peSetPixel(d,x,y,w,h,r,g,b,a){if(x<0||y<0||x>=w||y>=h)return;const i=(y*w+x)*4;if(a===0){d[i]=d[i+1]=d[i+2]=d[i+3]=0;return;}const sa=a/255,da=d[i+3]/255,oa=sa+da*(1-sa);if(oa===0){d[i]=d[i+1]=d[i+2]=d[i+3]=0;return;}d[i]=Math.round((r*sa+d[i]*da*(1-sa))/oa);d[i+1]=Math.round((g*sa+d[i+1]*da*(1-sa))/oa);d[i+2]=Math.round((b*sa+d[i+2]*da*(1-sa))/oa);d[i+3]=Math.round(oa*255);}
function peErasePixel(d,x,y,w,h){if(x<0||y<0||x>=w||y>=h)return;const i=(y*w+x)*4;d[i]=d[i+1]=d[i+2]=d[i+3]=0;}
function peGetPixel(d,x,y,w,h){if(x<0||y<0||x>=w||y>=h)return{r:0,g:0,b:0,a:0};const i=(y*w+x)*4;return{r:d[i],g:d[i+1],b:d[i+2],a:d[i+3]};}
function peDrawBrush(px,py,erase){const s=peGetActiveSprite();if(!s)return;const l=peGetActiveLayer();if(!l||!l.visible)return;const d=l.data.data,w=s.w,h=s.h,half=Math.floor(peBrushSz/2);for(let dy=0;dy<peBrushSz;dy++)for(let dx=0;dx<peBrushSz;dx++){const bx=px-half+dx,by=py-half+dy;if(erase)peErasePixel(d,bx,by,w,h);else peSetPixel(d,bx,by,w,h,peCurrentColor.r,peCurrentColor.g,peCurrentColor.b,peCurrentColor.a);if(peMirrorX){const mx=w-1-bx;if(erase)peErasePixel(d,mx,by,w,h);else peSetPixel(d,mx,by,w,h,peCurrentColor.r,peCurrentColor.g,peCurrentColor.b,peCurrentColor.a);}if(peMirrorY){const my=h-1-by;if(erase)peErasePixel(d,bx,my,w,h);else peSetPixel(d,bx,my,w,h,peCurrentColor.r,peCurrentColor.g,peCurrentColor.b,peCurrentColor.a);}if(peMirrorX&&peMirrorY){const mx=w-1-bx,my=h-1-by;if(erase)peErasePixel(d,mx,my,w,h);else peSetPixel(d,mx,my,w,h,peCurrentColor.r,peCurrentColor.g,peCurrentColor.b,peCurrentColor.a);}}}
function peDitherBrush(px,py){const s=peGetActiveSprite();if(!s)return;const l=peGetActiveLayer();if(!l||!l.visible)return;const d=l.data.data,w=s.w,h=s.h,half=Math.floor(peBrushSz/2);for(let dy=0;dy<peBrushSz;dy++)for(let dx=0;dx<peBrushSz;dx++){const bx=px-half+dx,by=py-half+dy;if((bx+by)%2===0)peSetPixel(d,bx,by,w,h,peCurrentColor.r,peCurrentColor.g,peCurrentColor.b,peCurrentColor.a);}}
function peLightenBrush(px,py,lighten){const s=peGetActiveSprite();if(!s)return;const l=peGetActiveLayer();if(!l||!l.visible)return;const d=l.data.data,w=s.w,h=s.h,half=Math.floor(peBrushSz/2),amt=lighten?15:-15;for(let dy=0;dy<peBrushSz;dy++)for(let dx=0;dx<peBrushSz;dx++){const bx=px-half+dx,by=py-half+dy;if(bx<0||by<0||bx>=w||by>=h)continue;const i=(by*w+bx)*4;if(d[i+3]===0)continue;d[i]=peClamp(d[i]+amt,0,255);d[i+1]=peClamp(d[i+1]+amt,0,255);d[i+2]=peClamp(d[i+2]+amt,0,255);}}
function peFloodFill(sx,sy){const s=peGetActiveSprite();if(!s)return;const l=peGetActiveLayer();if(!l||!l.visible)return;const d=l.data.data,w=s.w,h=s.h,t=peGetPixel(d,sx,sy,w,h),f={...peCurrentColor};if(t.r===f.r&&t.g===f.g&&t.b===f.b&&t.a===f.a)return;peSaveState();const stk=[[sx,sy]],vis=new Set();while(stk.length){const[x,y]=stk.pop();const k=x+','+y;if(vis.has(k))continue;vis.add(k);if(x<0||y<0||x>=w||y>=h)continue;const p=peGetPixel(d,x,y,w,h);if(p.r!==t.r||p.g!==t.g||p.b!==t.b||p.a!==t.a)continue;const i=(y*w+x)*4;d[i]=f.r;d[i+1]=f.g;d[i+2]=f.b;d[i+3]=f.a;stk.push([x+1,y],[x-1,y],[x,y+1],[x,y-1]);}peRefreshAll();}
function peDrawLine(x0,y0,x1,y1,erase){const dx=Math.abs(x1-x0),dy=Math.abs(y1-y0),sx=x0<x1?1:-1,sy=y0<y1?1:-1;let err=dx-dy;while(true){peDrawBrush(x0,y0,erase);if(x0===x1&&y0===y1)break;const e2=2*err;if(e2>-dy){err-=dy;x0+=sx;}if(e2<dx){err+=dx;y0+=sy;}}}
function peDrawRect(x0,y0,x1,y1,filled,erase){const mnX=Math.min(x0,x1),mxX=Math.max(x0,x1),mnY=Math.min(y0,y1),mxY=Math.max(y0,y1);if(filled){for(let y=mnY;y<=mxY;y++)for(let x=mnX;x<=mxX;x++)peDrawBrush(x,y,erase);}else{for(let x=mnX;x<=mxX;x++){peDrawBrush(x,mnY,erase);peDrawBrush(x,mxY,erase);}for(let y=mnY+1;y<mxY;y++){peDrawBrush(mnX,y,erase);peDrawBrush(mxX,y,erase);}}}
function peDrawCircle(cx,cy,rx,ry,filled,erase){if(filled){for(let y=-ry;y<=ry;y++)for(let x=-rx;x<=rx;x++){if((x*x)/(rx*rx||1)+(y*y)/(ry*ry||1)<=1)peDrawBrush(cx+x,cy+y,erase);}}else{const pts=new Set();for(let a=0;a<360;a+=0.5){const x=Math.round(cx+rx*Math.cos(a*Math.PI/180)),y=Math.round(cy+ry*Math.sin(a*Math.PI/180));const k=x+','+y;if(!pts.has(k)){pts.add(k);peDrawBrush(x,y,erase);}}}}

// ===== PIXEL EDITOR: SELECTION =====
function peSelCopy(){const s=peGetActiveSprite();if(!s||!peSelection)return;const l=peGetActiveLayer();if(!l)return;const sel=peSelection;const d=new Uint8ClampedArray(sel.w*sel.h*4);const src=l.data.data;for(let y=0;y<sel.h;y++)for(let x=0;x<sel.w;x++){const si=((sel.y+y)*s.w+(sel.x+x))*4,di=(y*sel.w+x)*4;d[di]=src[si];d[di+1]=src[si+1];d[di+2]=src[si+2];d[di+3]=src[si+3];}peClipboard={w:sel.w,h:sel.h,data:d};toast('Copied');}
function peSelCut(){peSelCopy();peSelDelete();}
function peSelPaste(){const s=peGetActiveSprite();if(!s||!peClipboard)return;peSaveState();const l=peGetActiveLayer();if(!l)return;const d=l.data.data;for(let y=0;y<peClipboard.h&&y<s.h;y++)for(let x=0;x<peClipboard.w&&x<s.w;x++){const si=(y*peClipboard.w+x)*4;if(peClipboard.data[si+3]===0)continue;const di=(y*s.w+x)*4;d[di]=peClipboard.data[si];d[di+1]=peClipboard.data[si+1];d[di+2]=peClipboard.data[si+2];d[di+3]=peClipboard.data[si+3];}peRender();toast('Pasted');}
function peSelDelete(){const s=peGetActiveSprite();if(!s||!peSelection)return;peSaveState();const l=peGetActiveLayer();if(!l)return;const d=l.data.data,sel=peSelection;for(let y=sel.y;y<sel.y+sel.h;y++)for(let x=sel.x;x<sel.x+sel.w;x++){const i=(y*s.w+x)*4;d[i]=d[i+1]=d[i+2]=d[i+3]=0;}peRender();}
function peSelFlipH(){const s=peGetActiveSprite();if(!s||!peSelection)return;peSaveState();const l=peGetActiveLayer();if(!l)return;const d=l.data.data,sel=peSelection;const tmp=new Uint8ClampedArray(sel.w*sel.h*4);for(let y=0;y<sel.h;y++)for(let x=0;x<sel.w;x++){const si=((sel.y+y)*s.w+(sel.x+x))*4,di=(y*sel.w+(sel.w-1-x))*4;tmp[di]=d[si];tmp[di+1]=d[si+1];tmp[di+2]=d[si+2];tmp[di+3]=d[si+3];}for(let y=0;y<sel.h;y++)for(let x=0;x<sel.w;x++){const si=(y*sel.w+x)*4,di=((sel.y+y)*s.w+(sel.x+x))*4;d[di]=tmp[si];d[di+1]=tmp[si+1];d[di+2]=tmp[si+2];d[di+3]=tmp[si+3];}peRender();}
function peSelClear(){peSelection=null;peRender();}

// ===== PIXEL EDITOR: TRANSFORMS =====
function peFlipH(){const s=peGetActiveSprite();if(!s)return;peSaveState();const l=peGetActiveLayer();if(!l)return;const w=s.w,h=s.h;const src=document.createElement('canvas');src.width=w;src.height=h;src.getContext('2d').putImageData(l.data,0,0);const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');x.translate(w,0);x.scale(-1,1);x.drawImage(src,0,0);l.data=x.getImageData(0,0,w,h);peRefreshAll();toast('Flipped H');}
function peFlipV(){const s=peGetActiveSprite();if(!s)return;peSaveState();const l=peGetActiveLayer();if(!l)return;const w=s.w,h=s.h;const src=document.createElement('canvas');src.width=w;src.height=h;src.getContext('2d').putImageData(l.data,0,0);const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');x.translate(0,h);x.scale(1,-1);x.drawImage(src,0,0);l.data=x.getImageData(0,0,w,h);peRefreshAll();toast('Flipped V');}
function peInvertColors(){const s=peGetActiveSprite();if(!s)return;peSaveState();const l=peGetActiveLayer();if(!l)return;const d=l.data.data;for(let i=0;i<d.length;i+=4){if(d[i+3]===0)continue;d[i]=255-d[i];d[i+1]=255-d[i+1];d[i+2]=255-d[i+2];}peRefreshAll();toast('Inverted');}
function peDesaturate(){const s=peGetActiveSprite();if(!s)return;peSaveState();const l=peGetActiveLayer();if(!l)return;const d=l.data.data;for(let i=0;i<d.length;i+=4){if(d[i+3]===0)continue;const g=Math.round(d[i]*0.3+d[i+1]*0.59+d[i+2]*0.11);d[i]=d[i+1]=d[i+2]=g;}peRefreshAll();toast('Desaturated');}
function peAdjustBrightness(amt){const s=peGetActiveSprite();if(!s)return;peSaveState();const l=peGetActiveLayer();if(!l)return;const d=l.data.data;for(let i=0;i<d.length;i+=4){if(d[i+3]===0)continue;d[i]=peClamp(d[i]+amt,0,255);d[i+1]=peClamp(d[i+1]+amt,0,255);d[i+2]=peClamp(d[i+2]+amt,0,255);}peRefreshAll();toast(amt>0?'Brightened':'Darkened');}
function peOutline(){const s=peGetActiveSprite();if(!s)return;peSaveState();const l=peGetActiveLayer();if(!l)return;const d=l.data.data,w=s.w,h=s.h;const outline=[];for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4;if(d[i+3]>0)continue;const nb=[[x-1,y],[x+1,y],[x,y-1],[x,y+1]];for(const[nx,ny]of nb){if(nx>=0&&ny>=0&&nx<w&&ny<h&&d[(ny*w+nx)*4+3]>0){outline.push([x,y]);break;}}}for(const[x,y]of outline){const i=(y*w+x)*4;d[i]=peCurrentColor.r;d[i+1]=peCurrentColor.g;d[i+2]=peCurrentColor.b;d[i+3]=peCurrentColor.a;}peRefreshAll();toast('Outlined');}

// ===== PIXEL EDITOR: LAYERS =====
function peAddLayer(){const s=peGetActiveSprite();if(!s)return;peSaveState();const f=s.frames[s.activeFrame];const c=document.createElement('canvas');c.width=s.w;c.height=s.h;f.layers.splice(0,0,{name:'Layer '+(f.layers.length+1),visible:true,opacity:100,data:c.getContext('2d').createImageData(s.w,s.h)});s.activeLayer=0;peRefreshAll();}
function peDupLayer(){const s=peGetActiveSprite();if(!s)return;const f=s.frames[s.activeFrame];const src=f.layers[s.activeLayer];peSaveState();f.layers.splice(s.activeLayer,0,{name:src.name+' copy',visible:true,opacity:src.opacity||100,data:new ImageData(new Uint8ClampedArray(src.data.data),src.data.width,src.data.height)});peRefreshAll();}
function peDeleteLayer(i){const s=peGetActiveSprite();if(!s)return;const f=s.frames[s.activeFrame];if(f.layers.length<=1){toast('Need at least 1 layer');return;}peSaveState();f.layers.splice(i,1);s.activeLayer=Math.min(s.activeLayer,f.layers.length-1);peRefreshAll();}
function peMergeDown(){const s=peGetActiveSprite();if(!s)return;const f=s.frames[s.activeFrame];if(s.activeLayer>=f.layers.length-1){toast('No layer below');return;}peSaveState();const top=f.layers[s.activeLayer],bot=f.layers[s.activeLayer+1];const tc=document.createElement('canvas');tc.width=s.w;tc.height=s.h;const x=tc.getContext('2d');x.putImageData(bot.data,0,0);const topC=document.createElement('canvas');topC.width=s.w;topC.height=s.h;topC.getContext('2d').putImageData(top.data,0,0);x.globalAlpha=(top.opacity||100)/100;x.drawImage(topC,0,0);bot.data=x.getImageData(0,0,s.w,s.h);f.layers.splice(s.activeLayer,1);peRefreshAll();}
function peFlattenLayers(){const s=peGetActiveSprite();if(!s)return;const f=s.frames[s.activeFrame];if(f.layers.length<=1)return;peSaveState();const c=peCompositeFrame(s,s.activeFrame);f.layers=[{name:'Merged',visible:true,opacity:100,data:c.getContext('2d').getImageData(0,0,s.w,s.h)}];s.activeLayer=0;peRefreshAll();}

// ===== PIXEL EDITOR: FRAMES =====
function peAddFrame(){const s=peGetActiveSprite();if(!s)return;peSaveState();const c=document.createElement('canvas');c.width=s.w;c.height=s.h;s.frames.push({layers:[{name:'Layer 1',visible:true,opacity:100,data:c.getContext('2d').createImageData(s.w,s.h)}]});s.activeFrame=s.frames.length-1;s.activeLayer=0;peRefreshAll();}
function peDupFrame(){const s=peGetActiveSprite();if(!s)return;peSaveState();const src=s.frames[s.activeFrame];s.frames.splice(s.activeFrame+1,0,{layers:peCloneLayerData(src.layers)});s.activeFrame++;peRefreshAll();}
function peDeleteFrame(){const s=peGetActiveSprite();if(!s||s.frames.length<=1)return;peSaveState();s.frames.splice(s.activeFrame,1);s.activeFrame=Math.min(s.activeFrame,s.frames.length-1);s.activeLayer=0;peRefreshAll();}

// ===== PIXEL EDITOR: COLOR =====
function peSetColor(r,g,b,a){peCurrentColor={r:peClamp(r,0,255),g:peClamp(g,0,255),b:peClamp(b,0,255),a:a!==undefined?peClamp(a,0,255):255};peAddRecentColor(peHexFromRgb(peCurrentColor.r,peCurrentColor.g,peCurrentColor.b));}
function peSwapFgBg(){const t={...peCurrentColor};peCurrentColor={...peBgColor};peBgColor=t;}
function peAddRecentColor(h){peRecentColors=peRecentColors.filter(c=>c!==h);peRecentColors.unshift(h);if(peRecentColors.length>12)peRecentColors.pop();}

// ===== PIXEL EDITOR: MIRROR =====
function peToggleMirrorX(){peMirrorX=!peMirrorX;document.getElementById('peMirrorXBtn').classList.toggle('on',peMirrorX);peRender();}
function peToggleMirrorY(){peMirrorY=!peMirrorY;document.getElementById('peMirrorYBtn').classList.toggle('on',peMirrorY);peRender();}

// ===== PIXEL EDITOR: RENDER =====
let peViewportBurstFrames=0,peViewportBurstRaf=0;
function peScheduleStableRender(frames){
  const count=Math.max(1,frames||1);
  peViewportBurstFrames=Math.max(peViewportBurstFrames,count);
  if(peViewportBurstRaf)return;
  const tick=()=>{
    peViewportBurstRaf=0;
    if(!peMode){peViewportBurstFrames=0;return;}
    const cw=Math.floor(canvasWrap.clientWidth||0),ch=Math.floor(canvasWrap.clientHeight||0);
    if(cw>8&&ch>8){
      peRender();
      peViewportBurstFrames--;
    }else peViewportBurstFrames=Math.max(peViewportBurstFrames-1,8);
    if(peViewportBurstFrames>0)peViewportBurstRaf=requestAnimationFrame(tick);
  };
  peViewportBurstRaf=requestAnimationFrame(tick);
}
function peRender(){
  if(!peMode)return;
  if(peMode==='edit-sheet'){render();return;}
  peClampViewport();
  const cw=Math.floor(canvasWrap.clientWidth||0),ch=Math.floor(canvasWrap.clientHeight||0);
  if(cw<8||ch<8){
    peScheduleStableRender(12);
    return;
  }
  mainCanvas.width=cw;mainCanvas.height=ch;overlayCanvas.width=cw;overlayCanvas.height=ch;
  mainCanvas.style.width=cw+'px';mainCanvas.style.height=ch+'px';overlayCanvas.style.width=cw+'px';overlayCanvas.style.height=ch+'px';
  mCtx.fillStyle='#0a0a0d';mCtx.fillRect(0,0,cw,ch);oCtx.clearRect(0,0,cw,ch);
  if(peMode==='edit')peRenderPixel(cw,ch);
  else if(peMode==='compose')peRenderSheet(cw,ch);
}
function peDrawChecker(ctx,ox,oy,pw,ph){const cs=Math.max(4,Math.round(8*zoom));for(let y=0;y<ph;y+=cs)for(let x=0;x<pw;x+=cs){ctx.fillStyle=(Math.floor(x/cs)+Math.floor(y/cs))%2===0?'#1a1a20':'#222228';ctx.fillRect(ox+x,oy+y,cs,cs);}}
function peRenderPixel(cw,ch){
  const s=peGetActiveSprite();if(!s)return;
  peClampViewport();
  const pw=s.w*zoom,ph=s.h*zoom,ox=panX,oy=panY;
  mCtx.save();mCtx.beginPath();mCtx.rect(ox,oy,pw,ph);mCtx.clip();
  if(bgMode==='checker')peDrawChecker(mCtx,ox,oy,pw,ph);else{mCtx.fillStyle=bgMode;mCtx.fillRect(ox,oy,pw,ph);}
  mCtx.restore();
  if(peOnionSkin&&s.frames.length>1&&s.activeFrame>0){mCtx.save();mCtx.globalAlpha=peOnionOp;mCtx.imageSmoothingEnabled=false;mCtx.drawImage(peCompositeFrame(s,s.activeFrame-1),ox,oy,pw,ph);mCtx.restore();}
  mCtx.imageSmoothingEnabled=false;mCtx.drawImage(peCompositeFrame(s,s.activeFrame),ox,oy,pw,ph);
  if(zoom>=6){mCtx.save();mCtx.strokeStyle='rgba(255,255,255,0.06)';mCtx.lineWidth=0.5;for(let x=0;x<=s.w;x++){mCtx.beginPath();mCtx.moveTo(ox+x*zoom,oy);mCtx.lineTo(ox+x*zoom,oy+ph);mCtx.stroke();}for(let y=0;y<=s.h;y++){mCtx.beginPath();mCtx.moveTo(ox,oy+y*zoom);mCtx.lineTo(ox+pw,oy+y*zoom);mCtx.stroke();}mCtx.restore();}
  if(peMirrorX){oCtx.save();oCtx.strokeStyle='rgba(0,194,255,0.4)';oCtx.lineWidth=1;oCtx.setLineDash([4,4]);oCtx.beginPath();oCtx.moveTo(ox+pw/2,oy);oCtx.lineTo(ox+pw/2,oy+ph);oCtx.stroke();oCtx.restore();}
  if(peMirrorY){oCtx.save();oCtx.strokeStyle='rgba(124,92,255,0.4)';oCtx.lineWidth=1;oCtx.setLineDash([4,4]);oCtx.beginPath();oCtx.moveTo(ox,oy+ph/2);oCtx.lineTo(ox+pw,oy+ph/2);oCtx.stroke();oCtx.restore();}
  if(peSelection){oCtx.save();oCtx.strokeStyle='#fff';oCtx.lineWidth=1;oCtx.setLineDash([4,3]);oCtx.strokeRect(ox+peSelection.x*zoom,oy+peSelection.y*zoom,peSelection.w*zoom,peSelection.h*zoom);oCtx.restore();}
  if(peHoverPixel&&peTool==='eyedropper'){oCtx.save();oCtx.strokeStyle='rgba(255,255,255,0.9)';oCtx.lineWidth=1;oCtx.setLineDash([3,2]);oCtx.strokeRect(ox+peHoverPixel.x*zoom,oy+peHoverPixel.y*zoom,zoom,zoom);oCtx.restore();}
  if(peDrawing&&peDrawStart&&peDrawCurrent){
    const ox=panX,oy2=panY;
    if(peTool==='pe-line'){oCtx.save();oCtx.strokeStyle='rgba(0,194,255,0.7)';oCtx.lineWidth=1;oCtx.beginPath();oCtx.moveTo(ox+peDrawStart.px*zoom+zoom/2,oy2+peDrawStart.py*zoom+zoom/2);oCtx.lineTo(ox+peDrawCurrent.px*zoom+zoom/2,oy2+peDrawCurrent.py*zoom+zoom/2);oCtx.stroke();oCtx.restore();}
    else if(peTool==='pe-rect'||peTool==='pe-circle'||peTool==='pe-select'){
      oCtx.save();oCtx.strokeStyle=peTool==='pe-select'?'rgba(255,255,255,0.7)':'rgba(0,194,255,0.6)';oCtx.lineWidth=1;oCtx.setLineDash([3,3]);
      const sx2=ox+Math.min(peDrawStart.px,peDrawCurrent.px)*zoom,sy2=oy2+Math.min(peDrawStart.py,peDrawCurrent.py)*zoom;
      const sw2=(Math.abs(peDrawCurrent.px-peDrawStart.px)+1)*zoom,sh2=(Math.abs(peDrawCurrent.py-peDrawStart.py)+1)*zoom;
      if(peTool==='pe-circle'){const ccx=sx2+sw2/2,ccy=sy2+sh2/2;oCtx.beginPath();oCtx.ellipse(ccx,ccy,sw2/2,sh2/2,0,0,Math.PI*2);oCtx.stroke();}
      else{oCtx.strokeRect(sx2,sy2,sw2,sh2);}
      oCtx.restore();
    }
  }
  document.getElementById('imgDims').textContent=s.w+'×'+s.h+' F'+(s.activeFrame+1)+'/'+s.frames.length;
}
function peRenderSheet(cw,ch){
  peClampViewport();
  const pw=scSheetW*zoom,ph=scSheetH*zoom,ox=panX,oy=panY;
  mCtx.save();mCtx.beginPath();mCtx.rect(ox,oy,pw,ph);mCtx.clip();
  if(bgMode==='checker')peDrawChecker(mCtx,ox,oy,pw,ph);else{mCtx.fillStyle=bgMode;mCtx.fillRect(ox,oy,pw,ph);}
  mCtx.restore();
  mCtx.imageSmoothingEnabled=false;
  scSheetSprites.forEach(ss=>{
    const sp=peSprites.find(s2=>s2.id===ss.spriteId);
    if(!sp)return;
    mCtx.drawImage(peCompositeFrame(sp,0),ox+ss.x*zoom,oy+ss.y*zoom,sp.w*zoom,sp.h*zoom);
    if(ss.id===scSelectedId||scSelectedIds.has(ss.id)){oCtx.save();oCtx.strokeStyle='#7c5cff';oCtx.lineWidth=2;oCtx.strokeRect(ox+ss.x*zoom-1,oy+ss.y*zoom-1,sp.w*zoom+2,sp.h*zoom+2);oCtx.restore();}
  });
  oCtx.save();oCtx.strokeStyle='rgba(124,92,255,0.5)';oCtx.lineWidth=1;oCtx.strokeRect(ox,oy,pw,ph);oCtx.restore();
  if(scLassoActive&&scLassoPoints.length>1){oCtx.save();oCtx.strokeStyle='rgba(0,194,255,0.9)';oCtx.lineWidth=1.5;oCtx.setLineDash([4,3]);oCtx.beginPath();oCtx.moveTo(ox+scLassoPoints[0].x*zoom,oy+scLassoPoints[0].y*zoom);for(let i=1;i<scLassoPoints.length;i++)oCtx.lineTo(ox+scLassoPoints[i].x*zoom,oy+scLassoPoints[i].y*zoom);oCtx.stroke();oCtx.restore();}
  // Grid overlay
  const sg=document.getElementById('scShowGrid');
  if(sg&&sg.checked){
    const cW=parseInt(document.getElementById('scCellW')?.value)||32;
    const cH=parseInt(document.getElementById('scCellH')?.value)||32;
    oCtx.save();oCtx.strokeStyle='rgba(124,92,255,0.2)';oCtx.lineWidth=0.5;
    for(let x=0;x<=scSheetW;x+=cW){oCtx.beginPath();oCtx.moveTo(ox+x*zoom,oy);oCtx.lineTo(ox+x*zoom,oy+ph);oCtx.stroke();}
    for(let y=0;y<=scSheetH;y+=cH){oCtx.beginPath();oCtx.moveTo(ox,oy+y*zoom);oCtx.lineTo(ox+pw,oy+y*zoom);oCtx.stroke();}
    oCtx.restore();
  }
  document.getElementById('imgDims').textContent=scSheetW+'×'+scSheetH+' — '+scSheetSprites.length+' sprites';
}
function peRefreshAll(){
  peRender();
  const ub=document.getElementById('peUndoBtn'),rb=document.getElementById('peRedoBtn');
  if(ub)ub.disabled=!peUndoStack.length;
  if(rb)rb.disabled=!peRedoStack.length;
  if(peMode==='compose')scUpdateSpriteList();
  if(peMode==='edit'){peRenderSpriteList();peRenderLayerList();peRenderFrameList();peUpdateAnimMetaUi();}
  if(peMode)peScheduleStableRender(2);
}function peScreenToPixel(sx,sy){return{px:Math.floor((sx-panX)/zoom),py:Math.floor((sy-panY)/zoom)};}
function peNormalizeViewport(){
  if(!Number.isFinite(zoom)||zoom<=0)zoom=1;
  if(!Number.isFinite(panX))panX=0;
  if(!Number.isFinite(panY))panY=0;
}
function peClampViewport(){
  peNormalizeViewport();
  const cw=Math.max(1,canvasWrap.clientWidth||1),ch=Math.max(1,canvasWrap.clientHeight||1);
  const s=peGetActiveSprite();
  const w=Math.max(1,peMode==='edit'?(s?s.w:32):scSheetW);
  const h=Math.max(1,peMode==='edit'?(s?s.h:32):scSheetH);
  const pw=Math.max(1,w*zoom),ph=Math.max(1,h*zoom);
  const pad=24;

  if(pw<=cw-pad*2) panX=(cw-pw)/2;
  else {
    const minX=cw-pad-pw;
    const maxX=pad;
    panX=Math.max(minX,Math.min(maxX,panX));
  }

  if(ph<=ch-pad*2) panY=(ch-ph)/2;
  else {
    const minY=ch-pad-ph;
    const maxY=pad;
    panY=Math.max(minY,Math.min(maxY,panY));
  }
}
function peZoomAt(cx,cy,nz){
  peNormalizeViewport();
  nz=Math.max(0.25,Math.min(120,Number.isFinite(nz)?nz:zoom||1));
  const prev=Math.max(0.25,zoom||1);
  const ratio=nz/prev;
  panX=cx-(cx-panX)*ratio;
  panY=cy-(cy-panY)*ratio;
  zoom=nz;
  peClampViewport();
  const zl=document.getElementById('zoomLevel');
  if(zl)zl.textContent=Math.round(zoom*100)+'%';
  peRender();
}
function peZoomFit(){
  peNormalizeViewport();
  const cw=Math.max(1,canvasWrap.clientWidth||1),ch=Math.max(1,canvasWrap.clientHeight||1),m=40;
  const s=peGetActiveSprite();
  const w=Math.max(1,peMode==='edit'?(s?s.w:32):scSheetW), h=Math.max(1,peMode==='edit'?(s?s.h:32):scSheetH);
  zoom=Math.max(0.25,Math.min(120,Math.min((cw-m*2)/w,(ch-m*2)/h)));
  panX=(cw-w*zoom)/2;panY=(ch-h*zoom)/2;
  peClampViewport();
  const zl=document.getElementById('zoomLevel');
  if(zl)zl.textContent=Math.round(zoom*100)+'%';
  peRender();
}
function peBuildEditedPayloadFromActiveSprite(){
  const s=peGetActiveSprite();
  if(!s||!s.frames||!s.frames.length)return null;
  return{w:s.w,h:s.h,name:s.name,frames:s.frames.map((f,i)=>peCompositeFrame(s,i))};
}
function peForceCanvasRefresh(frames){
  const burst=Math.max(4,frames||8);
  requestAnimationFrame(()=>{
    if(peMode==='edit'||peMode==='compose'){peRefreshAll();peScheduleStableRender(burst);}
    else if(peMode==='edit-sheet'){render();peScheduleStableRender(burst);}
    else{if(img)render();refreshAll&&refreshAll();}
  });
  setTimeout(()=>{if(peMode==='edit'||peMode==='compose')peRender();else if(img)render();},0);
}
function peCommitModeSessionForSwitch(mode,opts){
  try{
  opts=opts||{};
  mode=mode||peMode||null;
  if(!mode){if(activeSheetId&&typeof saveSheetState==='function')saveSheetState();return true;}
  if(mode==='compose'){
    const targetId=peComposeTargetSheetId||activeSheetId;
    if(targetId)applyComposeToTargetTab(targetId,{silent:!!opts.silent});
    if(activeSheetId&&typeof saveSheetState==='function')saveSheetState();
    return true;
  }
  if(mode==='edit'){
    if(peEditSessionKind==='project')peApplyProjectEditSessionToSheet(peReturnSheetId||activeSheetId,{silent:!!opts.silent});
    else if(peReturnSpriteRef){const payload=peBuildEditedPayloadFromActiveSprite();if(payload)applyEditedSprite(peReturnSpriteRef,payload,!!opts.silent);}
    if(activeSheetId&&typeof saveSheetState==='function')saveSheetState();
    return true;
  }
  if(mode==='edit-sheet'){if(activeSheetId&&typeof saveSheetState==='function')saveSheetState();return true;}
  return true;
  }catch(err){console.error('[peCommitModeSessionForSwitch] Error:',err);return false;}
}
function peResetTransientModeState(){
  try{
  if(peAnimTimer)clearTimeout(peAnimTimer);
  peAnimPlaying=false;
  peDrawing=false;peDrawStart=null;peDrawCurrent=null;peHoverPixel=null;peSelection=null;
  scDragging=false;scDragStart=null;scDragOrigPos=null;scDragOrigAll=null;scLassoActive=false;scLassoPoints=[];
  peSprites=[];peActiveSpriteId=null;peUndoStack=[];peRedoStack=[];peMoveOrigin=null;
  const panel=document.getElementById('panel');
  const mirror=document.getElementById('peMirrorIndicator');
  if(mirror)mirror.style.display='none';
  restoreToolbarToSnip();
  if(panel&&panel.dataset.origInner){panel.innerHTML=panel.dataset.origInner;delete panel.dataset.origInner;}
  }catch(err){console.error('[peResetTransientModeState] Error:',err);}
}
function peReopenModeForSheetSwitch(mode,opts){
  try{
  opts=opts||{};
  if(opts.sameSheet){peForceCanvasRefresh(10);return;}
  peMode=null;
  peResetTransientModeState();
  if(mode==='compose')openComposeForCurrentSheet();
  else if(mode==='edit'||mode==='edit-sheet'){
    const selectedId=selectedSpriteIds.size===1?[...selectedSpriteIds][0]:null;
    if((sprites&&sprites.length)||selectedId!=null)peEnterProjectEditMode(activeSheetId,selectedId);
    else enterSheetEditMode();
  } else {showSheetWorkspace();render();refreshAll();}
  peForceCanvasRefresh(12);
  }catch(err){console.error('[peReopenModeForSheetSwitch] Error:',err);peMode=null;restoreToolbarToSnip();updateModeIndicator();}
}

// ===== MODE SWITCHING: SNIP <-> EDIT <-> COMPOSE =====
function saveSnipState(){
  savedSnipState={panX,panY,zoom,tool,bgMode};
}
function restoreSnipState(){
  if(savedSnipState){panX=savedSnipState.panX;panY=savedSnipState.panY;zoom=savedSnipState.zoom;bgMode=savedSnipState.bgMode;
    if(img&&sheets.length)setTool(savedSnipState.tool);else tool=savedSnipState.tool;}
  savedSnipState=null;
}

function updateModeIndicator(){
  const mi=document.getElementById('modeIndicator');
  mi.style.display=(img||peMode)?'flex':'none';
  document.getElementById('snipModeBadge').classList.toggle('active',!peMode);
  document.getElementById('editModeBadge').classList.toggle('active',peMode==='edit'||peMode==='edit-sheet');
  document.getElementById('composeModeBadge').classList.toggle('active',peMode==='compose');
  if(typeof updateActiveToolLabel==='function')updateActiveToolLabel();
}

function switchToMode(mode){
  const currentMode=peMode||'snip';
  if(mode===currentMode)return;
  
  // If already in snip, go directly to the target mode
  if(!peMode){
    if(mode==='edit'){
      if(!img&&!sheets.length){peNewPixelArt();return;}
      const selectedId=selectedSpriteIds.size===1?[...selectedSpriteIds][0]:null;
      if((sprites&&sprites.length)||selectedId!=null) peEnterProjectEditMode(activeSheetId,selectedId);
      else enterSheetEditMode();
    } else if(mode==='compose'){
      openComposeForCurrentSheet();
    }
    return;
  }
  
  // We're in a non-snip mode. Use returnToSnipMode (proven to work via Escape key),
  // then enter the target mode after the return completes.
  if(mode==='snip'){
    returnToSnipMode();
    return;
  }
  
  // For edit→compose or compose→edit or any→other:
  // Return to snip first, then enter the new mode on next frame
  returnToSnipMode();
  
  // Use requestAnimationFrame to let returnToSnipMode finish DOM updates
  requestAnimationFrame(()=>{
    // Double-check we're actually back in snip
    if(peMode){
      // Force-clear if returnToSnipMode didn't fully clean up
      peMode=null;peSprites=[];peActiveSpriteId=null;
      document.getElementById('peMirrorIndicator').style.display='none';
      restoreToolbarToSnip();
      const panel=document.getElementById('panel');
      if(panel.dataset.origInner){panel.innerHTML=panel.dataset.origInner;delete panel.dataset.origInner;}
      if(img&&sheets.length){panel.style.display='flex';render();refreshAll();}
      updateModeIndicator();
    }
    
    if(mode==='edit'){
      if(!img&&!sheets.length)return;
      const selectedId=selectedSpriteIds.size===1?[...selectedSpriteIds][0]:null;
      if((sprites&&sprites.length)||selectedId!=null) peEnterProjectEditMode(activeSheetId,selectedId);
      else enterSheetEditMode();
    } else if(mode==='compose'){
      openComposeForCurrentSheet();
    }
  });
}

// ===== SHEET EDIT MODE — draw directly on the sheet image =====
function enterSheetEditMode(){
  if(peMode&&peMode!=='snip')return;
  peMode='edit-sheet';
  peUndoStack=[];peRedoStack=[];
  peBrushSz=1;peTool='pencil';
  // Save toolbar + panel, swap to edit tools
  swapToolbarToEdit();
  const panel=document.getElementById('panel');
  panel.dataset.origInner=panel.innerHTML;
  showEditPanel();
  document.getElementById('peMirrorIndicator').style.display='flex';
  updateModeIndicator();
  setStatus('Sheet edit mode — paint directly on the sprite sheet');
  toast('Draw on the sheet — sprite boxes shown as guides');
  render();
}

// Override render to add edit-sheet drawing tools overlay
const _origRenderFn=render;
// For sheet edit mode, we need undo that saves/restores the image data
function peSheetSaveState(){
  const tc=document.createElement('canvas');tc.width=imgW;tc.height=imgH;
  tc.getContext('2d').drawImage(img,0,0);
  peUndoStack.push({t:'sheet',dataUrl:tc.toDataURL('image/png')});
  if(peUndoStack.length>PE_MAX_UNDO)peUndoStack.shift();peRedoStack=[];
}
function peSheetUndo(){
  if(!peUndoStack.length)return;
  // Save current to redo
  const tc=document.createElement('canvas');tc.width=imgW;tc.height=imgH;
  tc.getContext('2d').drawImage(img,0,0);
  peRedoStack.push({t:'sheet',dataUrl:tc.toDataURL('image/png')});
  const st=peUndoStack.pop();
  const ni=new Image();ni.onload=()=>{img=ni;const sh=sheets.find(s=>s.id===activeSheetId);if(sh)sh.img=ni;render();peRefreshAll();};
  ni.src=st.dataUrl;
}
function peSheetRedo(){
  if(!peRedoStack.length)return;
  const tc=document.createElement('canvas');tc.width=imgW;tc.height=imgH;
  tc.getContext('2d').drawImage(img,0,0);
  peUndoStack.push({t:'sheet',dataUrl:tc.toDataURL('image/png')});
  const st=peRedoStack.pop();
  const ni=new Image();ni.onload=()=>{img=ni;const sh=sheets.find(s=>s.id===activeSheetId);if(sh)sh.img=ni;render();peRefreshAll();};
  ni.src=st.dataUrl;
}

// Sheet edit drawing — modifies img directly via a temp canvas
function peSheetDrawPixel(px,py,erase){
  if(px<0||py<0||px>=imgW||py>=imgH)return;
  const tc=document.createElement('canvas');tc.width=imgW;tc.height=imgH;
  const tx=tc.getContext('2d');tx.drawImage(img,0,0);
  const half=Math.floor(peBrushSz/2);
  for(let dy=0;dy<peBrushSz;dy++)for(let dx=0;dx<peBrushSz;dx++){
    const bx=px-half+dx,by=py-half+dy;
    if(bx<0||by<0||bx>=imgW||by>=imgH)continue;
    if(erase){tx.clearRect(bx,by,1,1);}
    else{tx.fillStyle='rgba('+peCurrentColor.r+','+peCurrentColor.g+','+peCurrentColor.b+','+(peCurrentColor.a/255)+')';tx.fillRect(bx,by,1,1);}
    if(peMirrorX){const mx=imgW-1-bx;if(erase)tx.clearRect(mx,by,1,1);else tx.fillRect(mx,by,1,1);}
    if(peMirrorY){const my=imgH-1-by;if(erase)tx.clearRect(bx,my,1,1);else tx.fillRect(bx,my,1,1);}
    if(peMirrorX&&peMirrorY){const mx=imgW-1-bx,my=imgH-1-by;if(erase)tx.clearRect(mx,my,1,1);else tx.fillRect(mx,my,1,1);}
  }
  const ni=new Image();ni.onload=()=>{img=ni;const sh=sheets.find(s=>s.id===activeSheetId);if(sh)sh.img=ni;render();};
  ni.src=tc.toDataURL('image/png');
}

let peSheetDrawing=false,peSheetDrawStart=null,peSheetLastPx=-1,peSheetLastPy=-1;
function peSheetHandleDown(e){
  if(pinchZoomActive)return;
  const pos=getEventPos(e);
  if(peTool==='pan'||spaceHeld||e.button===1){isPanning=true;panStart=pos;lastPanX=panX;lastPanY=panY;canvasWrap.classList.add('panning');return;}
  if(e.button&&e.button!==0)return;
  const p=screenToPixel(pos.x,pos.y);
  if(peTool==='eyedropper'){
    const tc=document.createElement('canvas');tc.width=imgW;tc.height=imgH;
    tc.getContext('2d').drawImage(img,0,0);
    const d=tc.getContext('2d').getImageData(0,0,imgW,imgH).data;
    const i=(p.py*imgW+p.px)*4;
    peSetColor(d[i],d[i+1],d[i+2],d[i+3]);peUpdateColorUI();toast('Picked '+peHexFromRgb(d[i],d[i+1],d[i+2])+' @ '+p.px+','+p.py);
    return;
  }
  if(peTool==='fill'){
    peSheetSaveState();
    // Flood fill on the sheet image
    const tc=document.createElement('canvas');tc.width=imgW;tc.height=imgH;
    const tx=tc.getContext('2d');tx.drawImage(img,0,0);
    const d=tx.getImageData(0,0,imgW,imgH);const dd=d.data;
    const ti=(p.py*imgW+p.px)*4;
    const tr=dd[ti],tg=dd[ti+1],tb=dd[ti+2],ta=dd[ti+3];
    const fr=peCurrentColor.r,fg=peCurrentColor.g,fb=peCurrentColor.b,fa=peCurrentColor.a;
    if(tr===fr&&tg===fg&&tb===fb&&ta===fa)return;
    const stk=[[p.px,p.py]],vis=new Set();
    while(stk.length){const[x,y]=stk.pop();const k=x+','+y;if(vis.has(k))continue;vis.add(k);
      if(x<0||y<0||x>=imgW||y>=imgH)continue;
      const ci=(y*imgW+x)*4;
      if(dd[ci]!==tr||dd[ci+1]!==tg||dd[ci+2]!==tb||dd[ci+3]!==ta)continue;
      dd[ci]=fr;dd[ci+1]=fg;dd[ci+2]=fb;dd[ci+3]=fa;
      stk.push([x+1,y],[x-1,y],[x,y+1],[x,y-1]);
    }
    tx.putImageData(d,0,0);
    const ni=new Image();ni.onload=()=>{img=ni;const sh=sheets.find(s=>s.id===activeSheetId);if(sh)sh.img=ni;render();peRefreshAll();};
    ni.src=tc.toDataURL('image/png');
    return;
  }
  peSheetDrawing=true;peSheetDrawStart=p;peSheetLastPx=p.px;peSheetLastPy=p.py;
  if(peTool==='pencil'||peTool==='eraser'){peSheetSaveState();peSheetDrawPixel(p.px,p.py,peTool==='eraser');}
}
function peSheetHandleMove(e){
  const pos=getEventPos(e),p=screenToPixel(pos.x,pos.y);
  if(peTool==='eyedropper'&&p.px>=0&&p.py>=0&&p.px<imgW&&p.py<imgH){const tc=document.createElement('canvas');tc.width=imgW;tc.height=imgH;tc.getContext('2d').drawImage(img,0,0);const dd=tc.getContext('2d').getImageData(0,0,imgW,imgH).data;const i=(p.py*imgW+p.px)*4;const hex=peHexFromRgb(dd[i],dd[i+1],dd[i+2]);document.getElementById('coordInfo').textContent=p.px+', '+p.py+' · '+hex+' · a'+dd[i+3];setStatus('Eyedropper — '+hex+' @ '+p.px+','+p.py);}else document.getElementById('coordInfo').textContent=p.px+', '+p.py;
  if(isPanning){panX=lastPanX+(pos.x-panStart.x);panY=lastPanY+(pos.y-panStart.y);render();return;}
  if(!peSheetDrawing)return;
  if(peTool==='pencil'||peTool==='eraser'){
    // Bresenham line from last to current
    let x0=peSheetLastPx,y0=peSheetLastPy,x1=p.px,y1=p.py;
    const ddx=Math.abs(x1-x0),ddy=Math.abs(y1-y0),sx=x0<x1?1:-1,sy=y0<y1?1:-1;
    let err=ddx-ddy;
    while(true){
      peSheetDrawPixel(x0,y0,peTool==='eraser');
      if(x0===x1&&y0===y1)break;
      const e2=2*err;if(e2>-ddy){err-=ddy;x0+=sx;}if(e2<ddx){err+=ddx;y0+=sy;}
    }
    peSheetLastPx=p.px;peSheetLastPy=p.py;
  }
}
function peSheetHandleUp(e){
  if(isPanning){isPanning=false;canvasWrap.classList.remove('panning');return;}
  if(!peSheetDrawing)return;
  peSheetDrawing=false;peSheetDrawStart=null;peRefreshAll();
}

function enterEditMode(spriteData,returnSheetId,returnSpriteRef){
  if(peMode&&peMode!=='snip')return;
  saveSnipState();
  peMode='edit';
  peEditSessionKind='single';
  peProjectSourceSheetId=null;
  peProjectOriginalSpriteRefs=[];
  peReturnSheetId=returnSheetId||activeSheetId;
  peReturnSpriteRef=returnSpriteRef||null;
  let sp;
  if(spriteData.frames&&spriteData.frames.length){
    sp={id:peNextSpriteId++,name:spriteData.name||'sprite_'+peNextSpriteId,w:spriteData.w,h:spriteData.h,frames:peCloneFrameData(spriteData.frames),activeFrame:spriteData.activeFrame||0,activeLayer:spriteData.activeLayer||0};
    if(spriteData._frameRefs)sp._frameRefs=spriteData._frameRefs.map(r=>({...r,tags:r.tags?{...r.tags}:{}}));
  }else{
    sp=peCreateSpriteData(spriteData.w,spriteData.h,spriteData.name,spriteData.imageData);
  }
  peSprites=[sp]; peActiveSpriteId=sp.id;
  peUndoStack=[];peRedoStack=[];peTool='pencil';
  // Hide snip UI, show edit UI
  document.getElementById('panel').style.display='none';
  document.getElementById('toolbar').style.display='flex';
  document.getElementById('bottomBar').style.display='flex';
  document.getElementById('dropzone').style.display='none';
  canvasWrap.classList.remove('dropzone-visible');
  updateModeIndicator();
  // Swap toolbar content
  swapToolbarToEdit();
  showEditPanel();
  peZoomFit();
  document.getElementById('peMirrorIndicator').style.display='flex';
  setStatus('Editing: '+spriteData.name);
  if(typeof updateActiveToolLabel==='function')updateActiveToolLabel();
  toast('Editing sprite — use tools to paint, Esc to return');
}

function enterComposeMode(){
  if(peMode&&peMode!=='snip')return;
  saveSnipState();
  peMode='compose';
  peEditSessionKind='single';
  peProjectSourceSheetId=null;
  peProjectOriginalSpriteRefs=[];
  peUndoStack=[];peRedoStack=[];peTool='sc-select';scSelectedIds=new Set();
  document.getElementById('panel').style.display='none';
  document.getElementById('toolbar').style.display='flex';
  document.getElementById('bottomBar').style.display='flex';
  document.getElementById('dropzone').style.display='none';
  canvasWrap.classList.remove('dropzone-visible');
  updateModeIndicator();
  swapToolbarToCompose();
  showComposePanel();
  peZoomFit();
  if(typeof updateActiveToolLabel==='function')updateActiveToolLabel();
  setStatus('Compose mode — add sprites and arrange them on the sheet');
}

function returnToSnipMode(){
  if(!peMode)return;
  const wasEdit=peMode==='edit';
  const wasCompose=peMode==='compose';
  const wasEditSheet=peMode==='edit-sheet';
  const panel=document.getElementById('panel');
  
  if(wasEditSheet){
    peMode=null;
    restoreToolbarToSnip();
    document.getElementById('peMirrorIndicator').style.display='none';
    const panel=document.getElementById('panel');
    if(panel.dataset.origInner){panel.innerHTML=panel.dataset.origInner;delete panel.dataset.origInner;}
    showSheetWorkspace();
    render();refreshAll();updateModeIndicator();
    setStatus('Back to Snip mode');
    return;
  }
  
  if(panel&&panel.dataset.origInner){
    panel.innerHTML=panel.dataset.origInner;
    delete panel.dataset.origInner;
    panel.style.display='flex';
    panel.classList.toggle('collapsed',!!panelCollapsed);
  }
  
  let editedPayload=null,editRef=null;
  if(wasEdit&&peEditSessionKind==='project'){
    peApplyProjectEditSessionToSheet(peReturnSheetId||activeSheetId);
  } else if(wasEdit&&peReturnSpriteRef){
    const s=peGetActiveSprite();
    if(s){
      editedPayload={
        w:s.w,h:s.h,name:s.name,
        frames:s.frames.map((f,i)=>peCompositeFrame(s,i))
      };
      editRef=peReturnSpriteRef;
    }
  }
  
  let composeTargetId=peComposeTargetSheetId;
  let didApplyCompose=false;
  if(wasCompose&&composeTargetId){
    applyComposeToTargetTab(composeTargetId);
    didApplyCompose=true;
  } else if(wasCompose&&scSheetSprites.length){
    exportComposeAsTab();
    didApplyCompose=true;
  }
  
  peMode=null;
  peSprites=[];peActiveSpriteId=null;peAnimPlaying=false;
  peComposeTargetSheetId=null;
  peEditSessionKind='single';
  peProjectSourceSheetId=null;
  peProjectOriginalSpriteRefs=[];
  if(peAnimTimer)clearTimeout(peAnimTimer);
  updateModeIndicator();
  document.getElementById('peMirrorIndicator').style.display='none';
  restoreToolbarToSnip();
  
  if(panel&&panel.dataset.origInner){panel.innerHTML=panel.dataset.origInner;delete panel.dataset.origInner;}
  restoreSnipState();
  
  if(editedPayload&&editRef){applyEditedSprite(editRef,editedPayload);}
  
  if(didApplyCompose&&composeTargetId&&sheets.find(s=>s.id===composeTargetId)){
    switchSheet(composeTargetId);
    panel.style.display='flex';
    if(panelCollapsed)panel.classList.add('collapsed');else panel.classList.remove('collapsed');
    render();refreshAll();
  } else if(img&&sheets.length){
    panel.style.display='flex';
    if(panelCollapsed)panel.classList.add('collapsed');else panel.classList.remove('collapsed');
    render();refreshAll();
  } else {
    showEmptyWorkspace();
  }
  if(typeof updateActiveToolLabel==='function')updateActiveToolLabel();
  setStatus(img||sheets.length?'Back to Snip mode':'Load a sprite sheet to begin');
}

function swapToolbarToEdit(){
  const tb=document.getElementById('toolbar');
  tb.dataset.origHtml=tb.innerHTML;
  // peRectFilled/peCircleFilled track fill state for combined buttons
  if(typeof peRectFilled==='undefined')peRectFilled=true;
  if(typeof peCircleFilled==='undefined')peCircleFilled=true;
  tb.innerHTML=`
    <button class="tool-btn active" data-tool="pencil" onclick="peSetTool('pencil')"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg><div class="tt">Pencil — draw pixels (B)</div></button>
    <button class="tool-btn" data-tool="eraser" onclick="peSetTool('eraser')"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M20 20H7L3 16a1.5 1.5 0 0 1 0-2l11-11a1.5 1.5 0 0 1 2 0l5 5a1.5 1.5 0 0 1 0 2L13 18"/></svg><div class="tt">Eraser — clear pixels (E)</div></button>
    <button class="tool-btn" data-tool="fill" onclick="peSetTool('fill')"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M19 13c1.5 2 2 4 2 5.5a2.5 2.5 0 0 1-5 0c0-1.5.5-3.5 2-5.5l.5-.5z" fill="currentColor" opacity=".3"/><path d="M2 22l1-1h3l9-9M15 8l-4 4M17.5 2.5a2.12 2.12 0 0 1 3 3l-2 2-3-3 2-2z"/></svg><div class="tt">Fill Bucket — flood fill area (G)</div></button>
    <button class="tool-btn" data-tool="eyedropper" onclick="peSetTool('eyedropper')"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M2 22l1-1h3l9-9M15 8l-4 4M17.5 2.5a2.12 2.12 0 0 1 3 3l-2 2-3-3 2-2z"/></svg><div class="tt">Eyedropper — pick color from canvas (I)</div></button>
    <button class="tool-btn" data-tool="dither" onclick="peSetTool('dither')"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="7" cy="7" r="1" fill="currentColor"/><circle cx="13" cy="13" r="1" fill="currentColor"/><circle cx="17" cy="7" r="1" fill="currentColor"/><circle cx="7" cy="13" r="1" fill="currentColor"/></svg><div class="tt">Dither — checkerboard pattern paint (D)</div></button>
    <div class="tool-sep"></div>
    <button class="tool-btn" data-tool="pe-line" onclick="peSetTool('pe-line')"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><line x1="5" y1="19" x2="19" y2="5"/></svg><div class="tt">Line — drag to draw a line (L)</div></button>
    <button class="tool-btn" data-tool="pe-rect" onclick="peSetTool('pe-rect')"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><rect x="4" y="4" width="16" height="16" rx="1"/><rect x="4" y="4" width="16" height="16" rx="1" fill="currentColor" opacity=".15"/></svg><div class="tt">Rectangle — click to toggle fill (R)</div></button>
    <button class="tool-btn" data-tool="pe-circle" onclick="peSetTool('pe-circle')"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="9" fill="currentColor" opacity=".15"/></svg><div class="tt">Circle / Ellipse — click to toggle fill (C)</div></button>
    <div class="tool-sep"></div>
    <button class="tool-btn" data-tool="pe-select" onclick="peSetTool('pe-select')"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><rect x="4" y="4" width="16" height="16" rx="1.5" stroke-dasharray="3 2"/></svg><div class="tt">Selection — draw box to select region (S)</div></button>
    <button class="tool-btn" data-tool="pe-move" onclick="peSetTool('pe-move')"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M5 9l-3 3 3 3M2 12h8M19 9l3 3-3 3M14 12h8M9 5l3-3 3 3M12 2v8M9 19l3 3 3-3M12 14v8"/></svg><div class="tt">Move — drag selection or all pixels (V)</div></button>
    <div class="tool-sep"></div>
    <button class="tool-btn" data-tool="pan" onclick="peSetTool('pan')"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M18 11V6a2 2 0 0 0-4 0M14 10V4a2 2 0 0 0-4 0v7M10 10.5V8a2 2 0 0 0-4 0v6M18 11a2 2 0 0 1 4 0v3a8 8 0 0 1-8 8h-2c-2.5 0-4.5-1-5.5-2.5L3 14a2 2 0 0 1 3-1l2 2"/></svg><div class="tt">Pan — drag to scroll view (Space)</div></button>
    <div class="tool-sep"></div>
    <button class="tool-btn" id="peUndoBtn" disabled onclick="peUndo()"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-5.36L1 10"/></svg><div class="tt">Undo (Ctrl+Z)</div></button>
    <button class="tool-btn" id="peRedoBtn" disabled onclick="peRedo()"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.13-5.36L23 10"/></svg><div class="tt">Redo (Ctrl+Y)</div></button>
    <div class="tool-sep"></div>
    <button class="tool-btn" onclick="peZoomFit()"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><polyline points="21 15 21 21 15 21"/><polyline points="3 9 3 3 9 3"/></svg><div class="tt">Zoom to Fit (F)</div></button>
    <div style="flex:1"></div>
    <button class="tool-btn" id="pePanelToggle" onclick="peTogglePanel()"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="15" y1="3" x2="15" y2="21"/></svg><div class="tt">Toggle Side Panel (Tab)</div></button>
  `;
  peUpdateFillIndicators();
}
let peRectFilled=true, peCircleFilled=true;
function peUpdateFillIndicators(){
  const rb=document.querySelector('[data-tool="pe-rect"]');
  const cb=document.querySelector('[data-tool="pe-circle"]');
  if(rb){
    const svgs=rb.querySelectorAll('svg *[fill]');
    svgs.forEach(el=>{if(el.getAttribute('fill')==='currentColor')el.setAttribute('opacity',peRectFilled?'0.35':'0');});
    const tt=rb.querySelector('.tt');
    if(tt)tt.textContent='Rectangle '+(peRectFilled?'(filled)':'(outline)')+' — click again to toggle (R)';
  }
  if(cb){
    const svgs=cb.querySelectorAll('svg *[fill]');
    svgs.forEach(el=>{if(el.getAttribute('fill')==='currentColor')el.setAttribute('opacity',peCircleFilled?'0.35':'0');});
    const tt=cb.querySelector('.tt');
    if(tt)tt.textContent='Circle '+(peCircleFilled?'(filled)':'(outline)')+' — click again to toggle (C)';
  }
}
function peSyncEditorUiState(opts){
  opts=opts||{};
  const t=peTool||'pencil';
  document.querySelectorAll('.tool-btn[data-tool]').forEach(b=>{
    b.classList.toggle('active',b.dataset.tool===t);
    if(opts.flash&&b.dataset.tool===t){
      b.classList.remove('tt-flash');
      requestAnimationFrame(()=>{b.classList.add('tt-flash');setTimeout(()=>b.classList.remove('tt-flash'),1400);});
    } else b.classList.remove('tt-flash');
  });
  const cursors={pencil:'crosshair',eraser:'crosshair',fill:'crosshair',eyedropper:'crosshair',dither:'crosshair','pe-line':'crosshair','pe-rect':'crosshair','pe-circle':'crosshair','pe-select':'crosshair','pe-move':'move',pan:'grab','sc-select':'default','sc-lasso':'crosshair'};
  canvasWrap.style.cursor=cursors[t]||'crosshair';
  canvasWrap.className='canvas-wrap'+(t==='pan'?' panning':'');
  const desc={pencil:'Pencil — draw pixels',eraser:'Eraser — clear pixels',fill:'Fill Bucket — flood fill',eyedropper:'Eyedropper — hover or click to pick color',dither:'Dither — checkerboard pattern','pe-line':'Line — drag start to end','pe-rect':'Rectangle'+(peRectFilled?' (filled)':' (outline)')+'  — click again to toggle','pe-circle':'Circle'+(peCircleFilled?' (filled)':' (outline)')+' — click again to toggle','pe-select':'Selection — drag to select region','pe-move':'Move — drag to reposition pixels',pan:'Pan — drag to scroll view','sc-select':'Select & Move — click sprites on canvas to select, drag to move','sc-lasso':'Lasso Select — draw around sprites to select them'};
  if(!opts.skipStatus)setStatus(desc[t]||t);
  const mxBtn=document.getElementById('peMirrorXBtn');if(mxBtn)mxBtn.classList.toggle('on',!!peMirrorX);
  const myBtn=document.getElementById('peMirrorYBtn');if(myBtn)myBtn.classList.toggle('on',!!peMirrorY);
  if(typeof peUpdateFillIndicators==='function')peUpdateFillIndicators();
  if(typeof peUpdateColorUI==='function')peUpdateColorUI();
  if(typeof peRenderPalette==='function')peRenderPalette();
  if(typeof peRenderRecentColors==='function')peRenderRecentColors();
  const sa=document.getElementById('peSelActions');
  if(sa)sa.style.display=(peMode==='edit'&&peSelection)?'flex':'none';
  if(typeof updateActiveToolLabel==='function')updateActiveToolLabel();
}
function peTogglePanel(){
  const p=document.getElementById('panel');
  const opening=p.style.display==='none'||p.classList.contains('collapsed');
  p.style.display='flex';
  p.classList.toggle('collapsed',!opening);
  panelCollapsed=!opening;
  peScheduleStableRender(18);
  setTimeout(()=>peScheduleStableRender(12),240);
}

function swapToolbarToCompose(){
  const tb=document.getElementById('toolbar');
  tb.dataset.origHtml=tb.innerHTML;
  tb.innerHTML=`
    <button class="tool-btn active" data-tool="sc-select" onclick="peSetTool('sc-select')"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51z"/></svg><div class="tt">Select/Move (V)</div></button>
    <button class="tool-btn" data-tool="sc-lasso" onclick="peSetTool('sc-lasso')"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M4 7c0-2 2-4 5-4 2.5 0 4 1.3 4 3 0 3-5 2-5 6 0 2 1.5 4 4 4 3.5 0 6-2.5 6-6 0-1.5-.4-2.9-1.1-4"/><path d="M16 16l4 4"/></svg><div class="tt">Lasso Select (L)</div></button>
    <div class="tool-sep"></div>
    <button class="tool-btn" data-tool="pan" onclick="peSetTool('pan')"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M18 11V6a2 2 0 0 0-4 0M14 10V4a2 2 0 0 0-4 0v7M10 10.5V8a2 2 0 0 0-4 0v6M18 11a2 2 0 0 1 4 0v3a8 8 0 0 1-8 8h-2c-2.5 0-4.5-1-5.5-2.5L3 14a2 2 0 0 1 3-1l2 2"/></svg><div class="tt">Pan (Space)</div></button>
    <div class="tool-sep"></div>
    <button class="tool-btn" onclick="peZoomFit()"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/></svg><div class="tt">Zoom to Fit (F)</div></button>
    <div class="tool-sep"></div>
    <button class="tool-btn" id="peUndoBtn" disabled onclick="peUndo()"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-5.36L1 10"/></svg><div class="tt">Undo (Ctrl+Z)</div></button>
    <button class="tool-btn" id="peRedoBtn" disabled onclick="peRedo()"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.13-5.36L23 10"/></svg><div class="tt">Redo (Ctrl+Y)</div></button>
    <div style="flex:1"></div>
    <button class="tool-btn" onclick="scExportSheet()"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg><div class="tt">Export Sheet as PNG</div></button>
    <button class="tool-btn" onclick="peTogglePanel()"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="15" y1="3" x2="15" y2="21"/></svg><div class="tt">Toggle Panel (Tab)</div></button>
  `;
}

function restoreToolbarToSnip(){
  const tb=document.getElementById('toolbar');
  if(tb.dataset.origHtml){tb.innerHTML=tb.dataset.origHtml;delete tb.dataset.origHtml;}
}

function showEditPanel(){
  const panel=document.getElementById('panel');
  panel.style.display='flex';
  panel.classList.toggle('collapsed',!!panelCollapsed);
  panel.dataset.origInner=panel.innerHTML;
  panel.innerHTML=`<div class="tabs"><div class="tab active" data-tab="peSprites" onclick="peSwitchTab('peSprites')">Sprites</div><div class="tab" data-tab="peColors" onclick="peSwitchTab('peColors')">Colors</div><div class="tab" data-tab="peLayers" onclick="peSwitchTab('peLayers')">Layers</div><div class="tab" data-tab="peFrames" onclick="peSwitchTab('peFrames')">Frames</div></div>
  <div id="peSpritesTab" style="flex:1;display:flex;flex-direction:column;overflow:hidden;min-height:0;">
    <div style="display:flex;gap:3px;flex-wrap:wrap;padding:6px 8px;border-bottom:1px solid var(--border)"><button class="btn sm primary" onclick="peAddSpriteAsset()">+ Sprite</button></div>
    <div id="peSpritesSelActions" style="display:none;gap:3px;flex-wrap:wrap;padding:4px 8px;border-bottom:1px solid var(--border)"><button class="btn sm" onclick="peDuplicateSpriteAsset()">Dup</button><button class="btn sm danger" onclick="peDeleteSpriteAsset()">Del</button><button class="btn sm" onclick="peRenameActiveAsset()">Rename</button><button class="btn sm" onclick="peClearActiveAssetSelection()">None</button></div>
    <div id="peSpriteCount" style="padding:3px 8px;font-family:var(--font-mono);font-size:9px;color:var(--text2);border-bottom:1px solid var(--border)">0 assets</div>
    <div id="peSpriteList" style="flex:1;overflow-y:auto;padding:4px 8px"></div>
  </div>
  <div id="peColorsTab" style="display:none;flex:1;overflow-y:auto;min-height:0;">
    <div class="pe-color-area">
      <div class="pe-color-row"><div class="pe-color-preview" id="peColorPreview" onclick="document.getElementById('peMainColorPicker').click()"><div class="fg" id="peColorPreviewFg"></div></div><input type="color" id="peMainColorPicker" style="display:none" onchange="var c=peRgbFromHex(this.value);peSetColor(c.r,c.g,c.b,peCurrentColor.a);peUpdateColorUI()"><input type="text" class="color-hex" id="peColorHex" value="#000000" onchange="var c=peRgbFromHex(this.value);peSetColor(c.r,c.g,c.b,peCurrentColor.a);peUpdateColorUI()" maxlength="7" style="width:72px;font-family:var(--font-mono);font-size:11px;background:var(--surface2);border:1px solid var(--border);border-radius:4px;padding:3px 6px;color:var(--text);"><button class="btn sm" onclick="peSwapFgBg();peUpdateColorUI()" title="Swap foreground/background (X)">⇄</button></div>
      <div style="display:flex;flex-direction:column;gap:2px;margin-top:4px"><div class="pe-csl"><label>R</label><input type="range" id="peSliderR" min="0" max="255" value="0" oninput="peSetColorFromSliders()"><input type="number" id="peNumR" min="0" max="255" value="0" oninput="peSetColorFromSliders()"></div><div class="pe-csl"><label>G</label><input type="range" id="peSliderG" min="0" max="255" value="0" oninput="peSetColorFromSliders()"><input type="number" id="peNumG" min="0" max="255" value="0" oninput="peSetColorFromSliders()"></div><div class="pe-csl"><label>B</label><input type="range" id="peSliderB" min="0" max="255" value="0" oninput="peSetColorFromSliders()"><input type="number" id="peNumB" min="0" max="255" value="0" oninput="peSetColorFromSliders()"></div><div class="pe-csl"><label>A</label><input type="range" id="peSliderA" min="0" max="255" value="255" oninput="peSetColorFromSliders()"><input type="number" id="peNumA" min="0" max="255" value="255" oninput="peSetColorFromSliders()"></div></div>
      <div class="pe-brush-row"><label>Brush</label><input type="range" id="peBrushSize" min="1" max="16" value="1" oninput="peBrushSz=+this.value;document.getElementById('peBrushSizeVal').textContent=this.value"><span id="peBrushSizeVal">1</span><span style="font-family:var(--font-mono);font-size:8px;color:var(--text2)">px</span></div>
    </div>
    <div style="padding:4px 8px"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:2px"><span style="font-family:var(--font-mono);font-size:9px;color:var(--text2)">Recent</span></div><div class="pe-recent-colors" id="peRecentColors"></div></div>
    <div style="padding:4px 8px;border-top:1px solid var(--border)"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:3px"><span style="font-family:var(--font-mono);font-size:9px;color:var(--text2)">Palette</span><div style="display:flex;gap:2px"><button class="btn sm" onclick="pePalette=[...PE_PALETTES.pico8];peRenderPalette();toast('PICO-8')" style="padding:2px 5px;font-size:8px">P8</button><button class="btn sm" onclick="pePalette=[...PE_PALETTES.db32];peRenderPalette();toast('DB32')" style="padding:2px 5px;font-size:8px">DB32</button><button class="btn sm" onclick="pePalette=[...PE_PALETTES.nes];peRenderPalette();toast('NES')" style="padding:2px 5px;font-size:8px">NES</button></div></div><div class="pe-palette-grid" id="pePaletteGrid"></div></div>
    <div class="pe-sel-actions" id="peSelActions" style="display:none"><span style="font-family:var(--font-mono);font-size:9px;color:#00c2ff;margin-right:4px">Selection:</span><button class="btn sm" onclick="peSelCopy()">Copy</button><button class="btn sm" onclick="peSelCut()">Cut</button><button class="btn sm" onclick="peSelPaste()">Paste</button><button class="btn sm danger" onclick="peSelDelete()">Del</button><button class="btn sm" onclick="peSelFlipH()">Flip</button><button class="btn sm" onclick="peSelClear()">Desel</button></div>
    <div style="padding:6px 8px;border-top:1px solid var(--border)">
      <div style="font-family:var(--font-mono);font-size:9px;color:var(--text2);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:5px">Transform</div>
      <div style="display:flex;gap:3px;flex-wrap:wrap;margin-bottom:6px">
        <button class="btn sm" onclick="peFlipH()">Flip H</button>
        <button class="btn sm" onclick="peFlipV()">Flip V</button>
        <button class="btn sm" onclick="peOutline()">Outline</button>
        <button class="btn sm" onclick="peResizeCanvas()">Resize</button>
      </div>
      <button class="btn sm primary" onclick="peShowHueShift()" style="width:100%;justify-content:center">Adjust / Recolor...</button>
    </div>
  </div>
  <div id="peLayersTab" style="display:none;flex:1;overflow:hidden;flex-direction:column;min-height:0;">
    <div style="display:flex;gap:3px;flex-wrap:wrap;padding:6px 8px;border-bottom:1px solid var(--border)"><button class="btn sm" onclick="peAddLayer()">+ Layer</button><button class="btn sm" onclick="peMergeDown()">Merge ↓</button><button class="btn sm" onclick="peFlattenLayers()">Flatten</button><button class="btn sm" onclick="peDupLayer()">Dup</button></div>
    <div id="peLayerList" style="flex:1;overflow-y:auto;padding:4px 8px"></div>
  </div>
  <div id="peFramesTab" style="display:none;flex:1;overflow:hidden;flex-direction:column;min-height:0;">
    <div style="display:flex;gap:3px;flex-wrap:wrap;padding:6px 8px;border-bottom:1px solid var(--border)"><button class="btn sm" onclick="peAddFrame()">+ Frame</button><button class="btn sm" onclick="peDupFrame()">Dup</button><button class="btn sm danger" onclick="peDeleteFrame()">Del</button></div>
    <div style="padding:6px 8px;border-bottom:1px solid var(--border);display:flex;flex-direction:column;gap:6px">
      <div id="peAnimMeta" style="font-family:var(--font-mono);font-size:9px;color:var(--text2)">No asset selected</div>
      <div style="display:flex;gap:6px"><div style="flex:1"><label style="display:block;font-size:9px;color:var(--text2);margin-bottom:2px">Delay (ms)</label><input type="number" id="peAnimDelayInput" min="16" max="2000" value="100" onchange="peSetAnimDelay(this.value)" style="width:100%"></div><div style="flex:1"><label style="display:block;font-size:9px;color:var(--text2);margin-bottom:2px">Anchor</label><select id="peAnimAnchorSelect" onchange="peSetAnimAnchor(this.value)" style="width:100%"><option value="bottom">Bottom</option><option value="center">Center</option><option value="top">Top</option></select></div></div>
      <div style="font-size:9px;color:var(--text2)">Use the sprite list to switch assets. Multi-frame assets round-trip back into Snip as editable animations.</div>
    </div>
    <div id="peFrameList" style="flex:1;overflow-y:auto;padding:8px;display:flex;flex-wrap:wrap;gap:4px;align-content:flex-start"></div>
  </div>`;
  peUpdateColorUI();peRenderPalette();peRenderRecentColors();peRenderSpriteList();peRenderLayerList();peRenderFrameList();peUpdateAnimMetaUi();
  peScheduleStableRender(10);
}

function peRenderLayerList(){
  const el=document.getElementById('peLayerList');if(!el)return;
  const s=peGetActiveSprite();if(!s){el.innerHTML='<div style="padding:16px;color:var(--text2);font-size:11px;text-align:center">Select a sprite to edit layers.</div>';return;}
  const f=s.frames[s.activeFrame];if(!f)return;
  el.innerHTML=f.layers.map((l,i)=>{
    return '<div class="pe-layer-item'+(i===s.activeLayer?' active':'')+'" onclick="peSelectLayer('+i+')" ondblclick="peRenameLayer('+i+')"><div class="thumb"><canvas width="28" height="28" data-plt="'+i+'" style="image-rendering:pixelated"></canvas></div><div class="info"><div class="name">'+esc(l.name)+'</div><div class="dims">'+(l.opacity||100)+'%'+(l.visible?'':' hidden')+'</div></div><div style="display:flex;gap:1px"><button class="pe-lbtn'+(l.visible?'':' vis-off')+'" onclick="event.stopPropagation();peToggleLayerVis('+i+')">'+(l.visible?'\u{1F441}':'\u2014')+'</button><button class="pe-lbtn del" onclick="event.stopPropagation();peDeleteLayer('+i+')">x</button></div></div>';
  }).join('');
  f.layers.forEach((l,i)=>{
    const tc=el.querySelector('[data-plt="'+i+'"]');if(!tc)return;
    const x=tc.getContext('2d');x.clearRect(0,0,28,28);
    const sc=document.createElement('canvas');sc.width=s.w;sc.height=s.h;sc.getContext('2d').putImageData(l.data,0,0);
    x.imageSmoothingEnabled=false;x.drawImage(sc,0,0,28,28);
  });
}
function peSelectLayer(i){const s=peGetActiveSprite();if(s){s.activeLayer=i;peRefreshAll();peRenderLayerList();}}
function peRenameLayer(i){const s=peGetActiveSprite();if(!s)return;const l=s.frames[s.activeFrame].layers[i];const n=prompt('Layer name:',l.name);if(n!==null&&n.trim()){peSaveState();l.name=n.trim();peRenderLayerList();}}
function peToggleLayerVis(i){const s=peGetActiveSprite();if(!s)return;peSaveState();s.frames[s.activeFrame].layers[i].visible=!s.frames[s.activeFrame].layers[i].visible;peRefreshAll();peRenderLayerList();}

function peRenderFrameList(){
  const el=document.getElementById('peFrameList');if(!el)return;
  const s=peGetActiveSprite();if(!s){el.innerHTML='<div style="padding:16px;color:var(--text2);font-size:11px;text-align:center">Select a sprite to edit frames.</div>';peUpdateAnimMetaUi();return;}
  el.innerHTML=s.frames.map((f,i)=>{
    return '<div style="width:48px;height:48px;border-radius:4px;border:2px solid '+(i===s.activeFrame?'#00c2ff':'transparent')+';cursor:pointer;background:repeating-conic-gradient(#2a2a32 0% 25%,#1a1a20 0% 50%) 50%/6px 6px;display:flex;align-items:center;justify-content:center;overflow:hidden;position:relative" onclick="peSwitchFrame('+i+')"><canvas width="44" height="44" data-pft="'+i+'" style="image-rendering:pixelated"></canvas><span style="position:absolute;bottom:1px;right:2px;font-family:var(--font-mono);font-size:8px;color:var(--text2);background:rgba(0,0,0,.6);padding:0 2px;border-radius:2px">'+(i+1)+'</span></div>';
  }).join('');
  s.frames.forEach((f,i)=>{
    const tc=el.querySelector('[data-pft="'+i+'"]');if(!tc)return;
    const x=tc.getContext('2d');x.clearRect(0,0,44,44);x.imageSmoothingEnabled=false;
    x.drawImage(peCompositeFrame(s,i),0,0,44,44);
  });
}
function peSwitchFrame(i){const s=peGetActiveSprite();if(!s)return;s.activeFrame=i;s.activeLayer=Math.min(s.activeLayer,s.frames[i].layers.length-1);peRefreshAll();peRenderLayerList();peRenderFrameList();peUpdateAnimMetaUi();}

function showComposePanel(){
  const panel=document.getElementById('panel');
  panel.style.display='flex';
  panel.classList.toggle('collapsed',!!panelCollapsed);
  panel.dataset.origInner=panel.innerHTML;
  panel.innerHTML=`<div class="tabs"><div class="tab active" data-tab="scSprites" onclick="scSwitchTab('scSprites')">Sprites</div><div class="tab" data-tab="scSettings" onclick="scSwitchTab('scSettings')">Settings</div></div>
  <div id="scSpritesTab" style="flex:1;display:flex;flex-direction:column;overflow:hidden;min-height:0;">
    <div style="display:flex;gap:3px;flex-wrap:wrap;padding:6px 8px;border-bottom:1px solid var(--border)">
      <button class="btn sm primary" onclick="scAddSnippedSprites()">+ Snipped</button>
      <button class="btn sm" onclick="document.getElementById('scImportInput').click()">+ Images</button>
      <button class="btn sm" onclick="scAddBlankSprite()">+ Blank</button>
      <input type="file" id="scImportInput" accept="image/*" style="display:none" multiple onchange="scImportFiles(this.files);this.value=''">
    </div>
    <div style="display:flex;gap:3px;padding:4px 8px;border-bottom:1px solid var(--border);flex-wrap:wrap">
      <button class="btn sm" onclick="scAutoArrange()">Arrange</button>
      <button class="btn sm" onclick="scSelectAll()">All</button>
    </div>
    <div id="scSelActions" style="display:none;gap:3px;padding:4px 8px;border-bottom:1px solid var(--border);flex-wrap:wrap">
      <button class="btn sm" onclick="scDeselectAll()">None</button>
      <button class="btn sm" onclick="scDuplicateSelected()">Dup</button>
      <button class="btn sm danger" onclick="scDeleteSelected()">Del</button>
      <button class="btn sm" onclick="scRenameSelected()">Rename</button>
    </div>
    <div id="scCountBar" style="padding:3px 8px;font-family:var(--font-mono);font-size:9px;color:var(--text2);border-bottom:1px solid var(--border)">0 sprites</div>
    <div id="scSpriteList" style="flex:1;overflow-y:auto;padding:4px 8px"></div>
  </div>
  <div id="scSettingsTab" style="display:none;flex:1;overflow-y:auto;padding:8px;">
    <div class="sc-grid-settings"><div style="font-family:var(--font-mono);font-size:10px;color:var(--text2);margin-bottom:6px">Sheet Size</div><div class="row"><div><label>Width</label><input type="number" id="scSheetWInput" value="${scSheetW}" min="1" max="4096" onchange="scSetSheetSize('w',this.value)"></div><div><label>Height</label><input type="number" id="scSheetHInput" value="${scSheetH}" min="1" max="4096" onchange="scSetSheetSize('h',this.value)"></div></div>
    <button class="btn sm" onclick="scFitToContent()" style="margin-top:6px">Fit to Content</button></div>
    <div class="sc-grid-settings"><div style="font-family:var(--font-mono);font-size:10px;color:var(--text2);margin-bottom:6px">Arrange Grid</div><div class="row"><div><label>Cell W</label><input type="number" id="scCellW" value="32" min="1" max="512"></div><div><label>Cell H</label><input type="number" id="scCellH" value="32" min="1" max="512"></div></div><div class="row" style="margin-top:4px"><div><label>Padding</label><input type="number" id="scPad" value="1" min="0" max="64"></div><div><label>Columns</label><input type="number" id="scCols" value="8" min="1" max="64"></div></div></div>
    <div class="sc-grid-settings"><div style="font-family:var(--font-mono);font-size:10px;color:var(--text2);margin-bottom:6px">Display</div>
      <label style="margin:0;font-size:10px;display:flex;align-items:center;gap:4px;margin-bottom:4px"><input type="checkbox" id="scShowGrid" checked onchange="peRender()" style="accent-color:var(--accent)"> Show grid</label>
      <label style="margin:0;font-size:10px;display:flex;align-items:center;gap:4px"><input type="checkbox" id="scSnapGrid" checked style="accent-color:var(--accent)"> Snap to grid</label></div>
    <div class="sc-grid-settings"><div style="font-family:var(--font-mono);font-size:10px;color:var(--text2);margin-bottom:6px">Export</div>
      <button class="btn sm primary" onclick="scExportSheet()" style="width:100%;justify-content:center;margin-bottom:4px">Export Sheet PNG</button>
      <button class="btn sm" onclick="scExportWithManifest()" style="width:100%;justify-content:center">Export Sheet + JSON Manifest</button></div>
  </div>`;
  scUpdateSpriteList();
  peScheduleStableRender(10);
}

function peSwitchTab(tab){['peSprites','peColors','peLayers','peFrames'].forEach(t=>{const tabEl=document.querySelector('.tab[data-tab="'+t+'"]');if(tabEl)tabEl.classList.toggle('active',t===tab);const el=document.getElementById(t+'Tab');if(el)el.style.display=t===tab?(t==='peLayers'||t==='peFrames'||t==='peSprites'?'flex':'block'):'none';});peScheduleStableRender(6);}
function scSwitchTab(tab){['scSprites','scSettings'].forEach(t=>{const tabEl=document.querySelector('.tab[data-tab="'+t+'"]');if(tabEl)tabEl.classList.toggle('active',t===tab);const el=document.getElementById(t+'Tab');if(el)el.style.display=t===tab?(t==='scSprites'?'flex':'block'):'none';});peScheduleStableRender(6);}

function peSetTool(t){
  // If clicking the same rect/circle tool again, toggle fill mode
  if(t==='pe-rect'&&peTool==='pe-rect'){peRectFilled=!peRectFilled;peSyncEditorUiState({skipStatus:false});toast(peRectFilled?'Rectangle: Filled':'Rectangle: Outline');return;}
  if(t==='pe-circle'&&peTool==='pe-circle'){peCircleFilled=!peCircleFilled;peSyncEditorUiState({skipStatus:false});toast(peCircleFilled?'Circle: Filled':'Circle: Outline');return;}
  peTool=t;
  peSyncEditorUiState({flash:true});
}
function peUpdateColorUI(){  const c=peCurrentColor;
  const fgEl=document.getElementById('peColorPreviewFg');if(fgEl)fgEl.style.background='rgba('+c.r+','+c.g+','+c.b+','+(c.a/255)+')';
  const hex=document.getElementById('peColorHex');if(hex)hex.value=peHexFromRgb(c.r,c.g,c.b);
  ['R','G','B','A'].forEach(ch=>{const sl=document.getElementById('peSlider'+ch);const nm=document.getElementById('peNum'+ch);const v=ch==='R'?c.r:ch==='G'?c.g:ch==='B'?c.b:c.a;if(sl)sl.value=v;if(nm)nm.value=v;});
}
function peSetColorFromSliders(){peSetColor(+document.getElementById('peSliderR').value,+document.getElementById('peSliderG').value,+document.getElementById('peSliderB').value,+document.getElementById('peSliderA').value);peUpdateColorUI();}
function peRenderPalette(){const g=document.getElementById('pePaletteGrid');if(!g)return;g.innerHTML=pePalette.map(c=>'<div class="pe-pal-sw" style="background:'+c+'" onclick="var cc=peRgbFromHex(\''+c+'\');peSetColor(cc.r,cc.g,cc.b,peCurrentColor.a);peUpdateColorUI()"></div>').join('');}
function peRenderRecentColors(){const e=document.getElementById('peRecentColors');if(e)e.innerHTML=peRecentColors.map(c=>'<div class="pe-recent-sw" style="background:'+c+'" onclick="var cc=peRgbFromHex(\''+c+'\');peSetColor(cc.r,cc.g,cc.b,peCurrentColor.a);peUpdateColorUI()"></div>').join('');}

// ===== PIXEL EDITOR: INPUT HANDLING =====
// We modify the original handlers to check peMode at the top
// This approach works with both pointer and touch events

function peHandleDown(e){
  if(pinchZoomActive)return;
  const pos=getEventPos(e);
  if(peTool==='pan'||spaceHeld||e.button===1){isPanning=true;panStart=pos;lastPanX=panX;lastPanY=panY;canvasWrap.classList.add('panning');if(e.pointerId!==undefined)try{interactionLayer.setPointerCapture(e.pointerId);}catch(ex){};return;}
  if(e.button&&e.button!==0)return;
  const p=peScreenToPixel(pos.x,pos.y);
  if(peMode==='compose'){
    if(peTool==='sc-select'){
      let found=null;
      for(let i=scSheetSprites.length-1;i>=0;i--){const ss=scSheetSprites[i],sp=peSprites.find(s2=>s2.id===ss.spriteId);if(!sp||sp._locked)continue;if(p.px>=ss.x&&p.px<ss.x+sp.w&&p.py>=ss.y&&p.py<ss.y+sp.h){found=ss;break;}}
      if(found){
        if(e.shiftKey||e.ctrlKey||e.metaKey){
          if(scSelectedIds.has(found.id))scSelectedIds.delete(found.id);else scSelectedIds.add(found.id);
          scSelectedId=found.id;
        } else {
          scSelectedIds.clear();scSelectedId=found.id;scSelectedIds.add(found.id);
        }
        scDragging=true;scDragStart={x:p.px,y:p.py};scDragOrigPos={x:found.x,y:found.y};
        scDragOrigAll=new Map();
        scSheetSprites.forEach(ss2=>{if(scSelectedIds.has(ss2.id))scDragOrigAll.set(ss2.id,{x:ss2.x,y:ss2.y});});
        peSaveState();
      } else {
        scSelectedIds.clear();scSelectedId=null;
      }
      peRender();scUpdateSpriteList();
    } else if(peTool==='sc-lasso'){
      scLassoActive=true;
      scLassoPoints=[{x:p.px,y:p.py}];
      peRender();
    }
    return;
  }
  const s=peGetActiveSprite();if(!s)return;
  if(p.px<0||p.py<0||p.px>=s.w||p.py>=s.h){if(peTool==='pe-select'){peSelection=null;const sa=document.getElementById('peSelActions');if(sa)sa.style.display='none';peRender();}return;}
  if(peTool==='eyedropper'){const l=peGetActiveLayer();if(l){const c=peGetPixel(l.data.data,p.px,p.py,s.w,s.h);peSetColor(c.r,c.g,c.b,c.a);peUpdateColorUI();toast('Picked '+peHexFromRgb(c.r,c.g,c.b)+' @ '+p.px+','+p.py);}return;}
  if(peTool==='fill'){peFloodFill(p.px,p.py);peRefreshAll();return;}
  if(peTool==='pe-move'){
    peSaveState();
    peMoveOrigin={px:p.px,py:p.py};
    peDrawing=true;peDrawStart=p;peDrawCurrent=p;
    if(e.pointerId!==undefined)try{interactionLayer.setPointerCapture(e.pointerId);}catch(ex){}
    return;
  }
  peDrawing=true;peDrawStart=p;peDrawCurrent=p;peLastDrawPx=p.px;peLastDrawPy=p.py;
  if(peTool==='pencil'||peTool==='eraser'){peSaveState();peDrawBrush(p.px,p.py,peTool==='eraser');peRender();}
  if(peTool==='dither'){peSaveState();peDitherBrush(p.px,p.py);peRender();}
  if(peTool==='pe-select'){peSelection=null;const sa=document.getElementById('peSelActions');if(sa)sa.style.display='none';peRender();}
  if(e.pointerId!==undefined)try{interactionLayer.setPointerCapture(e.pointerId);}catch(ex){}
}
function peUpdateHoverSample(p){
  peHoverPixel={x:p.px,y:p.py};
  if(peMode==='edit'){const s=peGetActiveSprite();const l=peGetActiveLayer();if(s&&l&&p.px>=0&&p.py>=0&&p.px<s.w&&p.py<s.h){const c=peGetPixel(l.data.data,p.px,p.py,s.w,s.h);const hex=peHexFromRgb(c.r,c.g,c.b);const coordEl=document.getElementById('coordInfo');if(coordEl)coordEl.innerHTML=p.px+', '+p.py+' <span style="display:inline-block;width:10px;height:10px;border-radius:2px;border:1px solid rgba(255,255,255,0.3);vertical-align:middle;margin:0 3px;background:rgba('+c.r+','+c.g+','+c.b+','+(c.a/255)+')"></span>'+hex+(c.a<255?' a'+c.a:'');setStatus(peTool==='eyedropper'?('Eyedropper — click to pick '+hex):(peTool+' — '+hex+' @ '+p.px+','+p.py));}else{document.getElementById('coordInfo').textContent=p.px+', '+p.py;}}
  else document.getElementById('coordInfo').textContent=p.px+', '+p.py;
}
function peHandleMove(e){
  const pos=getEventPos(e),p=peScreenToPixel(pos.x,pos.y);
  if(peTool==='eyedropper'&&peMode==='edit')peUpdateHoverSample(p);
  else document.getElementById('coordInfo').textContent=p.px+', '+p.py;
  if(isPanning){panX=lastPanX+(pos.x-panStart.x);panY=lastPanY+(pos.y-panStart.y);peRender();return;}
  if(peMode==='compose'&&scLassoActive){const last=scLassoPoints[scLassoPoints.length-1];if(!last||last.x!==p.px||last.y!==p.py){scLassoPoints.push({x:p.px,y:p.py});peRender();}return;}
  if(peMode==='compose'&&scDragging&&scSelectedIds.size){
    const dx=p.px-scDragStart.x,dy=p.py-scDragStart.y;
    const sn=document.getElementById('scSnapGrid');
    const doSnap=sn&&sn.checked;
    const cw=parseInt(document.getElementById('scCellW')?.value)||32;
    const ch=parseInt(document.getElementById('scCellH')?.value)||32;
    scSheetSprites.forEach(ss=>{
      if(!scDragOrigAll||!scDragOrigAll.has(ss.id))return;
      const orig=scDragOrigAll.get(ss.id);
      let nx=orig.x+dx,ny=orig.y+dy;
      if(doSnap){nx=Math.round(nx/cw)*cw;ny=Math.round(ny/ch)*ch;}
      ss.x=nx;ss.y=ny;
    });
    peRender();return;
  }
  if(!peDrawing)return;
  peDrawCurrent=p;
  if(peTool==='pencil'||peTool==='eraser'){peDrawLine(peLastDrawPx,peLastDrawPy,p.px,p.py,peTool==='eraser');peLastDrawPx=p.px;peLastDrawPy=p.py;peRender();}
  if(peTool==='dither'){peDitherBrush(p.px,p.py);peRender();}
  if(peTool==='pe-move'){
    // Move pixels - snapshot the data from the undo state, just shift positions
    const s=peGetActiveSprite();if(!s)return;
    const l=peGetActiveLayer();if(!l)return;
    const dx=p.px-peDrawStart.px,dy=p.py-peDrawStart.py;
    if(dx!==0||dy!==0){
      // Restore from the undo backup and re-apply the total offset from original start
      const undoTop=peUndoStack[peUndoStack.length-1];
      if(!undoTop||undoTop.t!=='p')return;
      const origData=undoTop.layers[s.activeLayer].data.data;
      const d=l.data.data,w=s.w,h=s.h;
      const sel=peSelection;
      // Clear destination
      for(let i=0;i<d.length;i++)d[i]=origData[i];
      if(sel){
        // Grab the selection region from original
        const selBuf=new Uint8ClampedArray(sel.w*sel.h*4);
        for(let y=0;y<sel.h;y++)for(let x=0;x<sel.w;x++){
          const si=((sel.y+y)*w+(sel.x+x))*4,di=(y*sel.w+x)*4;
          selBuf[di]=origData[si];selBuf[di+1]=origData[si+1];selBuf[di+2]=origData[si+2];selBuf[di+3]=origData[si+3];
        }
        // Clear original selection area
        for(let y=sel.y;y<sel.y+sel.h;y++)for(let x=sel.x;x<sel.x+sel.w;x++){
          const i=(y*w+x)*4;d[i]=d[i+1]=d[i+2]=d[i+3]=0;
        }
        // Compute total delta from original peDrawStart (stored at down)
        const totalDx=p.px-peMoveOrigin.px, totalDy=p.py-peMoveOrigin.py;
        // Paste selection at new pos
        for(let y=0;y<sel.h;y++)for(let x=0;x<sel.w;x++){
          const nx=sel.x+x+totalDx,ny=sel.y+y+totalDy;
          if(nx>=0&&nx<w&&ny>=0&&ny<h){
            const di=(ny*w+nx)*4,si=(y*sel.w+x)*4;
            if(selBuf[si+3]>0){d[di]=selBuf[si];d[di+1]=selBuf[si+1];d[di+2]=selBuf[si+2];d[di+3]=selBuf[si+3];}
          }
        }
      } else {
        // Move entire layer
        const totalDx=p.px-peMoveOrigin.px, totalDy=p.py-peMoveOrigin.py;
        for(let i=0;i<d.length;i++)d[i]=0;
        for(let y=0;y<h;y++)for(let x=0;x<w;x++){
          const sx=x-totalDx,sy=y-totalDy;
          if(sx>=0&&sx<w&&sy>=0&&sy<h){
            const di=(y*w+x)*4,si=(sy*w+sx)*4;
            d[di]=origData[si];d[di+1]=origData[si+1];d[di+2]=origData[si+2];d[di+3]=origData[si+3];
          }
        }
      }
      peRender();
    }
    return;
  }
  if(['pe-line','pe-rect','pe-circle','pe-select'].includes(peTool))peRender();
}
function pePointInPolygon(pt,poly){let inside=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const xi=poly[i].x,yi=poly[i].y,xj=poly[j].x,yj=poly[j].y;const intersect=((yi>pt.y)!==(yj>pt.y))&&(pt.x<((xj-xi)*(pt.y-yi))/((yj-yi)||1e-9)+xi);if(intersect)inside=!inside;}return inside;}
function scFinalizeLassoSelection(additive){if(scLassoPoints.length<3){scLassoActive=false;scLassoPoints=[];peRender();return;}const hits=[];scSheetSprites.forEach(ss=>{const sp=peSprites.find(s=>s.id===ss.spriteId);if(!sp||sp._locked)return;const pts=[{x:ss.x+sp.w/2,y:ss.y+sp.h/2},{x:ss.x,y:ss.y},{x:ss.x+sp.w,y:ss.y},{x:ss.x,y:ss.y+sp.h},{x:ss.x+sp.w,y:ss.y+sp.h}];if(pts.some(pt=>pePointInPolygon(pt,scLassoPoints)))hits.push(ss.id);});if(!additive)scSelectedIds.clear();hits.forEach(id=>scSelectedIds.add(id));scSelectedId=hits.length?hits[hits.length-1]:null;scLassoActive=false;scLassoPoints=[];scUpdateSpriteList();peRender();toast(hits.length?('Selected '+hits.length+' sprite'+(hits.length===1?'':'s')):'No sprites in lasso');}
function peHandleUp(e){
  if(isPanning){isPanning=false;canvasWrap.classList.remove('panning');return;}
  if(peMode==='compose'){if(scLassoActive){scFinalizeLassoSelection(!!(e.shiftKey||e.ctrlKey||e.metaKey));return;}scDragging=false;scDragOrigAll=null;scUpdateSpriteList();return;}
  if(!peDrawing)return;
  peDrawing=false;
  const s=peGetActiveSprite();if(!s)return;
  if(peTool==='pe-move'){
    if(peMoveOrigin&&peDrawCurrent&&peSelection){
      const totalDx=peDrawCurrent.px-peMoveOrigin.px,totalDy=peDrawCurrent.py-peMoveOrigin.py;
      const s2=peGetActiveSprite();
      if(s2)peSelection={x:peClamp(peSelection.x+totalDx,0,s2.w-peSelection.w),y:peClamp(peSelection.y+totalDy,0,s2.h-peSelection.h),w:peSelection.w,h:peSelection.h};
    }
    peMoveOrigin=null;peDrawStart=null;peDrawCurrent=null;peRefreshAll();return;
  }
  if(peTool==='pe-line'&&peDrawStart&&peDrawCurrent){peSaveState();peDrawLine(peDrawStart.px,peDrawStart.py,peDrawCurrent.px,peDrawCurrent.py,false);}
  if(peTool==='pe-rect'&&peDrawStart&&peDrawCurrent){peSaveState();peDrawRect(peDrawStart.px,peDrawStart.py,peDrawCurrent.px,peDrawCurrent.py,peRectFilled,false);}
  if(peTool==='pe-circle'&&peDrawStart&&peDrawCurrent){peSaveState();const cx=Math.round((peDrawStart.px+peDrawCurrent.px)/2),cy=Math.round((peDrawStart.py+peDrawCurrent.py)/2),rx=Math.round(Math.abs(peDrawCurrent.px-peDrawStart.px)/2),ry=Math.round(Math.abs(peDrawCurrent.py-peDrawStart.py)/2);peDrawCircle(cx,cy,rx,ry,peCircleFilled,false);}
  if(peTool==='pe-select'&&peDrawStart&&peDrawCurrent){const x1=Math.max(0,Math.min(peDrawStart.px,peDrawCurrent.px)),y1=Math.max(0,Math.min(peDrawStart.py,peDrawCurrent.py)),x2=Math.min(s.w-1,Math.max(peDrawStart.px,peDrawCurrent.px)),y2=Math.min(s.h-1,Math.max(peDrawStart.py,peDrawCurrent.py));if(x2>x1&&y2>y1){peSelection={x:x1,y:y1,w:x2-x1+1,h:y2-y1+1};const sa=document.getElementById('peSelActions');if(sa)sa.style.display='flex';toast('Selected '+peSelection.w+'×'+peSelection.h+' region');}}
  peDrawStart=null;peDrawCurrent=null;peRefreshAll();
}

// Override keyboard handler in edit/compose mode
const _origKeyDown=document.onkeydown;
document.addEventListener('keydown',function(e){
  if(!peMode)return; // Let original handler run
  if(e.target.tagName==='INPUT'||e.target.tagName==='SELECT'||e.target.tagName==='TEXTAREA')return;
  const k=e.key.toLowerCase();
  if(e.ctrlKey||e.metaKey){
    if(k==='z'){e.preventDefault();e.stopPropagation();
      if(peMode==='edit-sheet'){if(e.shiftKey)peSheetRedo();else peSheetUndo();}
      else{if(e.shiftKey)peRedo();else peUndo();}
      return;}
    if(k==='y'){e.preventDefault();e.stopPropagation();
      if(peMode==='edit-sheet')peSheetRedo();else peRedo();return;}
  }
  if(k===' '){e.preventDefault();e.stopPropagation();spaceHeld=true;canvasWrap.classList.add('panning');return;}
  if(k==='escape'){e.preventDefault();e.stopPropagation();switchToMode('snip');return;}
  if(peMode==='edit'||peMode==='edit-sheet'){
    e.stopPropagation();
    if(k==='b')peSetTool('pencil');
    if(k==='e')peSetTool('eraser');
    if(k==='g')peSetTool('fill');
    if(k==='i')peSetTool('eyedropper');
    if(k==='d')peSetTool('dither');
    if(k==='l')peSetTool('pe-line');
    if(k==='r')peSetTool('pe-rect');
    if(k==='c')peSetTool('pe-circle');
    if(k==='s')peSetTool('pe-select');
    if(k==='v')peSetTool('pe-move');
    if(k==='h')peSetTool('pan');
    if(k==='f'){if(peMode==='edit-sheet')zoomFit();else peZoomFit();}
    if(k==='x'){peSwapFgBg();peUpdateColorUI();}
    if(k==='tab'){e.preventDefault();peTogglePanel();}
    if(k==='delete'&&peSelection)peSelDelete();
  }
  if(peMode==='compose'){
    e.stopPropagation();
    if(k==='v')peSetTool('sc-select');
    if(k==='l')peSetTool('sc-lasso');
    if(k==='h')peSetTool('pan');
    if(k==='f')peZoomFit();
    if(k==='tab'){e.preventDefault();peTogglePanel();}
    if((k==='delete'||k==='backspace')&&scSelectedId)scDeleteSelected();
  }
},{capture:true});

// ===== BRIDGE FUNCTIONS: SNIP -> EDIT -> SNIP =====
function editSelectedSprite(){
  if(!img){toast('No sheet to edit');return;}
  const spriteId=selectedSpriteIds.size?[...selectedSpriteIds][0]:null;
  peEnterProjectEditMode(activeSheetId,spriteId);
}

function applyEditedSprite(ref,editedPayload,silent){
  const sh=sheets.find(s=>s.id===activeSheetId);
  if(!sh||!editedPayload||!editedPayload.frames||!editedPayload.frames.length)return;
  let frameRefs=(ref.frameRefs&&ref.frameRefs.length?ref.frameRefs:[ref]).map(r=>({...r,tags:r.tags?{...r.tags}:{}}));
  const baseMeta=frameRefs[0]||{};
  const removedRefs=frameRefs.slice(editedPayload.frames.length);
  if(removedRefs.length)sh.sprites=sh.sprites.filter(sp=>!removedRefs.some(r=>r.spriteId===sp.id));
  let nextX=frameRefs.length?Math.max(...frameRefs.map(r=>r.x+r.w))+1:0;
  const baseY=frameRefs.length?frameRefs[0].y:0;
  while(frameRefs.length<editedPayload.frames.length){
    const idx=frameRefs.length;
    frameRefs.push({spriteId:sh.nextSpriteId++,x:nextX,y:baseY,w:editedPayload.w,h:editedPayload.h,name:editedPayload.name+'_frame_'+(idx+1),categoryId:baseMeta.categoryId||null,subcatId:baseMeta.subcatId||null,tags:baseMeta.tags?{...baseMeta.tags}:{}});
    nextX+=editedPayload.w+1;
  }
  frameRefs=frameRefs.slice(0,editedPayload.frames.length);
  let needW=imgW||sh.imgW||0,needH=imgH||sh.imgH||0;
  frameRefs.forEach(r=>{needW=Math.max(needW,r.x+editedPayload.w);needH=Math.max(needH,r.y+editedPayload.h);});
  const tc=document.createElement('canvas');tc.width=Math.max(needW,1);tc.height=Math.max(needH,1);
  const tx=tc.getContext('2d');tx.imageSmoothingEnabled=false;if(img)tx.drawImage(img,0,0);
  [...(ref.frameRefs||[ref])].forEach(r=>tx.clearRect(r.x,r.y,Math.max(r.w,editedPayload.w),Math.max(r.h,editedPayload.h)));
  frameRefs.forEach((r,i)=>{tx.drawImage(editedPayload.frames[i],r.x,r.y);});
  frameRefs.forEach((r,i)=>{
    let sp=sh.sprites.find(s=>s.id===r.spriteId);
    if(!sp){
      sp={id:r.spriteId,x:r.x,y:r.y,w:editedPayload.w,h:editedPayload.h,name:editedPayload.frames.length>1?(editedPayload.name+'_frame_'+(i+1)):editedPayload.name,categoryId:r.categoryId||null,subcatId:r.subcatId||null,tags:r.tags?{...r.tags}:{}};
      sh.sprites.push(sp);
    }else{
      sp.x=r.x;sp.y=r.y;sp.w=editedPayload.w;sp.h=editedPayload.h;
      if(editedPayload.frames.length===1)sp.name=editedPayload.name;
    }
  });
  sh.nextSpriteId=Math.max(sh.nextSpriteId||1,...sh.sprites.map(s=>s.id+1),1);
  sh.img=tc;sh.imgW=tc.width;sh.imgH=tc.height;sh.originalFileData=tc.toDataURL('image/png');
  originalFileData=sh.originalFileData;
  img=tc;imgW=tc.width;imgH=tc.height;
  render();refreshAll();
  if(!silent)toast(editedPayload.frames.length>1?'Animation frame edits applied':'Sprite edits applied');
}

function peResizeCanvas(){
  const s=peGetActiveSprite();if(!s)return;
  const sizeStr=prompt('New size (WxH):',s.w+'x'+s.h);
  if(!sizeStr)return;
  const parts=sizeStr.split(/[x×,]/i).map(Number);
  if(parts.length<2||parts[0]<1||parts[1]<1){toast('Invalid size');return;}
  const nw=Math.min(parts[0],1024),nh=Math.min(parts[1],1024);
  if(nw===s.w&&nh===s.h)return;
  peSaveState();
  s.frames.forEach(f=>f.layers.forEach(l=>{
    const src=document.createElement('canvas');src.width=s.w;src.height=s.h;
    src.getContext('2d').putImageData(l.data,0,0);
    const c=document.createElement('canvas');c.width=nw;c.height=nh;
    // Center the old content in the new canvas
    const dx=Math.floor((nw-s.w)/2),dy=Math.floor((nh-s.h)/2);
    c.getContext('2d').drawImage(src,dx,dy);
    l.data=c.getContext('2d').getImageData(0,0,nw,nh);
  }));
  s.w=nw;s.h=nh;
  peZoomFit();peRefreshAll();toast('Resized to '+nw+'×'+nh);
}
function peRenameSprite(){
  const s=peGetActiveSprite();if(!s)return;
  const n=prompt('Asset name:',s.name);
  if(n!==null&&n.trim()&&n.trim()!==s.name){peSaveState();s.name=n.trim();setStatus('Editing: '+s.name);toast('Renamed to '+s.name);}
}

function peExportSprite(){
  const s=peGetActiveSprite();if(!s)return;
  peCompositeFrame(s,s.activeFrame).toBlob(b=>{
    const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=s.name+'.png';a.click();
  });
  toast('Exported '+s.name+'.png');
}

function peShowTransformMenu(e){
  e.stopPropagation();
  const menu=document.createElement('div');
  menu.style.cssText='position:fixed;z-index:1000;background:var(--surface);border:1px solid var(--border);border-radius:8px;box-shadow:0 8px 32px rgba(0,0,0,0.5);padding:4px;min-width:200px;';
  menu.style.left=(e.clientX)+'px';menu.style.top=(e.clientY)+'px';
  // Keep menu in viewport
  menu.innerHTML=`
    <div style="padding:4px 10px 2px;font-family:var(--font-mono);font-size:9px;color:var(--text2);text-transform:uppercase;letter-spacing:0.5px">Transform</div>
    <div class="dd-item" onclick="peFlipH();this.parentElement.remove()">Flip Horizontal</div>
    <div class="dd-item" onclick="peFlipV();this.parentElement.remove()">Flip Vertical</div>
    <div class="dd-item" onclick="peOutline();this.parentElement.remove()">Outline (current color)</div>
    <div class="dd-item" onclick="peResizeCanvas();this.parentElement.remove()">Resize Canvas...</div>
    <div class="dd-item" onclick="peRenameSprite();this.parentElement.remove()">Rename Sprite...</div>
    <div style="height:1px;background:var(--border);margin:3px 0"></div>
    <div class="dd-item" onclick="peShowHueShift();this.parentElement.remove()">Adjust / Recolor...</div>
  `;
  document.body.appendChild(menu);
  // Adjust if off-screen
  const rect=menu.getBoundingClientRect();
  if(rect.right>window.innerWidth)menu.style.left=(window.innerWidth-rect.width-8)+'px';
  if(rect.bottom>window.innerHeight)menu.style.top=(window.innerHeight-rect.height-8)+'px';
  setTimeout(()=>{document.addEventListener('click',function rm(ev){if(!menu.contains(ev.target)){menu.remove();document.removeEventListener('click',rm);}});},10);
}

// ===== RECOLOR / HUE SHIFT =====
let peHueBackup=null;
function peRgbToHsl(r,g,b){r/=255;g/=255;b/=255;const mx=Math.max(r,g,b),mn=Math.min(r,g,b),l2=(mx+mn)/2;let h2=0,s2=0;if(mx!==mn){const d=mx-mn;s2=l2>0.5?d/(2-mx-mn):d/(mx+mn);if(mx===r)h2=((g-b)/d+(g<b?6:0))/6;else if(mx===g)h2=((b-r)/d+2)/6;else h2=((r-g)/d+4)/6;}return[h2*360,s2*100,l2*100];}
function peHslToRgb(h,s,l){h/=360;s/=100;l/=100;let r2,g2,b2;if(s===0){r2=g2=b2=l;}else{const hue2rgb=(p,q,t)=>{if(t<0)t+=1;if(t>1)t-=1;if(t<1/6)return p+(q-p)*6*t;if(t<1/2)return q;if(t<2/3)return p+(q-p)*(2/3-t)*6;return p;};const q=l<0.5?l*(1+s):l+s-l*s,p=2*l-q;r2=hue2rgb(p,q,h+1/3);g2=hue2rgb(p,q,h);b2=hue2rgb(p,q,h-1/3);}return[Math.round(r2*255),Math.round(g2*255),Math.round(b2*255)];}

function peShowHueShift(){
  const s=peGetActiveSprite();if(!s)return;
  const l=peGetActiveLayer();if(!l)return;
  peSaveState();
  peHueBackup=new Uint8ClampedArray(l.data.data);
  const modal=document.createElement('div');
  modal.className='modal-overlay';modal.id='peRecolorModal';modal.style.display='flex';
  modal.onclick=e=>{if(e.target===modal){peRevertHueShift();modal.remove();}};
  const prevSz=140;
  const sc2=Math.max(1,Math.min(Math.floor(prevSz/Math.max(s.w,s.h)),16));
  const pw2=s.w*sc2,ph2=s.h*sc2;
  modal.innerHTML='<div class="modal" style="width:min(520px,94vw);max-height:90vh;overflow-y:auto">'
    +'<h3 style="margin-bottom:8px">Recolor & Adjust</h3>'
    +'<div style="display:flex;gap:10px;margin-bottom:10px;justify-content:center">'
    +'<div style="text-align:center"><div style="font-family:var(--font-mono);font-size:8px;color:var(--text2);margin-bottom:3px;text-transform:uppercase">Before</div><div style="background:repeating-conic-gradient(#2a2a32 0% 25%, #1a1a20 0% 50%) 50%/8px 8px;border:1px solid var(--border);border-radius:4px;overflow:hidden;display:inline-block;padding:4px;line-height:0"><canvas id="peRecolorBefore" width="'+pw2+'" height="'+ph2+'" style="image-rendering:pixelated;width:'+pw2+'px;height:'+ph2+'px"></canvas></div></div>'
    +'<div style="text-align:center"><div style="font-family:var(--font-mono);font-size:8px;color:var(--text2);margin-bottom:3px;text-transform:uppercase">After</div><div style="background:repeating-conic-gradient(#2a2a32 0% 25%, #1a1a20 0% 50%) 50%/8px 8px;border:1px solid var(--border);border-radius:4px;overflow:hidden;display:inline-block;padding:4px;line-height:0"><canvas id="peRecolorAfter" width="'+pw2+'" height="'+ph2+'" style="image-rendering:pixelated;width:'+pw2+'px;height:'+ph2+'px"></canvas></div></div>'
    +'</div>'
    +'<div style="display:flex;flex-direction:column;gap:5px">'
    +'<div><div style="display:flex;justify-content:space-between"><label style="font-size:10px;color:var(--text2)">Hue Shift</label><span id="peHueVal" style="font-family:var(--font-mono);font-size:10px;color:var(--text)">0\u00b0</span></div><input type="range" id="peHueSlider" min="-180" max="180" value="0" style="width:100%;accent-color:#00c2ff" oninput="document.getElementById(\'peHueVal\').textContent=this.value+\'\u00b0\';pePreviewRecolor()"></div>'
    +'<div><div style="display:flex;justify-content:space-between"><label style="font-size:10px;color:var(--text2)">Saturation</label><span id="peSatVal" style="font-family:var(--font-mono);font-size:10px;color:var(--text)">0</span></div><input type="range" id="peSatSlider" min="-100" max="100" value="0" style="width:100%;accent-color:#00c2ff" oninput="document.getElementById(\'peSatVal\').textContent=this.value;pePreviewRecolor()"></div>'
    +'<div><div style="display:flex;justify-content:space-between"><label style="font-size:10px;color:var(--text2)">Lightness</label><span id="peLightVal" style="font-family:var(--font-mono);font-size:10px;color:var(--text)">0</span></div><input type="range" id="peLightSlider" min="-100" max="100" value="0" style="width:100%;accent-color:#00c2ff" oninput="document.getElementById(\'peLightVal\').textContent=this.value;pePreviewRecolor()"></div>'
    +'<div><div style="display:flex;justify-content:space-between"><label style="font-size:10px;color:var(--text2)">Contrast</label><span id="peContrastVal" style="font-family:var(--font-mono);font-size:10px;color:var(--text)">0</span></div><input type="range" id="peContrastSlider" min="-100" max="100" value="0" style="width:100%;accent-color:#00c2ff" oninput="document.getElementById(\'peContrastVal\').textContent=this.value;pePreviewRecolor()"></div>'
    +'<div><div style="display:flex;justify-content:space-between"><label style="font-size:10px;color:var(--text2)">Temperature</label><span id="peTempVal" style="font-family:var(--font-mono);font-size:10px;color:var(--text)">0</span></div><input type="range" id="peTempSlider" min="-50" max="50" value="0" style="width:100%;accent-color:#00c2ff" oninput="document.getElementById(\'peTempVal\').textContent=this.value;pePreviewRecolor()"></div>'
    +'</div>'
    +'<div style="height:1px;background:var(--border);margin:8px 0"></div>'
    +'<div style="font-family:var(--font-mono);font-size:9px;color:var(--text2);margin-bottom:4px;text-transform:uppercase">Color Replace</div>'
    +'<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:6px">'
    +'<span style="font-size:10px;color:var(--text2)">From:</span>'
    +'<input type="color" id="peReplaceFrom" value="#ff0000" style="width:28px;height:28px;border:1px solid var(--border);border-radius:4px;padding:0;cursor:pointer">'
    +'<span style="font-size:10px;color:var(--text2)">To:</span>'
    +'<input type="color" id="peReplaceTo" value="#0000ff" style="width:28px;height:28px;border:1px solid var(--border);border-radius:4px;padding:0;cursor:pointer">'
    +'<span style="font-size:10px;color:var(--text2)">Tol:</span>'
    +'<input type="range" id="peReplaceTol" min="0" max="120" value="30" style="width:60px;accent-color:#00c2ff" oninput="document.getElementById(\'peReplaceTolVal\').textContent=this.value">'
    +'<span id="peReplaceTolVal" style="font-family:var(--font-mono);font-size:9px;color:var(--text)">30</span>'
    +'</div>'
    +'<button class="btn sm" onclick="peReplaceColor()">Replace Color</button>'
    +'<div style="display:flex;gap:6px;margin-top:8px"><button class="btn sm" onclick="peResetRecolorSliders()">Reset Sliders</button></div>'
    +'<div class="actions" style="margin-top:10px"><button class="btn" onclick="peRevertHueShift();this.closest(\'.modal-overlay\').remove()">Cancel</button><button class="btn primary" onclick="peApplyHueShift();this.closest(\'.modal-overlay\').remove()">Apply</button></div>'
    +'</div>';
  document.body.appendChild(modal);
  peDrawRecolorPreviews();
}

function peResetRecolorSliders(){
  ['peHueSlider','peSatSlider','peLightSlider','peContrastSlider','peTempSlider'].forEach(function(id){var el=document.getElementById(id);if(el)el.value=0;});
  var hv=document.getElementById('peHueVal');if(hv)hv.textContent='0\u00b0';
  ['peSatVal','peLightVal','peContrastVal','peTempVal'].forEach(function(id){var el=document.getElementById(id);if(el)el.textContent='0';});
  var s=peGetActiveSprite();if(!s||!peHueBackup)return;
  var l=peGetActiveLayer();if(!l)return;
  var d=l.data.data;for(var i=0;i<d.length;i++)d[i]=peHueBackup[i];
  peRender();peDrawRecolorPreviews();
}

function peDrawRecolorPreviews(){
  var s=peGetActiveSprite();if(!s)return;
  var sc2=Math.max(1,Math.min(Math.floor(140/Math.max(s.w,s.h)),16));
  var pw2=s.w*sc2,ph2=s.h*sc2;
  var bCv=document.getElementById('peRecolorBefore');
  if(bCv&&peHueBackup){bCv.width=pw2;bCv.height=ph2;var bx=bCv.getContext('2d');bx.imageSmoothingEnabled=false;var tc=document.createElement('canvas');tc.width=s.w;tc.height=s.h;tc.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(peHueBackup),s.w,s.h),0,0);bx.drawImage(tc,0,0,pw2,ph2);}
  var aCv=document.getElementById('peRecolorAfter');
  if(aCv){aCv.width=pw2;aCv.height=ph2;var ax=aCv.getContext('2d');ax.imageSmoothingEnabled=false;var l=peGetActiveLayer();if(l){var tc2=document.createElement('canvas');tc2.width=s.w;tc2.height=s.h;tc2.getContext('2d').putImageData(l.data,0,0);ax.drawImage(tc2,0,0,pw2,ph2);}}
}

function pePreviewRecolor(){
  var s=peGetActiveSprite();if(!s||!peHueBackup)return;
  var l=peGetActiveLayer();if(!l)return;
  var hShift=parseInt(document.getElementById('peHueSlider').value)||0;
  var sShift=parseInt(document.getElementById('peSatSlider').value)||0;
  var lShift=parseInt(document.getElementById('peLightSlider').value)||0;
  var contrast=parseInt(document.getElementById('peContrastSlider').value)||0;
  var temp=parseInt(document.getElementById('peTempSlider').value)||0;
  var contrastF=contrast!==0?(259*(contrast+255))/(255*(259-contrast)):1;
  var d=l.data.data;
  for(var i=0;i<d.length;i+=4){
    d[i]=peHueBackup[i];d[i+1]=peHueBackup[i+1];d[i+2]=peHueBackup[i+2];d[i+3]=peHueBackup[i+3];
    if(d[i+3]===0)continue;
    if(contrast!==0){d[i]=peClamp(Math.round(contrastF*(d[i]-128)+128),0,255);d[i+1]=peClamp(Math.round(contrastF*(d[i+1]-128)+128),0,255);d[i+2]=peClamp(Math.round(contrastF*(d[i+2]-128)+128),0,255);}
    if(temp!==0){d[i]=peClamp(d[i]+temp,0,255);d[i+2]=peClamp(d[i+2]-temp,0,255);}
    if(hShift!==0||sShift!==0||lShift!==0){
      var hsl=peRgbToHsl(d[i],d[i+1],d[i+2]);
      var h2=(hsl[0]+hShift+360)%360,sat2=peClamp(hsl[1]+sShift,0,100),lit2=peClamp(hsl[2]+lShift,0,100);
      var rgb=peHslToRgb(h2,sat2,lit2);d[i]=rgb[0];d[i+1]=rgb[1];d[i+2]=rgb[2];
    }
  }
  peRender();peDrawRecolorPreviews();
}

function peReplaceColor(){
  var s=peGetActiveSprite();if(!s||!peHueBackup)return;
  var l=peGetActiveLayer();if(!l)return;
  var fromHex=document.getElementById('peReplaceFrom').value||'#ff0000';
  var toHex=document.getElementById('peReplaceTo').value||'#0000ff';
  var tol=parseInt(document.getElementById('peReplaceTol').value)||30;
  var from=peRgbFromHex(fromHex),to=peRgbFromHex(toHex);
  var d=l.data.data,count=0;
  for(var i=0;i<d.length;i+=4){
    if(d[i+3]===0)continue;
    var dr=Math.abs(d[i]-from.r),dg=Math.abs(d[i+1]-from.g),db=Math.abs(d[i+2]-from.b);
    var dist=Math.sqrt(dr*dr+dg*dg+db*db);
    if(dist<=tol){
      var blend=dist<=tol*0.5?1:1-((dist-tol*0.5)/(tol*0.5));
      d[i]=Math.round(d[i]*(1-blend)+to.r*blend);
      d[i+1]=Math.round(d[i+1]*(1-blend)+to.g*blend);
      d[i+2]=Math.round(d[i+2]*(1-blend)+to.b*blend);
      count++;
    }
  }
  for(var i=0;i<d.length;i++)peHueBackup[i]=d[i];
  peRender();peDrawRecolorPreviews();
  toast('Replaced '+count+' pixel(s)');
}

function peRevertHueShift(){
  var s=peGetActiveSprite();if(!s||!peHueBackup)return;
  var l=peGetActiveLayer();if(!l)return;
  var d=l.data.data;for(var i=0;i<d.length;i++)d[i]=peHueBackup[i];
  peHueBackup=null;
  if(peUndoStack.length)peUndoStack.pop();
  peRender();
}

function peApplyHueShift(){
  peHueBackup=null;peRefreshAll();toast('Recolor applied');
}

// ===== SHEET COMPOSER FUNCTIONS =====

function openComposeForCurrentSheet(){
  const sourceSheet=activeSheetId?sheets.find(s=>s.id===activeSheetId):null;
  if(!sourceSheet){createNewSheetTab();return;}
  scSheetSprites=[];scSelectedId=null;scNextId=1;scSelectedIds=new Set();
  peSprites=[];peNextSpriteId=1;
  scSheetW=Math.max(1,sourceSheet.imgW||256);scSheetH=Math.max(1,sourceSheet.imgH||256);
  peComposeTargetSheetId=sourceSheet.id;
  seedComposeFromSheet(sourceSheet,true,{includeWholeSheet:true,cutSnippedAreas:true,lockBase:(sourceSheet.sprites||[]).length>0});
  enterComposeMode();
  if(sourceSheet.sprites&&sourceSheet.sprites.length)toast('Compose opened for current sheet — editable sprites stay aligned over the full sheet');
  else toast('Compose opened for current sheet');
}

function seedComposeFromSheet(sourceSheet,preserveLayout,opts){
  opts=opts||{};
  if(!sourceSheet||!sourceSheet.img)return 0;
  const includeWholeSheet=opts.includeWholeSheet===true || !(sourceSheet.sprites&&sourceSheet.sprites.length);
  const cutSnippedAreas=opts.cutSnippedAreas!==false;
  const lockBase=!!opts.lockBase;
  let count=0,maxW=0,maxH=0;
  if(includeWholeSheet){
    const baseCanvas=document.createElement('canvas');baseCanvas.width=Math.max(1,sourceSheet.imgW||1);baseCanvas.height=Math.max(1,sourceSheet.imgH||1);
    const bx=baseCanvas.getContext('2d');bx.imageSmoothingEnabled=false;bx.drawImage(sourceSheet.img,0,0);
    if(cutSnippedAreas&&sourceSheet.sprites&&sourceSheet.sprites.length){
      sourceSheet.sprites.forEach(s=>bx.clearRect(s.x,s.y,s.w,s.h));
    }
    const baseData=bx.getImageData(0,0,baseCanvas.width,baseCanvas.height);
    const baseSprite=peCreateSpriteData(baseCanvas.width,baseCanvas.height,(sourceSheet.name||'sheet')+'_base',baseData);
    baseSprite._isSheetBase=true;baseSprite._locked=lockBase;baseSprite._sourceSheetId=sourceSheet.id;
    peSprites.push(baseSprite);
    scSheetSprites.push({id:scNextId++,spriteId:baseSprite.id,x:0,y:0});
    maxW=Math.max(maxW,baseCanvas.width);maxH=Math.max(maxH,baseCanvas.height);count++;
  }
  if(sourceSheet.sprites&&sourceSheet.sprites.length){
    sourceSheet.sprites.forEach(s=>{
      const tc=document.createElement('canvas');tc.width=s.w;tc.height=s.h;
      const tx=tc.getContext('2d');tx.drawImage(sourceSheet.img,s.x,s.y,s.w,s.h,0,0,s.w,s.h);
      if(s.excludeMask&&Object.keys(s.excludeMask).length){
        const id=tx.getImageData(0,0,s.w,s.h);const dd=id.data;
        for(let py=0;py<s.h;py++)for(let px=0;px<s.w;px++){
          const key=(s.x+px)+','+(s.y+py);
          if(s.excludeMask[key]){const i=(py*s.w+px)*4;dd[i+3]=0;}
        }
        tx.putImageData(id,0,0);
      }
      const imageData=tx.getImageData(0,0,s.w,s.h);
      const sp=peCreateSpriteData(s.w,s.h,s.name,imageData);
      sp._snipTags=s.tags?{...s.tags}:{};
      sp._snipCatId=s.categoryId;sp._snipSubcatId=s.subcatId;
      peSprites.push(sp);
      scSheetSprites.push({id:scNextId++,spriteId:sp.id,x:preserveLayout?s.x:0,y:preserveLayout?s.y:0});
      maxW=Math.max(maxW,(preserveLayout?s.x:0)+s.w);
      maxH=Math.max(maxH,(preserveLayout?s.y:0)+s.h);
      count++;
    });
  }
  if(preserveLayout){
    scSheetW=Math.max(sourceSheet.imgW||256,maxW||256);
    scSheetH=Math.max(sourceSheet.imgH||256,maxH||256);
  }
  return count;
}

function createNewSheetTab(opts){
  opts=opts||{};
  const blankW=opts.width||256,blankH=opts.height||256;
  const sourceSheetId=opts.seedSourceSheetId||null;
  const preserveLayout=opts.preserveLayout!==false;
  const sheetName=opts.name||'New Sheet';
  const sourceSheet=sourceSheetId?sheets.find(s=>s.id===sourceSheetId):null;
  const tc=document.createElement('canvas');tc.width=blankW;tc.height=blankH;
  const dataUrl=tc.toDataURL('image/png');
  const blankImg=new Image();
  blankImg.onload=()=>{
    if(peMode){
      peMode=null;peSprites=[];peActiveSpriteId=null;
      restoreToolbarToSnip();
      document.getElementById('peMirrorIndicator').style.display='none';
      const panel=document.getElementById('panel');
      if(panel.dataset.origInner){panel.innerHTML=panel.dataset.origInner;delete panel.dataset.origInner;}
    }
    if(activeSheetId)saveSheetState();
    const sh={id:nextSheetId++,name:sheetName,img:blankImg,imgW:blankW,imgH:blankH,
      sprites:[],categories:[],tagCategories:JSON.parse(JSON.stringify(tagCategories)),
      nextSpriteId:1,nextCatId:1,nextSubcatId:1,nextTagCatId:4,
      zoom:1,panX:0,panY:0,bgMode:'checker',undoStack:[],redoStack:[],
      selectedSpriteIds:[],activeCategoryId:null,openCategories:[],activeSubcatId:null,
      originalFileData:dataUrl,originalFileName:'new_sheet.png',animSubcatIds:[],animConfigs:{}};
    sheets.push(sh);
    renderSheetTabs();switchSheet(sh.id);zoomFit();updateExportTabVisibility();
    scSheetSprites=[];scSelectedId=null;scNextId=1;scSelectedIds=new Set();
    peSprites=[];peNextSpriteId=1;
    scSheetW=blankW;scSheetH=blankH;
    peComposeTargetSheetId=sh.id;
    const seeded=seedComposeFromSheet(sourceSheet,preserveLayout,{includeWholeSheet:false});
    enterComposeMode();
    if(seeded&&!preserveLayout)scAutoArrange();
    if(seeded)toast('New sheet created from '+sourceSheet.name+' — compose edits now save directly to this tab');
    else toast('New sheet created — add sprites from other tabs, import images, or create pixel art');
  };
  blankImg.src=dataUrl;
}


function peNewPixelArt(){
  if(typeof pushGlobalHistory==='function'&&!globalHistoryRestoring)pushGlobalHistory();
  if(peMode)returnToSnipMode();
  const sizeStr=prompt('Pixel art size (WxH):','32x32');
  if(!sizeStr)return;
  const parts=sizeStr.split(/[x×,]/i).map(Number);
  const size=parts.length>=2?Math.max(1,Math.min(1024,parts[0]||32)):Math.max(1,Math.min(1024,parseInt(sizeStr)||32));
  const sizeH=parts.length>=2?Math.max(1,Math.min(1024,parts[1]||32)):size;
  const tc=document.createElement('canvas');tc.width=size;tc.height=sizeH;
  const dataUrl=tc.toDataURL('image/png');
  const blankImg=new Image();
  blankImg.onload=()=>{
    if(activeSheetId)saveSheetState();
    const spriteId=1;
    const sh={id:nextSheetId++,name:'Pixel Art',img:blankImg,imgW:size,imgH:sizeH,
      sprites:[{id:spriteId,x:0,y:0,w:size,h:sizeH,name:'pixel_art_1',categoryId:null,subcatId:null,tags:{}}],categories:[],tagCategories:JSON.parse(JSON.stringify(tagCategories)),
      nextSpriteId:2,nextCatId:1,nextSubcatId:1,nextTagCatId:4,
      zoom:1,panX:0,panY:0,bgMode:'checker',undoStack:[],redoStack:[],
      selectedSpriteIds:[spriteId],activeCategoryId:null,openCategories:[],activeSubcatId:null,
      originalFileData:dataUrl,originalFileName:'pixel_art.png',animSubcatIds:[],animConfigs:{}};
    sheets.push(sh);
    renderSheetTabs();switchSheet(sh.id);zoomFit();updateExportTabVisibility();
    selectedSpriteIds=new Set([spriteId]);
    updateSpriteList&&updateSpriteList();
    updateSelInfo&&updateSelInfo();
    render();
    editSelectedSprite();
    toast('New pixel art tab created');
  };
  blankImg.src=dataUrl;
}

function scImportSpritesFromSheet(sourceSheet,spriteIds){
  if(!sourceSheet||!sourceSheet.img||!(sourceSheet.sprites||[]).length){toast('No sprites in selected tab');return;}
  const chosen=(sourceSheet.sprites||[]).filter(s=>!spriteIds||!spriteIds.length||spriteIds.includes(s.id));
  if(!chosen.length){toast('Select at least one sprite to import');return;}
  peSaveState();
  if(activeSheetId)saveSheetState();
  const srcImg=sourceSheet.img;
  chosen.forEach(s=>{
    const tc=document.createElement('canvas');tc.width=s.w;tc.height=s.h;
    const tx=tc.getContext('2d');tx.imageSmoothingEnabled=false;tx.drawImage(srcImg,s.x,s.y,s.w,s.h,0,0,s.w,s.h);
    if(s.excludeMask&&Object.keys(s.excludeMask).length){
      const id=tx.getImageData(0,0,s.w,s.h);const dd=id.data;
      for(let py=0;py<s.h;py++)for(let px=0;px<s.w;px++){const key=(s.x+px)+','+(s.y+py);if(s.excludeMask[key]){const i=(py*s.w+px)*4;dd[i+3]=0;}}
      tx.putImageData(id,0,0);
    }
    const imageData=tx.getImageData(0,0,s.w,s.h);
    const sp=peCreateSpriteData(s.w,s.h,s.name,imageData);
    sp._snipTags=s.tags?{...s.tags}:{};sp._snipCatId=s.categoryId||null;sp._snipSubcatId=s.subcatId||null;
    peSprites.push(sp);
    scSheetSprites.push({id:scNextId++,spriteId:sp.id,x:0,y:0});
  });
  scAutoArrange();scUpdateSpriteList();peForceCanvasRefresh(8);
  toast('Added '+chosen.length+' sprite'+(chosen.length===1?'':'s')+' from '+sourceSheet.name);
}
function scUpdateImportSpritePicker(){
  const modal=document.getElementById('scSpriteImportModal');if(!modal)return;
  const sourceId=parseInt(document.getElementById('scImportSourceSelect').value,10);
  const sourceSheet=sheets.find(sh=>sh.id===sourceId);
  const list=document.getElementById('scImportSpriteChoices');
  const summary=document.getElementById('scImportSourceSummary');
  if(!sourceSheet||!list)return;
  const spritesForSheet=(sourceSheet.sprites||[]).slice();
  summary.textContent=sourceSheet.name+' · '+spritesForSheet.length+' sprite'+(spritesForSheet.length===1?'':'s');
  const cats=sourceSheet.categories||[];
  list.innerHTML=spritesForSheet.map(s=>{
    const cat=(cats||[]).find(c=>c.id===s.categoryId);
    const sub=cat&&s.subcatId!=null?(cat.subcats||[]).find(sc=>sc.id===s.subcatId):null;
    const group=sub?(cat.name+' / '+sub.name):(cat?cat.name:'Ungrouped');
    return '<label class="sc-import-row" style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border);cursor:pointer">'
      +'<input type="checkbox" class="sc-import-check" value="'+s.id+'" checked style="accent-color:var(--accent)">'
      +'<canvas width="36" height="36" data-scimpthumb="'+s.id+'" style="width:36px;height:36px;border:1px solid var(--border);border-radius:4px;background:repeating-conic-gradient(#2a2a32 0% 25%,#1a1a20 0% 50%) 50%/6px 6px;image-rendering:pixelated;flex:0 0 auto"></canvas>'
      +'<div style="min-width:0;flex:1"><div style="font-size:11px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(s.name||('sprite_'+s.id))+'</div><div style="font-family:var(--font-mono);font-size:9px;color:var(--text2)">'+s.w+'×'+s.h+' · '+esc(group)+'</div></div>'
      +'</label>';
  }).join('');
  spritesForSheet.forEach(s=>{
    const tc=list.querySelector('[data-scimpthumb="'+s.id+'"]');if(!tc)return;
    const x=tc.getContext('2d');x.clearRect(0,0,36,36);x.imageSmoothingEnabled=false;
    const src=document.createElement('canvas');src.width=s.w;src.height=s.h;
    const sx=src.getContext('2d');sx.imageSmoothingEnabled=false;sx.drawImage(sourceSheet.img,s.x,s.y,s.w,s.h,0,0,s.w,s.h);
    if(s.excludeMask&&Object.keys(s.excludeMask).length){
      const id=sx.getImageData(0,0,s.w,s.h);const dd=id.data;
      for(let py=0;py<s.h;py++)for(let px=0;px<s.w;px++){const key=(s.x+px)+','+(s.y+py);if(s.excludeMask[key]){const i=(py*s.w+px)*4;dd[i+3]=0;}}
      sx.putImageData(id,0,0);
    }
    const scale=Math.min(36/Math.max(1,s.w),36/Math.max(1,s.h));
    const dw=Math.max(1,Math.floor(s.w*scale)),dh=Math.max(1,Math.floor(s.h*scale));
    const dx=Math.floor((36-dw)/2),dy=Math.floor((36-dh)/2);
    x.drawImage(src,dx,dy,dw,dh);
  });
}
function scCloseImportModal(){const modal=document.getElementById('scSpriteImportModal');if(modal)modal.remove();}
function scImportModalToggleAll(checked){const modal=document.getElementById('scSpriteImportModal');if(!modal)return;modal.querySelectorAll('.sc-import-check').forEach(ch=>{ch.checked=!!checked;});}
function scConfirmImportSelection(){
  const modal=document.getElementById('scSpriteImportModal');if(!modal)return;
  const sourceId=parseInt(document.getElementById('scImportSourceSelect').value,10);
  const sourceSheet=sheets.find(sh=>sh.id===sourceId);
  const ids=[...modal.querySelectorAll('.sc-import-check:checked')].map(ch=>parseInt(ch.value,10));
  scCloseImportModal();
  scImportSpritesFromSheet(sourceSheet,ids);
}
function scAddSnippedSprites(){
  const availableTabs=sheets.filter(sh=>sh.sprites&&sh.sprites.length>0);
  if(!availableTabs.length){toast('No snipped sprites available in any tab');return;}
  const modal=document.createElement('div');
  modal.className='modal-overlay';
  modal.id='scSpriteImportModal';
  modal.style.display='flex';
  modal.onclick=e=>{if(e.target===modal)scCloseImportModal();};
  modal.innerHTML='<div class="modal" style="width:min(620px,92vw);max-height:84vh;display:flex;flex-direction:column">'
    +'<h3>Import Snipped Sprites</h3>'
    +'<div style="font-size:11px;color:var(--text2);margin-bottom:10px">Pick a source tab, then import the whole set or just the sprites you want.</div>'
    +'<label>Source Tab</label>'
    +'<select id="scImportSourceSelect" onchange="scUpdateImportSpritePicker()" style="margin-bottom:8px">'
    +availableTabs.map(sh=>'<option value="'+sh.id+'">'+esc(sh.name)+' ('+(sh.sprites||[]).length+')</option>').join('')
    +'</select>'
    +'<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px"><div id="scImportSourceSummary" style="font-family:var(--font-mono);font-size:10px;color:var(--text2);flex:1"></div><button class="btn sm" onclick="scImportModalToggleAll(true)">All</button><button class="btn sm" onclick="scImportModalToggleAll(false)">None</button></div>'
    +'<div id="scImportSpriteChoices" style="flex:1;overflow:auto;border:1px solid var(--border);border-radius:8px;padding:4px 10px;background:var(--surface2)"></div>'
    +'<div class="actions" style="margin-top:12px"><button class="btn" onclick="scCloseImportModal()">Cancel</button><button class="btn primary" onclick="scConfirmImportSelection()">Import Selected</button></div>'
    +'</div>';
  document.body.appendChild(modal);
  scUpdateImportSpritePicker();
}

function scImportFiles(files){
  let pending=0;
  const valid=[...files].filter(f=>f.type.startsWith('image/'));
  if(valid.length)peSaveState();
  for(let i=0;i<files.length;i++){
    const f=files[i];if(!f.type.startsWith('image/'))continue;
    pending++;
    const reader=new FileReader();
    reader.onload=ev=>{
      const im=new Image();im.onload=()=>{
        const sp=peCreateSpriteData(im.width,im.height,f.name.replace(/\.[^.]+$/,''));
        const c=document.createElement('canvas');c.width=im.width;c.height=im.height;c.getContext('2d').drawImage(im,0,0);
        sp.frames[0].layers[0].data=c.getContext('2d').getImageData(0,0,im.width,im.height);
        peSprites.push(sp);
        scSheetSprites.push({id:scNextId++,spriteId:sp.id,x:0,y:0});
        pending--;
        if(pending<=0){scAutoArrange();scUpdateSpriteList();peRender();toast('Imported '+valid.length+' file(s)');}
      };im.src=ev.target.result;
    };reader.readAsDataURL(f);
  }
}

function scAutoArrange(){
  if(!scSheetSprites.length)return;
  peSaveState();
  const pad=parseInt(document.getElementById('scPad')?.value)||1;
  const lockedEntries=[];
  const movableEntries=[];
  scSheetSprites.forEach(ss=>{const sp=peSprites.find(s=>s.id===ss.spriteId);if(sp&&sp._locked)lockedEntries.push({ss,sp});else movableEntries.push({ss,sp});});
  // Group sprites by size (w×h) for clean rows
  const groups=new Map();
  movableEntries.forEach(({ss,sp})=>{
    const key=sp?(sp.w+'x'+sp.h):'0x0';
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push({ss,sp});
  });
  // Sort groups by sprite height descending (tallest rows first)
  const sortedGroups=[...groups.values()].sort((a,b)=>(b[0].sp?.h||0)-(a[0].sp?.h||0));
  // Auto-detect columns from user input or default
  let userCols=parseInt(document.getElementById('scCols')?.value)||0;
  // Place sprites row by row, grouped by size
  let curX=0,curY=0,rowH=0,maxW=0;
  sortedGroups.forEach(group=>{
    const cellW=group[0].sp?group[0].sp.w:32;
    const cellH=group[0].sp?group[0].sp.h:32;
    const cols=userCols||Math.max(1,Math.floor(800/(cellW+pad)));
    // Update cell size inputs to show detected values
    const cwI=document.getElementById('scCellW'),chI=document.getElementById('scCellH');
    if(!userCols&&cwI)cwI.value=cellW;if(!userCols&&chI)chI.value=cellH;
    let col=0;
    group.forEach(({ss})=>{
      if(col>=cols){col=0;curX=0;curY+=rowH+pad;rowH=0;}
      ss.x=curX;ss.y=curY;
      curX+=cellW+pad;
      rowH=Math.max(rowH,cellH);
      maxW=Math.max(maxW,curX);
      col++;
    });
    // Next group starts on a new row
    curY+=rowH+pad;curX=0;rowH=0;
  });
  lockedEntries.forEach(({ss})=>{ss.x=0;ss.y=0;});
  // Auto-expand canvas
  let needW=0,needH=0;
  scSheetSprites.forEach(ss=>{const sp=peSprites.find(s=>s.id===ss.spriteId);if(sp){needW=Math.max(needW,ss.x+sp.w);needH=Math.max(needH,ss.y+sp.h);}});
  scSheetW=Math.max(needW,64);scSheetH=Math.max(needH,64);
  const swi=document.getElementById('scSheetWInput'),shi=document.getElementById('scSheetHInput');
  if(swi)swi.value=scSheetW;if(shi)shi.value=scSheetH;
  scUpdateSpriteList();peRender();
  toast('Arranged '+scSheetSprites.length+' sprites — grouped by size');
}

function scRemoveSprite(id){peSaveState();scSheetSprites=scSheetSprites.filter(s=>s.id!==id);if(scSelectedId===id)scSelectedId=null;scSelectedIds.delete(id);scUpdateSpriteList();peRender();}
let scSelectedIds=new Set();
function scSelectAll(){scSelectedIds.clear();scSheetSprites.forEach(ss=>scSelectedIds.add(ss.id));scSelectedId=scSheetSprites.length?scSheetSprites[0].id:null;scUpdateSpriteList();peRender();}
function scDeselectAll(){scSelectedIds.clear();scSelectedId=null;scUpdateSpriteList();peRender();}
function scSetSheetSize(dim,val){peSaveState();const n=Math.max(1,+val||1);if(dim==='w')scSheetW=n;else scSheetH=n;peRender();}
function scAddBlankSprite(){
  peSaveState();
  var sp=peCreateSpriteData(32,32,'blank_'+(peSprites.length+1));
  peSprites.push(sp);
  scSheetSprites.push({id:scNextId++,spriteId:sp.id,x:0,y:0});
  scAutoArrange();scUpdateSpriteList();peRender();toast('Added blank sprite');
}
function scDuplicateSelected(){
  var sel=scSheetSprites.filter(function(ss){return scSelectedIds.has(ss.id)||(ss.id===scSelectedId);});
  if(!sel.length){toast('Select sprite(s) first');return;}
  peSaveState();
  sel.forEach(function(ss){scSheetSprites.push({id:scNextId++,spriteId:ss.spriteId,x:ss.x+8,y:ss.y+8});});
  scUpdateSpriteList();peRender();toast('Duplicated '+sel.length);
}
function scDeleteSelected(){
  var ids=new Set(scSelectedIds);if(scSelectedId)ids.add(scSelectedId);
  if(!ids.size){toast('Select sprite(s) first');return;}
  peSaveState();
  scSheetSprites=scSheetSprites.filter(function(s){return !ids.has(s.id);});
  scSelectedId=null;scSelectedIds.clear();scUpdateSpriteList();peRender();toast('Removed '+ids.size);
}
function scRenameSelected(){
  var ids=new Set(scSelectedIds);if(scSelectedId)ids.add(scSelectedId);
  if(!ids.size){toast('Select sprite(s) first');return;}
  if(ids.size===1){
    var ssId=[...ids][0],ss=scSheetSprites.find(function(s){return s.id===ssId;});if(!ss)return;
    var sp=peSprites.find(function(s){return s.id===ss.spriteId;});if(!sp)return;
    var n=prompt('Rename:',sp.name);if(n!==null&&n.trim()&&n.trim()!==sp.name){peSaveState();sp.name=n.trim();scUpdateSpriteList();toast('Renamed sprite');}
  } else {
    var pattern=prompt('Rename pattern (use # for number):','sprite_#');
    if(!pattern)return;peSaveState();var i=1;
    scSheetSprites.forEach(function(ss){if(!ids.has(ss.id))return;var sp=peSprites.find(function(s){return s.id===ss.spriteId;});if(sp){sp.name=pattern.replace(/#/g,String(i));i++;}});
    scUpdateSpriteList();toast('Renamed '+ids.size+' sprites');
  }
}
function scFitToContent(){
  if(!scSheetSprites.length)return;
  peSaveState();
  var mx=0,my=0;
  scSheetSprites.forEach(function(ss){var sp=peSprites.find(function(s){return s.id===ss.spriteId;});if(sp){mx=Math.max(mx,ss.x+sp.w);my=Math.max(my,ss.y+sp.h);}});
  scSheetW=mx||256;scSheetH=my||256;
  var wi=document.getElementById('scSheetWInput'),hi=document.getElementById('scSheetHInput');
  if(wi)wi.value=scSheetW;if(hi)hi.value=scSheetH;
  peRender();toast('Sheet resized to '+scSheetW+'x'+scSheetH);
}
function scExportWithManifest(){
  if(!scSheetSprites.length){toast('No sprites on sheet');return;}
  var JSZipLib=getJSZipOrToast();if(!JSZipLib)return;
  var z=new JSZipLib();
  var c=document.createElement('canvas');c.width=scSheetW;c.height=scSheetH;
  var ctx=c.getContext('2d');ctx.imageSmoothingEnabled=false;
  var manifest={width:scSheetW,height:scSheetH,sprites:[]};
  scSheetSprites.forEach(function(ss){var sp=peSprites.find(function(s){return s.id===ss.spriteId;});if(!sp)return;ctx.drawImage(peCompositeFrame(sp,0),ss.x,ss.y);manifest.sprites.push({name:sp.name,x:ss.x,y:ss.y,w:sp.w,h:sp.h});});
  z.file('sheet.png',c.toDataURL('image/png').split(',')[1],{base64:true});
  z.file('manifest.json',JSON.stringify(manifest,null,2));
  z.generateAsync({type:'blob'}).then(function(b){var a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=projectName+'_sheet.zip';a.click();});
  toast('Exported sheet + manifest');
}
function scUpdateSpriteList(){
  const el=document.getElementById('scSpriteList');if(!el)return;
  const countBar=document.getElementById('scCountBar');
  const selCount=scSelectedIds.size+(scSelectedId&&!scSelectedIds.has(scSelectedId)?1:0);
  if(countBar)countBar.textContent=scSheetSprites.length+' sprites'+(selCount?' · '+selCount+' selected':'');
  const scSelAct=document.getElementById('scSelActions');if(scSelAct)scSelAct.style.display=selCount>0?'flex':'none';
  el.innerHTML=scSheetSprites.map(ss=>{const sp=peSprites.find(s=>s.id===ss.spriteId);const isSel=ss.id===scSelectedId||scSelectedIds.has(ss.id);const locked=!!(sp&&sp._locked);const name=sp&&sp._isSheetBase?'sheet_base':(sp?sp.name:'?');return'<div class="sc-item'+(isSel?' selected':'')+(locked?' locked':'')+'" data-scid="'+ss.id+'"><div class="thumb"><canvas width="32" height="32" data-sct="'+ss.id+'" style="image-rendering:pixelated"></canvas></div><div class="info"><div class="name">'+esc(name)+(locked?' <span style="font-size:8px;color:var(--text2)">(locked)</span>':'')+'</div><div class="dims">'+(sp?sp.w+'×'+sp.h:'?')+' @ '+ss.x+','+ss.y+'</div></div>'+(locked?'':'<button class="del-btn" onclick="event.stopPropagation();scRemoveSprite('+ss.id+')">×</button>')+'</div>';}).join('')||'<div style="padding:16px;text-align:center;color:var(--text2);font-size:11px;">No sprites yet.<br>Add from snipped sheets, import images, or create blank sprites.</div>';
  // Click handler for multi-select
  el.querySelectorAll('.sc-item').forEach(item=>{item.addEventListener('click',function(e){
    const id=parseInt(item.dataset.scid);
    const ss=scSheetSprites.find(s=>s.id===id);const sp=ss?peSprites.find(s=>s.id===ss.spriteId):null;
    if(sp&&sp._locked)return;
    if(e.shiftKey||e.ctrlKey||e.metaKey){if(scSelectedIds.has(id))scSelectedIds.delete(id);else scSelectedIds.add(id);scSelectedId=id;}
    else{scSelectedIds.clear();scSelectedId=id;scSelectedIds.add(id);}
    scUpdateSpriteList();peRender();
  });});
  // Render thumbnails
  scSheetSprites.forEach(ss=>{const sp=peSprites.find(s=>s.id===ss.spriteId);if(!sp)return;const tc=el.querySelector('[data-sct="'+ss.id+'"]');if(tc){const x=tc.getContext('2d');x.clearRect(0,0,32,32);x.imageSmoothingEnabled=false;x.drawImage(peCompositeFrame(sp,0),0,0,32,32);}});
}

function scExportSheet(){
  if(!scSheetSprites.length){toast('No sprites on sheet');return;}
  const c=document.createElement('canvas');c.width=scSheetW;c.height=scSheetH;
  const ctx=c.getContext('2d');ctx.imageSmoothingEnabled=false;
  scSheetSprites.forEach(ss=>{const sp=peSprites.find(s=>s.id===ss.spriteId);if(!sp)return;ctx.drawImage(peCompositeFrame(sp,0),ss.x,ss.y);});
  c.toBlob(b=>{const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=projectName+'_composed_sheet.png';a.click();});
  toast('Sheet exported');
}


function scResolvePlacementMeta(sm,cats,fallbackCatId,fallbackSubcatId){
  const cx=sm.x+sm.w/2,cy=sm.y+sm.h/2;
  let resolvedCatId=null,resolvedSubcatId=null;
  (cats||[]).forEach(cat=>{
    if(resolvedCatId!==null||!cat.region)return;
    const r=cat.region;
    if(cx>=r.x&&cx<r.x+r.w&&cy>=r.y&&cy<r.y+r.h){
      resolvedCatId=cat.id;
      (cat.subcats||[]).forEach(sc=>{
        if(resolvedSubcatId!==null||!sc.region)return;
        const sr=sc.region;
        if(cx>=sr.x&&cx<sr.x+sr.w&&cy>=sr.y&&cy<sr.y+sr.h)resolvedSubcatId=sc.id;
      });
    }
  });
  if(resolvedCatId===null&&fallbackCatId!=null)resolvedCatId=null;
  if(resolvedCatId===null)return{categoryId:null,subcatId:null};
  return{categoryId:resolvedCatId,subcatId:resolvedSubcatId};
}

function applyComposeToTargetTab(targetSheetId,opts){
  opts=opts||{};
  if(!scSheetSprites.length||!targetSheetId)return false;
  const sh=sheets.find(s=>s.id===targetSheetId);if(!sh)return false;
  const prevCategories=sh.categories?JSON.parse(JSON.stringify(sh.categories)):[];
  const prevTagCategories=sh.tagCategories?JSON.parse(JSON.stringify(sh.tagCategories)):JSON.parse(JSON.stringify(tagCategories));
  const c=document.createElement('canvas');c.width=scSheetW;c.height=scSheetH;
  const ctx=c.getContext('2d');ctx.imageSmoothingEnabled=false;
  const spriteManifest=[];
  scSheetSprites.forEach(ss=>{
    const sp=peSprites.find(s=>s.id===ss.spriteId);
    if(!sp)return;
    ctx.drawImage(peCompositeFrame(sp,Math.min(sp.activeFrame||0,sp.frames.length-1)),ss.x,ss.y);
    if(!sp._isSheetBase){
      spriteManifest.push({x:ss.x,y:ss.y,w:sp.w,h:sp.h,name:sp.name,categoryId:sp._snipCatId||null,subcatId:sp._snipSubcatId||null,tags:sp._snipTags?{...sp._snipTags}:{}});
    }
  });
  sh.img=c;sh.imgW=scSheetW;sh.imgH=scSheetH;sh.originalFileData=c.toDataURL('image/png');sh.originalFileName='composed_sheet.png';
  sh.sprites=spriteManifest.map((sm,idx)=>{const resolved=scResolvePlacementMeta(sm,prevCategories,sm.categoryId,sm.subcatId);return{id:idx+1,x:sm.x,y:sm.y,w:sm.w,h:sm.h,name:sm.name,categoryId:resolved.categoryId,subcatId:resolved.subcatId,tags:sm.tags||{}};});
  sh.categories=prevCategories;sh.tagCategories=prevTagCategories;
  sh.nextSpriteId=sh.sprites.length+1;sh.nextCatId=sh.nextCatId||1;sh.nextSubcatId=sh.nextSubcatId||1;sh.selectedSpriteIds=[];sh.activeCategoryId=null;sh.openCategories=[];sh.activeSubcatId=null;
  if(activeSheetId===targetSheetId){
    img=sh.img;imgW=sh.imgW;imgH=sh.imgH;originalFileData=sh.originalFileData;originalFileName=sh.originalFileName;
    sprites=sh.sprites;categories=sh.categories;tagCategories=sh.tagCategories;nextSpriteId=sh.nextSpriteId;nextCatId=sh.nextCatId;nextSubcatId=sh.nextSubcatId;
    selectedSpriteIds=new Set();activeCategoryId=null;activeSubcatId=null;openCategories=new Set();
  }
  saveSheetState&&saveSheetState();
  if(!opts.silent)toast('Composed sheet saved to current tab with '+spriteManifest.length+' sprite'+(spriteManifest.length===1?'':'s'));
  return true;
}

function exportComposeAsTab(){
  if(!scSheetSprites.length)return;
  // Render the sheet image synchronously
  const c=document.createElement('canvas');c.width=scSheetW;c.height=scSheetH;
  const ctx=c.getContext('2d');ctx.imageSmoothingEnabled=false;
  // Build sprite manifest synchronously while peSprites still exists
  const spriteManifest=[];
  scSheetSprites.forEach(ss=>{
    const sp=peSprites.find(s=>s.id===ss.spriteId);
    if(!sp)return;
    ctx.drawImage(peCompositeFrame(sp,0),ss.x,ss.y);
    if(!sp._isSheetBase)spriteManifest.push({x:ss.x,y:ss.y,w:sp.w,h:sp.h,name:sp.name});
  });
  const dataUrl=c.toDataURL('image/png');
  // Load image and create tab
  const i2=new Image();
  i2.onload=()=>{
    const sh={id:nextSheetId++,name:'Composed Sheet',img:i2,imgW:scSheetW,imgH:scSheetH,
      sprites:[],categories:[],tagCategories:JSON.parse(JSON.stringify(tagCategories)),
      nextSpriteId:1,nextCatId:1,nextSubcatId:1,nextTagCatId:4,
      zoom:1,panX:0,panY:0,bgMode:'checker',undoStack:[],redoStack:[],
      selectedSpriteIds:[],activeCategoryId:null,openCategories:[],activeSubcatId:null,
      originalFileData:dataUrl,originalFileName:'composed_sheet.png',animSubcatIds:[],animConfigs:{}};
    // Populate sprites from our pre-captured manifest
    spriteManifest.forEach(sm=>{
      sh.sprites.push({id:sh.nextSpriteId++,x:sm.x,y:sm.y,w:sm.w,h:sm.h,name:sm.name,categoryId:null,subcatId:null,tags:{}});
    });
    sheets.push(sh);
    renderSheetTabs();switchSheet(sh.id);zoomFit();updateExportTabVisibility();
    toast('Composed sheet added as new tab with '+spriteManifest.length+' sprites');
  };
  i2.src=dataUrl;
}


function peInitViewportWatchers(){
  if(window.__peViewportWatchersInit)return;
  window.__peViewportWatchersInit=true;
  const panel=document.getElementById('panel');
  const app=document.getElementById('app');
  if(panel){
    panel.addEventListener('transitionrun',()=>{if(peMode)peScheduleStableRender(18);});
    panel.addEventListener('transitionend',()=>{if(peMode)peScheduleStableRender(10);});
  }
  if(typeof ResizeObserver==='function'){
    const ro=new ResizeObserver(()=>{if(peMode)peScheduleStableRender(8);});
    if(canvasWrap)ro.observe(canvasWrap);
    if(panel)ro.observe(panel);
    if(app)ro.observe(app);
  }
  window.addEventListener('orientationchange',()=>{if(peMode)peScheduleStableRender(20);});
}
peInitViewportWatchers();
