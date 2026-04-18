// ===== GLOBAL HISTORY ACROSS SNIP / EDIT / COMPOSE =====
const GLOBAL_HISTORY_MAX=80;
let globalUndoStack=[];
let globalRedoStack=[];
let globalHistoryRestoring=false;

function ghClone(obj){return JSON.parse(JSON.stringify(obj));}
function ghCloneImageData(imgData){return new ImageData(new Uint8ClampedArray(imgData.data),imgData.width,imgData.height);}
function ghImageToDataURL(source){
  if(!source)return null;
  const c=document.createElement('canvas');
  c.width=source.width||source.imgW||1;
  c.height=source.height||source.imgH||1;
  const x=c.getContext('2d');
  x.imageSmoothingEnabled=false;
  try{x.drawImage(source,0,0);}catch(e){return null;}
  return c.toDataURL('image/png');
}
function ghCaptureSheet(sh){
  const isActive=sh.id===activeSheetId&&(!peMode||peMode==='edit-sheet');
  const liveImg=isActive&&img?img:sh.img;
  const liveDataUrl=ghImageToDataURL(liveImg)||(isActive&&typeof originalFileData==='string'?originalFileData:null)||sh.originalFileData||null;
  return {
    id:sh.id,name:sh.name,imgDataUrl:liveDataUrl,imgW:isActive&&img?imgW:sh.imgW,imgH:isActive&&img?imgH:sh.imgH,
    originalFileName:sh.originalFileName||'',originalFileData:liveDataUrl||sh.originalFileData,
    sprites:ghClone(isActive?sprites:sh.sprites||[]),categories:ghClone(isActive?categories:sh.categories||[]),tagCategories:ghClone(isActive?tagCategories:sh.tagCategories||[]),
    nextSpriteId:isActive?nextSpriteId:(sh.nextSpriteId||1),nextCatId:isActive?nextCatId:(sh.nextCatId||1),nextSubcatId:isActive?nextSubcatId:(sh.nextSubcatId||1),nextTagCatId:isActive?nextTagCatId:(sh.nextTagCatId||4),
    zoom:isActive?zoom:(sh.zoom||1),panX:isActive?panX:(sh.panX||0),panY:isActive?panY:(sh.panY||0),bgMode:isActive?bgMode:(sh.bgMode||'checker'),
    selectedSpriteIds:ghClone(isActive?[...selectedSpriteIds]:(sh.selectedSpriteIds||[])),activeCategoryId:isActive?activeCategoryId:(sh.activeCategoryId||null),
    openCategories:ghClone(isActive?[...openCategories]:(sh.openCategories||[])),activeSubcatId:isActive?activeSubcatId:(sh.activeSubcatId||null),
    animSubcatIds:ghClone(isActive?[...animSubcatIds]:(sh.animSubcatIds||[])),animConfigs:ghClone(isActive?animConfigs:(sh.animConfigs||{}))
  };
}
function ghCapturePeSprites(){
  return peSprites.map(sp=>({
    id:sp.id,name:sp.name,w:sp.w,h:sp.h,activeFrame:sp.activeFrame||0,activeLayer:sp.activeLayer||0,
    _snipTags:sp._snipTags?ghClone(sp._snipTags):undefined,_snipCatId:sp._snipCatId||null,_snipSubcatId:sp._snipSubcatId||null,
    _frameRefs:sp._frameRefs?ghClone(sp._frameRefs):undefined,_assetType:sp._assetType||null,
    _animDelay:sp._animDelay||100,_animAnchor:sp._animAnchor||'bottom',_animCanvasW:sp._animCanvasW||null,_animCanvasH:sp._animCanvasH||null,
    _animBaseLayers:sp._animBaseLayers?ghClone(sp._animBaseLayers):undefined,_animOffsets:sp._animOffsets?ghClone(sp._animOffsets):undefined,
    frames:sp.frames.map(f=>({layers:f.layers.map(l=>({name:l.name,visible:l.visible,opacity:l.opacity||100,data:ghCloneImageData(l.data)}))}))
  }));
}
function ghCaptureSnapshot(){
  return {
    projectName,activeSheetId,nextSheetId,mode:peMode||'snip',
    savedSnipState:savedSnipState?ghClone(savedSnipState):null,
    sheets:sheets.map(ghCaptureSheet),
    snipState:{tool,zoom,panX,panY,bgMode,selectedSpriteIds:[...selectedSpriteIds],activeCategoryId,activeSubcatId,openCategories:[...openCategories]},
    editorState:{
      peSprites:ghCapturePeSprites(),peActiveSpriteId,peNextSpriteId,peTool,peCurrentColor:ghClone(peCurrentColor),peBgColor:ghClone(peBgColor),peBrushSz,peMirrorX,peMirrorY,
      peSelection:peSelection?ghClone(peSelection):null,peClipboard:peClipboard?{w:peClipboard.w,h:peClipboard.h,data:new Uint8ClampedArray(peClipboard.data)}:null,
      peAnimFps,peOnionSkin,peOnionOp,peRecentColors:ghClone(peRecentColors),panelCollapsed,
      peRectFilled:typeof peRectFilled!=='undefined'?!!peRectFilled:true,peCircleFilled:typeof peCircleFilled!=='undefined'?!!peCircleFilled:true,
      scSheetW,scSheetH,scSheetSprites:ghClone(scSheetSprites),scSelectedId,scSelectedIds:[...scSelectedIds],scNextId,
      peReturnSheetId,peReturnSpriteRef:peReturnSpriteRef?ghClone(peReturnSpriteRef):null,peComposeTargetSheetId,
      peEditSessionKind,peProjectSourceSheetId,peProjectOriginalSpriteRefs:ghClone(peProjectOriginalSpriteRefs)
    }
  };
}
function ghLoadImage(dataUrl){
  return new Promise(resolve=>{
    const i=new Image();
    i.onload=()=>resolve(i);
    i.onerror=()=>resolve(null);
    i.src=dataUrl||'';
  });
}
async function ghRestoreSnapshot(snapshot){
  globalHistoryRestoring=true;
  stopAnimPlay&&stopAnimPlay();
  if(peAnimTimer)clearTimeout(peAnimTimer);
  projectName=snapshot.projectName||'My Project';
  const pn=document.getElementById('projectNameLabel');if(pn)pn.textContent='.'+projectName;
  const rebuilt=[];
  for(const sd of snapshot.sheets||[]){
    const im=await ghLoadImage(sd.imgDataUrl||sd.originalFileData);
    rebuilt.push({
      id:sd.id,name:sd.name,img:im||document.createElement('canvas'),imgW:sd.imgW,imgH:sd.imgH,originalFileName:sd.originalFileName,originalFileData:sd.originalFileData,
      sprites:ghClone(sd.sprites||[]),categories:ghClone(sd.categories||[]),tagCategories:ghClone(sd.tagCategories||[]),nextSpriteId:sd.nextSpriteId||1,nextCatId:sd.nextCatId||1,nextSubcatId:sd.nextSubcatId||1,nextTagCatId:sd.nextTagCatId||4,
      zoom:sd.zoom||1,panX:sd.panX||0,panY:sd.panY||0,bgMode:sd.bgMode||'checker',undoStack:[],redoStack:[],selectedSpriteIds:ghClone(sd.selectedSpriteIds||[]),activeCategoryId:sd.activeCategoryId||null,openCategories:ghClone(sd.openCategories||[]),activeSubcatId:sd.activeSubcatId||null,animSubcatIds:ghClone(sd.animSubcatIds||[]),animConfigs:ghClone(sd.animConfigs||{})
    });
  }
  sheets=rebuilt;nextSheetId=snapshot.nextSheetId||1;activeSheetId=snapshot.activeSheetId||null;
  peUndoStack=[];peRedoStack=[];undoStack=[];redoStack=[];
  peSprites=(snapshot.editorState?.peSprites||[]).map(sp=>({
    id:sp.id,name:sp.name,w:sp.w,h:sp.h,activeFrame:sp.activeFrame||0,activeLayer:sp.activeLayer||0,_snipTags:sp._snipTags?ghClone(sp._snipTags):undefined,_snipCatId:sp._snipCatId||null,_snipSubcatId:sp._snipSubcatId||null,_frameRefs:sp._frameRefs?ghClone(sp._frameRefs):undefined,
    _assetType:sp._assetType||null,_animDelay:sp._animDelay||100,_animAnchor:sp._animAnchor||'bottom',_animCanvasW:sp._animCanvasW||null,_animCanvasH:sp._animCanvasH||null,_animBaseLayers:sp._animBaseLayers?ghClone(sp._animBaseLayers):undefined,_animOffsets:sp._animOffsets?ghClone(sp._animOffsets):undefined,
    frames:sp.frames.map(f=>({layers:f.layers.map(l=>({name:l.name,visible:l.visible,opacity:l.opacity||100,data:ghCloneImageData(l.data)}))}))
  }));
  peActiveSpriteId=snapshot.editorState?.peActiveSpriteId||null;peNextSpriteId=snapshot.editorState?.peNextSpriteId||1;peTool=snapshot.editorState?.peTool||'pencil';
  peCurrentColor=snapshot.editorState?.peCurrentColor?ghClone(snapshot.editorState.peCurrentColor):{r:0,g:0,b:0,a:255};
  peBgColor=snapshot.editorState?.peBgColor?ghClone(snapshot.editorState.peBgColor):{r:255,g:255,b:255,a:255};
  peBrushSz=snapshot.editorState?.peBrushSz||1;peMirrorX=!!snapshot.editorState?.peMirrorX;peMirrorY=!!snapshot.editorState?.peMirrorY;
  peSelection=snapshot.editorState?.peSelection?ghClone(snapshot.editorState.peSelection):null;
  peClipboard=snapshot.editorState?.peClipboard?{w:snapshot.editorState.peClipboard.w,h:snapshot.editorState.peClipboard.h,data:new Uint8ClampedArray(snapshot.editorState.peClipboard.data)}:null;
  peAnimFps=snapshot.editorState?.peAnimFps||8;peOnionSkin=!!snapshot.editorState?.peOnionSkin;peOnionOp=snapshot.editorState?.peOnionOp||0.3;peRecentColors=ghClone(snapshot.editorState?.peRecentColors||[]);
  panelCollapsed=!!snapshot.editorState?.panelCollapsed;
  if(typeof peRectFilled!=='undefined')peRectFilled=snapshot.editorState?.peRectFilled!==undefined?!!snapshot.editorState.peRectFilled:true;
  if(typeof peCircleFilled!=='undefined')peCircleFilled=snapshot.editorState?.peCircleFilled!==undefined?!!snapshot.editorState.peCircleFilled:true;
  scSheetW=snapshot.editorState?.scSheetW||256;scSheetH=snapshot.editorState?.scSheetH||256;scSheetSprites=ghClone(snapshot.editorState?.scSheetSprites||[]);scSelectedId=snapshot.editorState?.scSelectedId||null;scSelectedIds=new Set(snapshot.editorState?.scSelectedIds||[]);scNextId=snapshot.editorState?.scNextId||1;
  peReturnSheetId=snapshot.editorState?.peReturnSheetId||null;peReturnSpriteRef=snapshot.editorState?.peReturnSpriteRef?ghClone(snapshot.editorState.peReturnSpriteRef):null;peComposeTargetSheetId=snapshot.editorState?.peComposeTargetSheetId||null;
  peEditSessionKind=snapshot.editorState?.peEditSessionKind||'single';peProjectSourceSheetId=snapshot.editorState?.peProjectSourceSheetId||null;peProjectOriginalSpriteRefs=ghClone(snapshot.editorState?.peProjectOriginalSpriteRefs||[]);
  savedSnipState=snapshot.savedSnipState?ghClone(snapshot.savedSnipState):null;
  peMode=null;
  const panel=document.getElementById('panel');
  restoreToolbarToSnip();
  document.getElementById('peMirrorIndicator').style.display='none';
  if(panel&&panel.dataset.origInner){panel.innerHTML=panel.dataset.origInner;delete panel.dataset.origInner;}
  renderSheetTabs();
  if(snapshot.mode==='snip'){
    if(sheets.length&&activeSheetId&&sheets.find(s=>s.id===activeSheetId)){switchSheet(activeSheetId);}
    else if(sheets.length){switchSheet(sheets[0].id);}
    else showEmptyWorkspace();
    tool=snapshot.snipState?.tool||tool;
    zoom=snapshot.snipState?.zoom||zoom;panX=snapshot.snipState?.panX||panX;panY=snapshot.snipState?.panY||panY;bgMode=snapshot.snipState?.bgMode||bgMode;
    selectedSpriteIds=new Set(snapshot.snipState?.selectedSpriteIds||[]);activeCategoryId=snapshot.snipState?.activeCategoryId||null;activeSubcatId=snapshot.snipState?.activeSubcatId||null;openCategories=new Set(snapshot.snipState?.openCategories||[]);
    if(img)render();refreshAll();
  } else if(snapshot.mode==='edit-sheet'){
    if(sheets.length&&activeSheetId&&sheets.find(s=>s.id===activeSheetId)){switchSheet(activeSheetId);}
    peMode='edit-sheet';swapToolbarToEdit();panel.dataset.origInner=panel.innerHTML;showEditPanel();document.getElementById('peMirrorIndicator').style.display='flex';updateModeIndicator();
    zoom=snapshot.snipState?.zoom||zoom;panX=snapshot.snipState?.panX||panX;panY=snapshot.snipState?.panY||panY;
    if(typeof peSyncEditorUiState==='function')peSyncEditorUiState({skipStatus:true});
    render();refreshAll();
  } else if(snapshot.mode==='edit'){
    if(activeSheetId&&sheets.find(s=>s.id===activeSheetId))loadSheetState(activeSheetId);
    peMode='edit';showSheetWorkspace();swapToolbarToEdit();showEditPanel();document.getElementById('peMirrorIndicator').style.display='flex';updateModeIndicator();
    zoom=snapshot.snipState?.zoom||zoom;panX=snapshot.snipState?.panX||panX;panY=snapshot.snipState?.panY||panY;
    if(typeof peSyncEditorUiState==='function')peSyncEditorUiState({skipStatus:true});
    peRefreshAll();
  } else if(snapshot.mode==='compose'){
    if(activeSheetId&&sheets.find(s=>s.id===activeSheetId))loadSheetState(activeSheetId);
    peMode='compose';showSheetWorkspace();swapToolbarToCompose();showComposePanel();updateModeIndicator();
    zoom=snapshot.snipState?.zoom||zoom;panX=snapshot.snipState?.panX||panX;panY=snapshot.snipState?.panY||panY;
    if(typeof peSyncEditorUiState==='function')peSyncEditorUiState({skipStatus:true});
    peRefreshAll();
  }
  updateModeIndicator();
  updateGlobalUndoRedo();
  if(typeof updateActiveToolLabel==='function')updateActiveToolLabel();
  if(typeof peForceCanvasRefresh==='function')peForceCanvasRefresh(14);
  else if(img){render();refreshAll&&refreshAll();}
  globalHistoryRestoring=false;
}

