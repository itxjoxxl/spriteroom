// ===== AUTOSAVE TO INDEXEDDB =====
const AUTOSAVE_KEY='spriteroom_autosave';
const AUTOSAVE_INTERVAL=30000; // 30 seconds
let autosaveTimer=null;

function openDB(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open('spriteroom_db',1);
    req.onupgradeneeded=e=>{e.target.result.createObjectStore('saves');};
    req.onsuccess=e=>resolve(e.target.result);
    req.onerror=e=>reject(e.target.error);
  });
}

async function autosave(){
  if(!sheets.length)return;
  try{
    saveSheetState();
    const data={
      projectName,
      timestamp:Date.now(),
      sheets:sheets.map(sh=>({
        id:sh.id,name:sh.name,imgW:sh.imgW,imgH:sh.imgH,
        originalFileData:sh.originalFileData,originalFileName:sh.originalFileName,
        sprites:sh.sprites,categories:sh.categories,tagCategories:sh.tagCategories,
        nextSpriteId:sh.nextSpriteId,nextCatId:sh.nextCatId,nextSubcatId:sh.nextSubcatId,nextTagCatId:sh.nextTagCatId,
        zoom:sh.zoom,panX:sh.panX,panY:sh.panY,bgMode:sh.bgMode,
        selectedSpriteIds:sh.selectedSpriteIds||[],activeCategoryId:sh.activeCategoryId,
        openCategories:sh.openCategories||[],activeSubcatId:sh.activeSubcatId,
        animSubcatIds:sh.animSubcatIds||[],animConfigs:sh.animConfigs||{}
      })),
      activeSheetId,nextSheetId
    };
    const db=await openDB();
    const tx=db.transaction('saves','readwrite');
    tx.objectStore('saves').put(data,AUTOSAVE_KEY);
    await new Promise((res,rej)=>{tx.oncomplete=res;tx.onerror=rej;});
    db.close();
  }catch(e){console.warn('Autosave failed:',e);}
}

async function checkForSavedSession(){
  try{
    const db=await openDB();
    const tx=db.transaction('saves','readonly');
    const req=tx.objectStore('saves').get(AUTOSAVE_KEY);
    return new Promise((resolve)=>{
      req.onsuccess=()=>{db.close();resolve(req.result||null);};
      req.onerror=()=>{db.close();resolve(null);};
    });
  }catch(e){return null;}
}

async function restoreSession(){
  try{
    const data=await checkForSavedSession();
    if(!data||!data.sheets||!data.sheets.length){toast('No saved session found');return;}
    projectName=data.projectName||'My Project';
    document.getElementById('projectNameLabel').textContent='.'+projectName;
    sheets=[];activeSheetId=null;nextSheetId=data.nextSheetId||1;
    let loadCount=0;
    for(const sd of data.sheets){
      if(!sd.originalFileData)continue;
      await new Promise(resolve=>{
        const i=new Image();
        i.onload=()=>{
          const sh={...sd,img:i,undoStack:[],redoStack:[]};
          sh.animSubcatIds=sh.animSubcatIds||[];
          sh.animConfigs=sh.animConfigs||{};
          sheets.push(sh);
          loadCount++;
          resolve();
        };
        i.onerror=()=>resolve();
        i.src=sd.originalFileData;
      });
    }
    if(sheets.length){
      const targetId=data.activeSheetId&&sheets.find(s=>s.id===data.activeSheetId)?data.activeSheetId:sheets[0].id;
      renderSheetTabs();switchSheet(targetId);zoomFit();
      updateExportTabVisibility();
      toast('Session restored ('+loadCount+' sheet'+(loadCount>1?'s':'')+')');
      startAutosave();
    } else {toast('Could not restore — image data missing');}
  }catch(e){toast('Restore failed: '+e.message);console.error(e);}
}

async function clearSavedSession(){
  try{
    const db=await openDB();
    const tx=db.transaction('saves','readwrite');
    tx.objectStore('saves').delete(AUTOSAVE_KEY);
    await new Promise((res)=>{tx.oncomplete=res;tx.onerror=res;});
    db.close();
  }catch(e){}
  document.getElementById('restoreBar').style.display='none';
  toast('Saved session cleared');
}

function startAutosave(){
  if(autosaveTimer)clearInterval(autosaveTimer);
  autosaveTimer=setInterval(autosave,AUTOSAVE_INTERVAL);
  // Also save on beforeunload
  window.addEventListener('beforeunload',()=>{autosave();});
}

// On page load, check for saved session
(async()=>{
  try{
    const data=await checkForSavedSession();
    if(data&&data.sheets&&data.sheets.length){
      const bar=document.getElementById('restoreBar');
      if(bar){
        const ago=Date.now()-data.timestamp;
        const mins=Math.floor(ago/60000);
        const timeStr=mins<1?'just now':mins<60?mins+'m ago':Math.floor(mins/60)+'h ago';
        bar.querySelector('button').innerHTML='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:4px;"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-5.36L1 10"/></svg>Restore previous session <span style="font-size:9px;color:var(--text2);margin-left:4px;">('+data.sheets.length+' sheet'+(data.sheets.length>1?'s':'')+', '+timeStr+')</span>';
        bar.style.display='block';
      }
    }
  }catch(e){}
})();

// Start autosave when first sheet is added (hook into addSheet)
const _origAddSheet=addSheet;
addSheet=function(file,callback){
  _origAddSheet(file,function(sh){
    startAutosave();
    if(callback)callback(sh);
  });
};

// ===== REMOVE BACKGROUND TOOL =====
let rmbgColor={r:0,g:0,b:0};
let rmbgEyedropperActive=false;

function showRemoveBgModal(){
  if(!img){toast('Load a sprite sheet first');return;}
  rmbgAutoDetect();
  document.getElementById('removeBgModal').style.display='flex';
}

function rmbgAutoDetect(){
  if(!img)return;
  const tc=document.createElement('canvas');tc.width=imgW;tc.height=imgH;
  const tx=tc.getContext('2d');tx.drawImage(img,0,0);
  const d=tx.getImageData(0,0,imgW,imgH).data;
  // Sample corners
  const corners=[[0,0],[imgW-1,0],[0,imgH-1],[imgW-1,imgH-1]];
  const colors=corners.map(([x,y])=>{const i=(y*imgW+x)*4;return{r:d[i],g:d[i+1],b:d[i+2],a:d[i+3]};});
  // If most corners are transparent, detect bg from opaque corners
  const opaqueCorners=colors.filter(c=>c.a>200);
  if(opaqueCorners.length===0){toast('Image appears to already have a transparent background');return;}
  // Find most common corner color
  const colorKey=c=>`${c.r},${c.g},${c.b}`;
  const counts={};opaqueCorners.forEach(c=>{const k=colorKey(c);counts[k]=(counts[k]||0)+1;});
  let bestK=null,bestN=0;Object.entries(counts).forEach(([k,n])=>{if(n>bestN){bestN=n;bestK=k;}});
  const parts=bestK.split(',').map(Number);
  rmbgColor={r:parts[0],g:parts[1],b:parts[2]};
  const hex='#'+[rmbgColor.r,rmbgColor.g,rmbgColor.b].map(v=>v.toString(16).padStart(2,'0')).join('');
  document.getElementById('rmbgColorInput').value=hex;
  document.getElementById('rmbgSwatchPreview').style.background=hex;
  document.getElementById('rmbgColorHex').textContent=hex;
  rmbgUpdatePreview();
}

function rmbgSetColor(hex){
  const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);
  rmbgColor={r,g,b};
  document.getElementById('rmbgSwatchPreview').style.background=hex;
  document.getElementById('rmbgColorHex').textContent=hex;
  rmbgUpdatePreview();
}

function rmbgStartEyedropper(){
  rmbgEyedropperActive=true;
  document.getElementById('removeBgModal').style.display='none';
  canvasWrap.style.cursor='crosshair';
  toast('Click on the image to pick a background color');
}