function syncStateForGlobalHistory(){
  if(!peMode&&activeSheetId&&typeof saveSheetState==='function')saveSheetState();
  if(peMode==='edit-sheet'&&activeSheetId){
    const sh=sheets.find(s=>s.id===activeSheetId);
    if(sh&&img){sh.img=img;sh.imgW=imgW;sh.imgH=imgH;sh.originalFileData=ghImageToDataURL(img)||sh.originalFileData;}
  }
}
function pushGlobalHistory(){
  if(globalHistoryRestoring)return;
  syncStateForGlobalHistory();
  globalUndoStack.push(ghCaptureSnapshot());
  if(globalUndoStack.length>GLOBAL_HISTORY_MAX)globalUndoStack.shift();
  globalRedoStack=[];
  updateGlobalUndoRedo();
}
async function globalUndo(){
  if(!globalUndoStack.length)return;
  syncStateForGlobalHistory();
  globalRedoStack.push(ghCaptureSnapshot());
  const snapshot=globalUndoStack.pop();
  await ghRestoreSnapshot(snapshot);
  toast('Undo');
}
async function globalRedo(){
  if(!globalRedoStack.length)return;
  syncStateForGlobalHistory();
  globalUndoStack.push(ghCaptureSnapshot());
  const snapshot=globalRedoStack.pop();
  await ghRestoreSnapshot(snapshot);
  toast('Redo');
}
function updateGlobalUndoRedo(){
  const u=!globalUndoStack.length,r=!globalRedoStack.length;
  const ub=document.getElementById('undoBtn'),rb=document.getElementById('redoBtn');
  if(ub)ub.disabled=u; if(rb)rb.disabled=r;
  const peb=document.getElementById('peUndoBtn'),per=document.getElementById('peRedoBtn');
  if(peb)peb.disabled=u; if(per)per.disabled=r;
}
const _origSaveState=saveState;
saveState=function(){pushGlobalHistory();return _origSaveState();};
const _origPeSaveState=peSaveState;
peSaveState=function(){pushGlobalHistory();return _origPeSaveState();};
if(typeof peSheetSaveState==='function'){const _origPeSheetSaveState=peSheetSaveState;peSheetSaveState=function(){pushGlobalHistory();return _origPeSheetSaveState();};}
undo=globalUndo;redo=globalRedo;
peUndo=globalUndo;peRedo=globalRedo;
if(typeof peSheetUndo==='function')peSheetUndo=globalUndo;
if(typeof peSheetRedo==='function')peSheetRedo=globalRedo;
const _origUpdateUndoRedo=updateUndoRedo;
updateUndoRedo=function(){_origUpdateUndoRedo();updateGlobalUndoRedo();};
const _origRefreshAll=refreshAll;
refreshAll=function(){_origRefreshAll();updateGlobalUndoRedo();};
const _origPeRefreshAll=peRefreshAll;
peRefreshAll=function(){_origPeRefreshAll();updateGlobalUndoRedo();};
updateGlobalUndoRedo();