// Hook into canvas click for eyedropper
interactionLayer.addEventListener('click',function rmbgEyedropperClick(e){
  if(!rmbgEyedropperActive||!img)return;
  rmbgEyedropperActive=false;
  canvasWrap.style.cursor='';
  setTool(tool); // Restore cursor
  const pos=getEventPos(e);
  const px=screenToPixel(pos.x,pos.y);
  const tc=document.createElement('canvas');tc.width=imgW;tc.height=imgH;
  const tx=tc.getContext('2d');tx.drawImage(img,0,0);
  const d=tx.getImageData(0,0,imgW,imgH).data;
  const i=(px.py*imgW+px.px)*4;
  rmbgColor={r:d[i],g:d[i+1],b:d[i+2]};
  const hex='#'+[rmbgColor.r,rmbgColor.g,rmbgColor.b].map(v=>v.toString(16).padStart(2,'0')).join('');
  document.getElementById('rmbgColorInput').value=hex;
  document.getElementById('rmbgSwatchPreview').style.background=hex;
  document.getElementById('rmbgColorHex').textContent=hex;
  document.getElementById('removeBgModal').style.display='flex';
  rmbgUpdatePreview();
},{capture:true});

function rmbgUpdatePreview(){
  if(!img)return;
  const tol=parseInt(document.getElementById('rmbgTolerance').value)||0;
  const bc=document.getElementById('rmbgBeforeCanvas'),ac=document.getElementById('rmbgAfterCanvas');
  const bctx=bc.getContext('2d'),actx=ac.getContext('2d');
  // Draw a preview region (center crop or scaled)
  const previewSize=192;
  bc.width=previewSize;bc.height=previewSize;ac.width=previewSize;ac.height=previewSize;
  const scale=Math.min(previewSize/imgW,previewSize/imgH);
  const dw=imgW*scale,dh=imgH*scale,dx=(previewSize-dw)/2,dy=(previewSize-dh)/2;
  // Before
  bctx.imageSmoothingEnabled=false;bctx.clearRect(0,0,previewSize,previewSize);
  bctx.drawImage(img,0,0,imgW,imgH,dx,dy,dw,dh);
  // After — apply removal
  const tc=document.createElement('canvas');tc.width=imgW;tc.height=imgH;
  const tx=tc.getContext('2d');tx.drawImage(img,0,0);
  const imgData=tx.getImageData(0,0,imgW,imgH);
  const d=imgData.data;
  for(let i=0;i<d.length;i+=4){
    const dr=Math.abs(d[i]-rmbgColor.r),dg=Math.abs(d[i+1]-rmbgColor.g),db=Math.abs(d[i+2]-rmbgColor.b);
    const dist=Math.sqrt(dr*dr+dg*dg+db*db);
    if(dist<=tol){d[i+3]=0;}
    else if(dist<=tol+20){d[i+3]=Math.round(Math.min(255,((dist-tol)/20)*255));}
  }
  tx.putImageData(imgData,0,0);
  actx.imageSmoothingEnabled=false;actx.clearRect(0,0,previewSize,previewSize);
  actx.drawImage(tc,0,0,imgW,imgH,dx,dy,dw,dh);
}

function rmbgApply(){
  if(!img){toast('No image loaded');return;}
  const tol=parseInt(document.getElementById('rmbgTolerance').value)||0;
  const tc=document.createElement('canvas');tc.width=imgW;tc.height=imgH;
  const tx=tc.getContext('2d');tx.drawImage(img,0,0);
  const imgData=tx.getImageData(0,0,imgW,imgH);
  const d=imgData.data;
  let removed=0;
  for(let i=0;i<d.length;i+=4){
    const dr=Math.abs(d[i]-rmbgColor.r),dg=Math.abs(d[i+1]-rmbgColor.g),db=Math.abs(d[i+2]-rmbgColor.b);
    const dist=Math.sqrt(dr*dr+dg*dg+db*db);
    if(dist<=tol){d[i+3]=0;removed++;}
    else if(dist<=tol+20){d[i+3]=Math.round(Math.min(255,((dist-tol)/20)*255));}
  }
  tx.putImageData(imgData,0,0);
  // Replace the current image with the processed one
  const newImg=new Image();
  newImg.onload=()=>{
    img=newImg;
    const sh=sheets.find(s=>s.id===activeSheetId);
    if(sh){sh.img=newImg;sh.originalFileData=tc.toDataURL('image/png');sh.originalFileName=(sh.originalFileName||'sheet').replace(/\.[^.]+$/,'')+'.png';}
    originalFileData=sh?sh.originalFileData:null;
    render();
    document.getElementById('removeBgModal').style.display='none';
    toast('Removed background ('+removed+' pixels)');
  };
  newImg.src=tc.toDataURL('image/png');
}

// ===== GRID TOOL =====
let gridMode='smart'; // 'smart', 'cols', or 'size'
let gridVisible=false;
let gridCells=[]; // [{x,y,w,h}] — computed cells for overlay and slicing

function showGridModal(){
  if(!img){toast('Load a sprite sheet first');return;}
  document.getElementById('gridModal').style.display='flex';
  gridVisible=true;
  updateGridPreview();
}

function closeGridModal(){
  document.getElementById('gridModal').style.display='none';
  clearGridOverlay();
}

function setGridMode(mode){
  gridMode=mode;
  document.getElementById('gridModeSmartBtn').classList.toggle('active-mode',mode==='smart');
  document.getElementById('gridModeColsBtn').classList.toggle('active-mode',mode==='cols');
  document.getElementById('gridModeSizeBtn').classList.toggle('active-mode',mode==='size');
  document.getElementById('gridSmartInputs').style.display=mode==='smart'?'block':'none';
  document.getElementById('gridColsInputs').style.display=mode==='cols'?'block':'none';
  document.getElementById('gridSizeInputs').style.display=mode==='size'?'block':'none';
  document.getElementById('gridUniformInputs').style.display=mode!=='smart'?'block':'none';
  updateGridPreview();
}

function getGridPixelData(){
  const tc=document.createElement('canvas');tc.width=imgW;tc.height=imgH;
  const tx=tc.getContext('2d');tx.drawImage(img,0,0);
  return tx.getImageData(0,0,imgW,imgH).data;
}

// Detect background color from corners
function detectBgColor(d){
  const corners=[[0,0],[imgW-1,0],[0,imgH-1],[imgW-1,imgH-1]];
  const cols=corners.map(([x,y])=>{const i=(y*imgW+x)*4;return{r:d[i],g:d[i+1],b:d[i+2],a:d[i+3]};});
  const opaque=cols.filter(c=>c.a>200);
  if(!opaque.length)return{r:0,g:0,b:0,hasAlpha:true};
  // Most common corner
  const counts={};opaque.forEach(c=>{const k=c.r+','+c.g+','+c.b;counts[k]=(counts[k]||0)+1;});
  let best=null,bestN=0;Object.entries(counts).forEach(([k,n])=>{if(n>bestN){bestN=n;best=k;}});
  const p=best.split(',').map(Number);
  return{r:p[0],g:p[1],b:p[2],hasAlpha:false};
}

function isPixelBackground(d,idx,bg,tol){
  if(d[idx+3]<30)return true; // transparent
  if(bg.hasAlpha)return d[idx+3]<30;
  const dr=Math.abs(d[idx]-bg.r),dg=Math.abs(d[idx+1]-bg.g),db=Math.abs(d[idx+2]-bg.b);
  return(dr+dg+db)<=tol;
}

// Smart detection: find row bands then sprites within each band
function smartDetectCells(){
  if(!img)return[];
  const d=getGridPixelData();
  const tol=parseInt(document.getElementById('gridSmartBgTol').value)||30;
  const minGap=parseInt(document.getElementById('gridSmartMinGap').value)||2;
  const minW=parseInt(document.getElementById('gridSmartMinW').value)||4;
  const minH=parseInt(document.getElementById('gridSmartMinH').value)||4;
  const uniform=document.getElementById('gridSmartUniform').checked;
  const bg=detectBgColor(d);

  // Step 1: Find which rows have content
  const rowContent=new Uint8Array(imgH);
  for(let y=0;y<imgH;y++){
    let found=false;
    for(let x=0;x<imgW&&!found;x++){
      if(!isPixelBackground(d,(y*imgW+x)*4,bg,tol))found=true;
    }
    rowContent[y]=found?1:0;
  }

  // Step 2: Find row bands (merge gaps smaller than minGap)
  const bands=[];
  let inBand=false,bandStart=0,gapCount=0;
  for(let y=0;y<imgH;y++){
    if(rowContent[y]){
      if(!inBand){bandStart=y;inBand=true;}
      gapCount=0;
    } else if(inBand){
      gapCount++;
      if(gapCount>=minGap){
        // End the band at where the gap started
        bands.push({y1:bandStart,y2:y-gapCount,h:y-gapCount-bandStart+1});
        inBand=false;gapCount=0;
      }
    }
  }
  if(inBand)bands.push({y1:bandStart,y2:imgH-1-gapCount,h:imgH-gapCount-bandStart});

  // Step 3: For each band, find column breaks to detect sprites
  const cells=[];
  for(const band of bands){
    if(band.h<minH)continue;
    // Scan columns for content within this band
    const colContent=new Uint8Array(imgW);
    for(let x=0;x<imgW;x++){
      let found=false;
      for(let y=band.y1;y<=band.y2&&!found;y++){
        if(!isPixelBackground(d,(y*imgW+x)*4,bg,tol))found=true;
      }
      colContent[x]=found?1:0;
    }

    // Find sprite column spans (merge gaps smaller than minGap)
    const spans=[];
    let inSpan=false,spanStart=0,colGap=0;
    for(let x=0;x<imgW;x++){
      if(colContent[x]){
        if(!inSpan){spanStart=x;inSpan=true;}
        colGap=0;
      } else if(inSpan){
        colGap++;
        if(colGap>=minGap){
          spans.push({x1:spanStart,x2:x-colGap,w:x-colGap-spanStart+1});
          inSpan=false;colGap=0;
        }
      }
    }
    if(inSpan)spans.push({x1:spanStart,x2:imgW-1-colGap,w:imgW-colGap-spanStart});

    if(uniform&&spans.length>1){
      // Uniform: pad each cell width to the max in this row, keep left edge at detected content
      const maxW=Math.max(...spans.map(s=>s.w));
      for(const span of spans){
        if(span.w<minW)continue;
        const cellW=Math.min(maxW,imgW-span.x1);
        cells.push({x:span.x1,y:band.y1,w:cellW,h:band.h});
      }
    } else {
      // Tight bounding boxes per sprite
      for(const span of spans){
        if(span.w<minW)continue;
        cells.push({x:span.x1,y:band.y1,w:span.w,h:band.h});
      }
    }
  }
  return cells;
}

// Uniform grid cells (cols/rows or cell size mode)
function uniformGridCells(){
  const offX=parseInt(document.getElementById('gridOffX').value)||0;
  const offY=parseInt(document.getElementById('gridOffY').value)||0;
  let cellW,cellH,cols,rows;
  if(gridMode==='cols'){
    cols=Math.max(1,parseInt(document.getElementById('gridCols').value)||1);
    rows=Math.max(1,parseInt(document.getElementById('gridRows').value)||1);
    cellW=Math.floor((imgW-offX)/cols);
    cellH=Math.floor((imgH-offY)/rows);
  } else {
    cellW=Math.max(1,parseInt(document.getElementById('gridCellW').value)||1);
    cellH=Math.max(1,parseInt(document.getElementById('gridCellH').value)||1);
    cols=Math.floor((imgW-offX)/cellW);
    rows=Math.floor((imgH-offY)/cellH);
  }
  const cells=[];
  for(let r=0;r<rows;r++){
    for(let c=0;c<cols;c++){
      const x=offX+c*cellW,y=offY+r*cellH;
      const w=Math.min(cellW,imgW-x),h=Math.min(cellH,imgH-y);
      if(w>0&&h>0)cells.push({x,y,w,h});
    }
  }
  return cells;
}

function updateGridPreview(){
  if(!img||!gridVisible)return;
  if(gridMode==='smart'){
    gridCells=smartDetectCells();
    // Count unique row bands
    const rowSet=new Set(gridCells.map(c=>c.y));
    document.getElementById('gridInfo').textContent='Found '+gridCells.length+' sprites across '+rowSet.size+' rows';
  } else {
    gridCells=uniformGridCells();
    const offX=parseInt(document.getElementById('gridOffX').value)||0;
    const offY=parseInt(document.getElementById('gridOffY').value)||0;
    let cols,rows;
    if(gridMode==='cols'){
      cols=Math.max(1,parseInt(document.getElementById('gridCols').value)||1);
      rows=Math.max(1,parseInt(document.getElementById('gridRows').value)||1);
    } else {
      const cellW=Math.max(1,parseInt(document.getElementById('gridCellW').value)||1);
      const cellH=Math.max(1,parseInt(document.getElementById('gridCellH').value)||1);
      cols=Math.floor((imgW-offX)/cellW);rows=Math.floor((imgH-offY)/cellH);
    }
    document.getElementById('gridInfo').textContent='Grid: '+cols+'×'+rows+' — '+gridCells.length+' cells';
  }
  renderGridOverlay();
}

function renderGridOverlay(){
  const gc=document.getElementById('gridCanvas');
  if(!img||!gridVisible||!gridCells.length){gc.width=0;gc.height=0;return;}
  const cw=canvasWrap.clientWidth,ch=canvasWrap.clientHeight;
  gc.width=cw;gc.height=ch;
  gc.style.width=cw+'px';gc.style.height=ch+'px';
  const ctx=gc.getContext('2d');ctx.clearRect(0,0,cw,ch);
  const opacity=(parseInt(document.getElementById('gridOpacity').value)||60)/100;
  const ox=panX,oy=panY;
  // Draw each cell
  gridCells.forEach(cell=>{
    const sx=ox+cell.x*zoom,sy=oy+cell.y*zoom,sw=cell.w*zoom,sh=cell.h*zoom;
    ctx.strokeStyle='rgba(255,107,53,'+opacity+')';
    ctx.lineWidth=1;
    ctx.strokeRect(sx,sy,sw,sh);
    ctx.fillStyle='rgba(255,107,53,'+(opacity*0.08)+')';
    ctx.fillRect(sx,sy,sw,sh);
  });
}

function clearGridOverlay(){
  gridVisible=false;gridCells=[];
  const gc=document.getElementById('gridCanvas');
  gc.width=0;gc.height=0;
}

function gridSliceAll(){
  if(!img){toast('No image loaded');return;}
  if(!gridCells.length){toast('No grid cells to slice');return;}
  saveState();
  let added=0;
  for(const cell of gridCells){
    // Check for duplicate
    const dup=sprites.some(s=>s.x===cell.x&&s.y===cell.y&&s.w===cell.w&&s.h===cell.h);
    if(dup)continue;
    sprites.push({id:nextSpriteId++,x:cell.x,y:cell.y,w:cell.w,h:cell.h,name:'sprite_'+nextSpriteId,categoryId:null,subcatId:null,tags:{}});
    added++;
  }
  assignSpritesToCategories();
  closeGridModal();
  refreshAll();
  toast('Created '+added+' sprites from grid');
}

// Hook grid overlay into render
const _origRender=render;
// We'll patch render after it's defined — using a simpler approach
// Redraw grid overlay whenever the main render runs

// ===== CHANGELOG =====
function showChangelog(){
  const modal=document.getElementById('changelogModal');
  const body=document.getElementById('changelogBody');
  // Try to fetch changelog.md, fallback to inline
  fetch('changelog.md').then(r=>{if(!r.ok)throw new Error();return r.text();}).then(md=>{
    body.innerHTML=renderChangelogMd(md);
  }).catch(()=>{
    body.innerHTML=renderChangelogMd(INLINE_CHANGELOG);
  });
  modal.style.display='flex';
}
function renderChangelogMd(md){
  return md.split('\n').map(line=>{
    if(line.startsWith('## '))return '<h4 style="font-family:var(--font-mono);font-size:12px;color:var(--accent);margin:12px 0 6px;">'+esc(line.slice(3))+'</h4>';
    if(line.startsWith('-- '))return '<div style="padding:2px 0 2px 28px;font-size:11px;color:var(--text);">‣ '+esc(line.slice(3))+'</div>';
    if(line.startsWith('- '))return '<div style="padding:2px 0 2px 12px;font-size:11px;color:var(--text);">• '+esc(line.slice(2))+'</div>';
    if(line.trim()==='')return '<div style="height:4px;"></div>';
    return '<div style="font-size:11px;color:var(--text2);">'+esc(line)+'</div>';
  }).join('');
}
const INLINE_CHANGELOG=`## v1.5
- Integrated pixel editor — edit snipped sprites pixel-by-pixel
-- Pencil, eraser, fill, eyedropper, dither, lighten/darken tools
-- Shape tools: line, rectangle, circle (filled & outline)
-- Layer system with opacity, visibility, merge, flatten
-- Frame animation with FPS control and onion skinning
-- Mirror drawing (X & Y axis symmetry)
-- Selection: copy, cut, paste, flip, delete
-- Color palettes: PICO-8, DB32, NES presets + custom
-- Canvas transforms: flip, rotate, resize, invert, desaturate, brightness, outline
- Create Sprite Sheet tab — compose new sprite sheets
-- Add snipped sprites by group, sub-group, selection, or tag filter
-- Import external images as sprites
-- Grid-based layout with snap, padding, and auto-arrange
-- Export composed sheet as PNG
- Edit mode accessible from Auto menu or right-click sprite list

## v1.4
- Remove background tool 
-- Pick a color to make transparent or auto-detect background
-- Tolerance slider for fine-tuned control over color matching
-- Live preview before applying changes
- Grid slicer with smart detection
-- Auto-detects row bands and individual sprites from pixel content
-- Also supports manual columns/rows or cell-size grid modes
-- Visual grid overlay on canvas with adjustable opacity
- Fix overlapping sprite boxes
-- Detects connected pixel objects within each sprite using flood-fill
-- Shows contour outline around each sprite's primary object
-- Excludes neighbor's pixels on export while keeping box dimensions
- Auto-trim sprites — shrink boxes to tight content bounds
- Restore previous session option
-- Prevents you from losing your work due to accidental refresh, freezes, or session timeout
- Consistent "Groups / Sub-groups" naming across the tool
- Toolbar click feedback — tool name flashes on click and shows on hover with keyboard shortcut
- Enhanced animation tool with canvas size controls and per-frame position nudging
- Advanced rename preview now shows accurate deduplication numbering
- File drops restricted to dropzone area only
- Changelog loads from external file with fallback

## v1.3
- Added version info & change log (duh!)
- Multi-tab projects — work on multiple sprite sheets with tabs
- Animation tool — create and preview animations from subcategories
-- Base layer support — add sprites behind or on top of animation frames
- Custom padding option for repeat tool with live preview
- Other bug fixes and UI tweaks

## v1.2
- Tag system — tag sprites by category via click or lasso
-- Multi-tag mode — apply tags from multiple categories at once
-- Tag visibility — per-category highlight toggle shows tagged/untagged sprites on canvas
-- Tag filtering — filter sprite list by tags in the side panel
- Auto-color tagging — analyze sprite colors with basic, light/dark, or fine detail levels
- Advanced rename — variable-based naming and live preview
- Move tool click-select — click sprites to select, shift-click to add, click empty to deselect
- View toggles — show/hide sprite boxes, category boxes, and subcategory boxes independently
- Other bug fixes and UI tweaks

## v1.1
- Background color picker
- Zoom controls
- Side panel, coordinate display, & status bar
- Group & subgroup system
- Auto-detect sprites
- Repeat pattern tool
- Sprite thumbnails in the sprite list
- JSON import/export 
- Undo/redo system
- Keyboard shortcuts
- Pinch-to-zoom
- Drag-and-drop file loading

## v1.0
- A humble beginning. Just view sprite sheets & draw sprites.
`;
