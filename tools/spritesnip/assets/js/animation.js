// ===== ANIMATION TOOL =====
function resetAnimPanel(){
  stopAnimPlay();
  animFrames=[];animFrameIdx=0;animBaseLayers=[];
  const sel=document.getElementById('animSubcatSelect');if(sel)sel.value='';
  document.getElementById('animExportStatus').textContent='';
  renderAnimFrames();renderBaseLayerList();
  const cv=document.getElementById('animPreviewCanvas');
  const ctx=cv.getContext('2d');cv.width=128;cv.height=128;ctx.clearRect(0,0,128,128);
  updateAnimBtnState(false);
}
function updateAnimBtnState(isExisting){
  const btn=document.getElementById('animSaveBtn');
  const rmBtn=document.getElementById('animRemoveBtn');
  if(isExisting){
    btn.innerHTML='<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> Modify Animation';
    rmBtn.style.display='inline-flex';
  } else {
    btn.innerHTML='<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> Animate';
    rmBtn.style.display='none';
  }
}
function updateAnimSubcatSelect(){
  const sel=document.getElementById('animSubcatSelect');if(!sel)return;
  let h='<option value="">-- Select sub-group --</option>';
  categories.forEach(cat=>{
    (cat.subcats||[]).forEach(sc=>{
      const count=sprites.filter(s=>s.subcatId===sc.id).length;
      const hasBolt=animSubcatIds.has(sc.id);
      h+='<option value="'+sc.id+'"'+(hasBolt?' style="font-weight:bold;"':'')+'>'+esc(cat.name)+' / '+esc(sc.name)+' ('+count+')'+(hasBolt?' \u25CF':'')+'</option>';
    });
  });
  sel.innerHTML=h;
}

function loadAnimFrames(){
  const scId=parseInt(document.getElementById('animSubcatSelect').value);
  stopAnimPlay();
  document.getElementById('animExportStatus').textContent='';
  if(!scId){animFrames=[];animBaseLayers=[];renderAnimFrames();renderBaseLayerList();updateAnimBtnState(false);
    const cv=document.getElementById('animPreviewCanvas');cv.width=128;cv.height=128;cv.getContext('2d').clearRect(0,0,128,128);return;}
  animFrames=sprites.filter(s=>s.subcatId===scId).sort((a,b)=>a.x===b.x?a.y-b.y:a.x-b.x);
  animFrameIdx=0;
  // Load existing animation config if present
  const isExisting=animSubcatIds.has(scId);
  if(isExisting && animConfigs[scId]){
    const cfg=animConfigs[scId];
    animBaseLayers=cfg.baseLayers?cfg.baseLayers.map(bl=>({...bl})):[];
    document.getElementById('animDelaySlider').value=cfg.delay||100;
    document.getElementById('animDelayInput').value=cfg.delay||100;
    document.getElementById('animAnchor').value=cfg.anchor||'bottom';
    document.getElementById('baseLayerOnTop').checked=animBaseLayers.length>0&&animBaseLayers[0].onTop;
  } else {
    animBaseLayers=[];
    document.getElementById('baseLayerOnTop').checked=false;
  }
  updateAnimBtnState(isExisting);
  renderAnimFrames();renderBaseLayerList();renderAnimPreview();
}

function renderAnimFrames(){
  const list=document.getElementById('animFrameList');
  document.getElementById('animFrameCount').textContent='('+animFrames.length+')';
  if(!animFrames.length){list.innerHTML='<span style="font-size:10px;color:var(--text2);">Select a sub-group with sprites</span>';return;}
  list.innerHTML=animFrames.map((s,i)=>{
    return '<div class="anim-frame'+(i===animFrameIdx?' active':'')+'" data-aidx="'+i+'"><canvas width="44" height="44" data-afc="'+i+'"></canvas></div>';
  }).join('');
  animFrames.forEach((s,i)=>{
    const c=list.querySelector('canvas[data-afc="'+i+'"]');if(!c)return;
    const ctx=c.getContext('2d');ctx.imageSmoothingEnabled=false;
    const sc=Math.min(44/s.w,44/s.h);const dw=s.w*sc,dh=s.h*sc;
    for(let y=0;y<44;y+=4)for(let x=0;x<44;x+=4){ctx.fillStyle=(Math.floor(x/4)+Math.floor(y/4))%2===0?'#2a2a32':'#1a1a20';ctx.fillRect(x,y,4,4);}
    ctx.drawImage(img,s.x,s.y,s.w,s.h,(44-dw)/2,(44-dh)/2,dw,dh);
  });
  list.querySelectorAll('.anim-frame').forEach(el=>{
    el.addEventListener('click',()=>{animFrameIdx=parseInt(el.dataset.aidx);renderAnimFrames();renderAnimPreview();});
  });
}

function renderBaseLayerList(){
  const list=document.getElementById('animBaseLayerList');
  if(!animBaseLayers.length){list.innerHTML='<span style="font-size:10px;color:var(--text2);">Click + to add base sprites</span>';return;}
  list.innerHTML=animBaseLayers.map((bl,i)=>{
    const s=sprites.find(sp=>sp.id===bl.spriteId);
    if(!s)return '';
    return '<div class="anim-frame" data-blidx="'+i+'" style="position:relative;"><canvas width="44" height="44" data-blc="'+i+'"></canvas><button class="frame-del" onclick="removeBaseLayer('+i+')">\u00d7</button></div>';
  }).join('');
  animBaseLayers.forEach((bl,i)=>{
    const s=sprites.find(sp=>sp.id===bl.spriteId);if(!s)return;
    const c=list.querySelector('canvas[data-blc="'+i+'"]');if(!c)return;
    const ctx=c.getContext('2d');ctx.imageSmoothingEnabled=false;
    const sc=Math.min(44/s.w,44/s.h);const dw=s.w*sc,dh=s.h*sc;
    for(let y=0;y<44;y+=4)for(let x=0;x<44;x+=4){ctx.fillStyle=(Math.floor(x/4)+Math.floor(y/4))%2===0?'#2a2a32':'#1a1a20';ctx.fillRect(x,y,4,4);}
    ctx.drawImage(img,s.x,s.y,s.w,s.h,(44-dw)/2,(44-dh)/2,dw,dh);
  });
}

function pickBaseLayer(){
  if(!sprites.length){toast('No sprites available');return;}
  // Use selected sprites if any, otherwise prompt to click one
  if(selectedSpriteIds.size){
    selectedSpriteIds.forEach(sid=>{
      if(!animBaseLayers.find(bl=>bl.spriteId===sid)){
        animBaseLayers.push({spriteId:sid,onTop:document.getElementById('baseLayerOnTop').checked});
      }
    });
    renderBaseLayerList();renderAnimPreview();
    toast('Added '+selectedSpriteIds.size+' base sprite(s)');
  } else {
    toast('Select sprite(s) first (use Select mode or lasso), then click + again');
  }
}
function removeBaseLayer(idx){
  animBaseLayers.splice(idx,1);
  renderBaseLayerList();renderAnimPreview();
}
function clearBaseLayers(){
  animBaseLayers=[];
  renderBaseLayerList();renderAnimPreview();
}

function getAnimAnchorOffset(anchor,mw,mh,sw,sh){
  let dx=0,dy=0;
  if(anchor==='center'){dx=(mw-sw)/2;dy=(mh-sh)/2;}
  else if(anchor==='top'){dx=(mw-sw)/2;dy=0;}
  else if(anchor==='bottom'){dx=(mw-sw)/2;dy=mh-sh;}
  else if(anchor==='left'){dx=0;dy=(mh-sh)/2;}
  else if(anchor==='right'){dx=mw-sw;dy=(mh-sh)/2;}
  else if(anchor==='top-left'){dx=0;dy=0;}
  else if(anchor==='top-right'){dx=mw-sw;dy=0;}
  else if(anchor==='bottom-left'){dx=0;dy=mh-sh;}
  else if(anchor==='bottom-right'){dx=mw-sw;dy=mh-sh;}
  return{dx,dy};
}

function renderAnimPreview(){
  const cv=document.getElementById('animPreviewCanvas');
  const ctx=cv.getContext('2d');
  if(!animFrames.length){ctx.clearRect(0,0,cv.width,cv.height);return;}
  // Find max dimensions across frames AND base layers
  let mw=0,mh=0;
  animFrames.forEach(s=>{mw=Math.max(mw,s.w);mh=Math.max(mh,s.h);});
  animBaseLayers.forEach(bl=>{const s=sprites.find(sp=>sp.id===bl.spriteId);if(s){mw=Math.max(mw,s.w);mh=Math.max(mh,s.h);}});
  // Scale up for preview display — ensure minimum preview size with padding
  const previewScale=Math.max(1,Math.min(4,Math.floor(Math.min(260/mw,260/mh))));
  const pw=mw*previewScale,ph=mh*previewScale;
  cv.width=pw;cv.height=ph;
  ctx.clearRect(0,0,pw,ph);
  ctx.imageSmoothingEnabled=false;
  // Draw checkerboard
  const cs=Math.max(4,previewScale*2);
  for(let y=0;y<ph;y+=cs)for(let x=0;x<pw;x+=cs){ctx.fillStyle=(Math.floor(x/cs)+Math.floor(y/cs))%2===0?'#2a2a32':'#1a1a20';ctx.fillRect(x,y,cs,cs);}
  const s=animFrames[animFrameIdx%animFrames.length];
  if(!s)return;
  const anchor=document.getElementById('animAnchor').value;
  const onTop=document.getElementById('baseLayerOnTop').checked;
  // Helper to draw a sprite anchored
  function drawSprite(sp){
    const{dx,dy}=getAnimAnchorOffset(anchor,mw,mh,sp.w,sp.h);
    ctx.drawImage(img,sp.x,sp.y,sp.w,sp.h,dx*previewScale,dy*previewScale,sp.w*previewScale,sp.h*previewScale);
  }
  // Draw base layers behind if not onTop
  if(!onTop) animBaseLayers.forEach(bl=>{const bs=sprites.find(sp=>sp.id===bl.spriteId);if(bs)drawSprite(bs);});
  // Draw animation frame
  drawSprite(s);
  // Draw base layers on top if onTop
  if(onTop) animBaseLayers.forEach(bl=>{const bs=sprites.find(sp=>sp.id===bl.spriteId);if(bs)drawSprite(bs);});
}

function toggleAnimPlay(){
  if(animPlaying){stopAnimPlay();return;}
  if(!animFrames.length){toast('No frames loaded');return;}
  animPlaying=true;
  document.getElementById('animPlayBtn').innerHTML='<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg> Pause';
  animStep();
}
function stopAnimPlay(){
  animPlaying=false;if(animTimer)clearTimeout(animTimer);animTimer=null;
  const btn=document.getElementById('animPlayBtn');
  if(btn)btn.innerHTML='<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;"><polygon points="5 3 19 12 5 21 5 3"/></svg> Play';
}
function animStep(){
  if(!animPlaying||!animFrames.length)return;
  animFrameIdx=(animFrameIdx+1)%animFrames.length;
  renderAnimFrames();renderAnimPreview();
  const delay=parseInt(document.getElementById('animDelayInput').value)||100;
  animTimer=setTimeout(animStep,delay);
}
function updateAnimDelay(val){
  val=Math.max(16,Math.min(2000,parseInt(val)||100));
  document.getElementById('animDelaySlider').value=val;
  document.getElementById('animDelayInput').value=val;
}
document.getElementById('animAnchor').addEventListener('change',renderAnimPreview);

// Per-frame offsets: animFrameOffsets[spriteId] = {x, y}
let animFrameOffsets={};

function animAutoSize(){
  if(!animFrames.length)return;
  let mw=0,mh=0;
  animFrames.forEach(s=>{mw=Math.max(mw,s.w);mh=Math.max(mh,s.h);});
  animBaseLayers.forEach(bl=>{const s=sprites.find(sp=>sp.id===bl.spriteId);if(s){mw=Math.max(mw,s.w);mh=Math.max(mh,s.h);}});
  // Add small padding
  mw=Math.max(mw,1);mh=Math.max(mh,1);
  document.getElementById('animCanvasW').value=mw;
  document.getElementById('animCanvasH').value=mh;
  renderAnimPreview();
}

function nudgeAnimFrame(dx,dy){
  if(!animFrames.length)return;
  const s=animFrames[animFrameIdx%animFrames.length];
  if(!s)return;
  if(!animFrameOffsets[s.id])animFrameOffsets[s.id]={x:0,y:0};
  animFrameOffsets[s.id].x+=dx;
  animFrameOffsets[s.id].y+=dy;
  updateAnimOffsetInfo();
  renderAnimPreview();
}

function resetAnimFrameOffset(){
  if(!animFrames.length)return;
  const s=animFrames[animFrameIdx%animFrames.length];
  if(s)delete animFrameOffsets[s.id];
  updateAnimOffsetInfo();
  renderAnimPreview();
}

function updateAnimOffsetInfo(){
  const el=document.getElementById('animOffsetInfo');
  if(!animFrames.length){el.textContent='0, 0';return;}
  const s=animFrames[animFrameIdx%animFrames.length];
  const off=s&&animFrameOffsets[s.id]?animFrameOffsets[s.id]:{x:0,y:0};
  el.textContent=off.x+', '+off.y;
}

// Override renderAnimPreview to use canvas size + offsets
const _origRenderAnimPreview=renderAnimPreview;
renderAnimPreview=function(){
  const cv=document.getElementById('animPreviewCanvas');
  const ctx=cv.getContext('2d');
  if(!animFrames.length){ctx.clearRect(0,0,cv.width,cv.height);return;}
  // Get canvas size from inputs
  let mw=parseInt(document.getElementById('animCanvasW').value)||64;
  let mh=parseInt(document.getElementById('animCanvasH').value)||64;
  // Scale up for preview
  const previewScale=Math.max(1,Math.min(4,Math.floor(Math.min(260/mw,260/mh))));
  const pw=mw*previewScale,ph=mh*previewScale;
  cv.width=pw;cv.height=ph;
  ctx.clearRect(0,0,pw,ph);ctx.imageSmoothingEnabled=false;
  // Draw checkerboard
  const cs=Math.max(4,previewScale*2);
  for(let y=0;y<ph;y+=cs)for(let x=0;x<pw;x+=cs){ctx.fillStyle=(Math.floor(x/cs)+Math.floor(y/cs))%2===0?'#2a2a32':'#1a1a20';ctx.fillRect(x,y,cs,cs);}
  // Border
  ctx.strokeStyle='rgba(255,107,53,0.3)';ctx.lineWidth=1;ctx.strokeRect(0,0,pw,ph);
  const s=animFrames[animFrameIdx%animFrames.length];
  if(!s)return;
  const anchor=document.getElementById('animAnchor').value;
  const onTop=document.getElementById('baseLayerOnTop').checked;
  function drawSprite(sp,extraOff){
    const{dx,dy}=getAnimAnchorOffset(anchor,mw,mh,sp.w,sp.h);
    const ox=extraOff?extraOff.x:0,oy=extraOff?extraOff.y:0;
    ctx.drawImage(img,sp.x,sp.y,sp.w,sp.h,(dx+ox)*previewScale,(dy+oy)*previewScale,sp.w*previewScale,sp.h*previewScale);
  }
  if(!onTop) animBaseLayers.forEach(bl=>{const bs=sprites.find(sp=>sp.id===bl.spriteId);if(bs)drawSprite(bs,animFrameOffsets[bs.id]);});
  drawSprite(s,animFrameOffsets[s.id]);
  if(onTop) animBaseLayers.forEach(bl=>{const bs=sprites.find(sp=>sp.id===bl.spriteId);if(bs)drawSprite(bs,animFrameOffsets[bs.id]);});
  updateAnimOffsetInfo();
};

// Update loadAnimFrames to set canvas size and load offsets
const _origLoadAnimFrames=loadAnimFrames;
loadAnimFrames=function(){
  _origLoadAnimFrames();
  if(animFrames.length){
    animAutoSize();
    // Load saved offsets
    const scId=parseInt(document.getElementById('animSubcatSelect').value);
    if(scId&&animConfigs[scId]&&animConfigs[scId].offsets){
      animFrameOffsets={...animConfigs[scId].offsets};
    } else {
      animFrameOffsets={};
    }
    updateAnimOffsetInfo();
  }
};

// Save animation with offsets and canvas size
function saveAnimation(){
  const scId=parseInt(document.getElementById('animSubcatSelect').value);
  if(!scId||!animFrames.length){toast('Select a sub-group with sprites first');return;}
  const delay=parseInt(document.getElementById('animDelayInput').value)||100;
  const anchor=document.getElementById('animAnchor').value;
  const onTop=document.getElementById('baseLayerOnTop').checked;
  const cw=parseInt(document.getElementById('animCanvasW').value)||64;
  const ch=parseInt(document.getElementById('animCanvasH').value)||64;
  animSubcatIds.add(scId);
  animConfigs[scId]={delay,anchor,canvasW:cw,canvasH:ch,baseLayers:animBaseLayers.map(bl=>({spriteId:bl.spriteId,onTop})),offsets:{...animFrameOffsets}};
  updateAnimBtnState(true);
  document.getElementById('animExportStatus').textContent='Animation saved';
  updateCategoryList();render();updateAnimSubcatSelect();
  document.getElementById('animSubcatSelect').value=scId;
}

// ===== FIX OVERLAPPING BOXES =====

function removeAnimation(){
  const scId=parseInt(document.getElementById('animSubcatSelect').value);
  if(!scId)return;
  animSubcatIds.delete(scId);
  delete animConfigs[scId];
  animFrameOffsets={};
  updateAnimBtnState(false);
  document.getElementById('animExportStatus').textContent='';
  updateCategoryList();render();updateAnimSubcatSelect();
  document.getElementById('animSubcatSelect').value=scId;
  toast('Animation removed');
}

function fixOverlaps(){
  if(sprites.length<2){toast('Need at least 2 sprites');return;}
  if(!img){toast('No image loaded');return;}
  
  // Get pixel data
  const tc=document.createElement('canvas');tc.width=imgW;tc.height=imgH;
  const tx=tc.getContext('2d');tx.drawImage(img,0,0);
  const d=tx.getImageData(0,0,imgW,imgH).data;
  
  // Detect background
  const corners=[[0,0],[imgW-1,0],[0,imgH-1],[imgW-1,imgH-1]];
  const cols=corners.map(([x,y])=>{const i=(y*imgW+x)*4;return{r:d[i],g:d[i+1],b:d[i+2],a:d[i+3]};});
  const hasAlpha=cols.filter(c=>c.a<30).length>=2;
  const bgCol=hasAlpha?null:cols[0];
  const bgTol=40;
  
  function isContentPixel(px,py){
    if(px<0||py<0||px>=imgW||py>=imgH)return false;
    const i=(py*imgW+px)*4;
    if(d[i+3]<25)return false;
    if(!hasAlpha&&bgCol){
      return(Math.abs(d[i]-bgCol.r)+Math.abs(d[i+1]-bgCol.g)+Math.abs(d[i+2]-bgCol.b))>=bgTol;
    }
    return true;
  }
  
  // Find all overlapping pairs
  const pairs=[];
  for(let i=0;i<sprites.length;i++){
    for(let j=i+1;j<sprites.length;j++){
      const a=sprites[i],b=sprites[j];
      const ox1=Math.max(a.x,b.x),oy1=Math.max(a.y,b.y);
      const ox2=Math.min(a.x+a.w,b.x+b.w),oy2=Math.min(a.y+a.h,b.y+b.h);
      if(ox1<ox2&&oy1<oy2) pairs.push([i,j]);
    }
  }
  if(!pairs.length){toast('No overlapping boxes found');return;}
  
  // For each sprite involved in overlaps, find connected components of content pixels
  // Then pick the largest component as the "primary object"
  
  saveState();
  
  // For each involved sprite, compute how much non-overlapping content area it has
  // Process sprites with more clean area first — they get to claim pixels first
  const involvedIdx=new Set();
  pairs.forEach(([ai,bi])=>{involvedIdx.add(ai);involvedIdx.add(bi);});
  
  // Build set of all overlap zone pixels
  const overlapZone=new Set();
  for(const[ai,bi] of pairs){
    const a=sprites[ai],b=sprites[bi];
    const ox1=Math.max(a.x,b.x),oy1=Math.max(a.y,b.y);
    const ox2=Math.min(a.x+a.w,b.x+b.w),oy2=Math.min(a.y+a.h,b.y+b.h);
    for(let py=oy1;py<oy2;py++)for(let px=ox1;px<ox2;px++)overlapZone.add(px+','+py);
  }
  
  // Score each sprite by content pixels OUTSIDE overlap zone
  const spriteScores=[];
  for(const si of involvedIdx){
    const s=sprites[si];
    let cleanCount=0;
    for(let py=s.y;py<s.y+s.h;py++)for(let px=s.x;px<s.x+s.w;px++){
      if(!overlapZone.has(px+','+py)&&isContentPixel(px,py))cleanCount++;
    }
    spriteScores.push({si,id:s.id,cleanCount});
  }
  // Sort: most clean content first
  spriteScores.sort((a,b)=>b.cleanCount-a.cleanCount);
  
  // Global claimed pixels — once a sprite claims a pixel, other sprites can't include it
  const globalClaimed=new Set();
  const spriteObjects={}; // spriteId -> Set of pixel keys
  
  for(const{si,id} of spriteScores){
    const s=sprites[si];
    
    // Flood fill, but treat globally claimed pixels as barriers
    const visited=new Set();
    const components=[];
    
    for(let py=s.y;py<s.y+s.h;py++){
      for(let px=s.x;px<s.x+s.w;px++){
        const key=px+','+py;
        if(visited.has(key))continue;
        if(globalClaimed.has(key)){visited.add(key);continue;}
        if(!isContentPixel(px,py)){visited.add(key);continue;}
        
        const comp=new Set();
        const queue=[{x:px,y:py}];
        visited.add(key);
        while(queue.length){
          const p=queue.shift();
          comp.add(p.x+','+p.y);
          const neighbors=[
            {x:p.x-1,y:p.y},{x:p.x+1,y:p.y},
            {x:p.x,y:p.y-1},{x:p.x,y:p.y+1}
          ];
          for(const n of neighbors){
            if(n.x<s.x||n.x>=s.x+s.w||n.y<s.y||n.y>=s.y+s.h)continue;
            const nk=n.x+','+n.y;
            if(visited.has(nk))continue;
            visited.add(nk);
            if(globalClaimed.has(nk))continue;
            if(isContentPixel(n.x,n.y)){queue.push(n);}
          }
        }
        if(comp.size>0)components.push(comp);
      }
    }
    
    // Find largest component
    let largest=null;
    for(const comp of components){
      if(!largest||comp.size>largest.size)largest=comp;
    }
    
    spriteObjects[id]=largest||new Set();
    
    // Claim these pixels globally so other sprites can't flood into them
    if(largest){
      for(const key of largest)globalClaimed.add(key);
    }
  }
  
  // Build exclude masks and contours
  let totalExcluded=0;
  for(const{si,id} of spriteScores){
    const s=sprites[si];
    const obj=spriteObjects[id];
    s.excludeMask={};
    
    for(let py=s.y;py<s.y+s.h;py++){
      for(let px=s.x;px<s.x+s.w;px++){
        if(!isContentPixel(px,py))continue;
        const key=px+','+py;
        if(!obj.has(key)){
          s.excludeMask[key]=true;
          totalExcluded++;
        }
      }
    }
    
    s.objectContour=buildContour(obj,s);
  }
  
  refreshAll();
  toast('Resolved '+pairs.length+' overlap(s) — '+totalExcluded+' pixels excluded');
}

// Build a contour path (array of {x,y} screen-space points) around a set of pixels
function buildContour(pixelSet,sprite){
  if(!pixelSet||!pixelSet.size)return[];
  // Find edge pixels — pixels in the set that have at least one neighbor NOT in the set
  const edges=[];
  for(const key of pixelSet){
    const[px,py]=key.split(',').map(Number);
    const neighbors=[[px-1,py],[px+1,py],[px,py-1],[px,py+1]];
    for(const[nx,ny] of neighbors){
      if(!pixelSet.has(nx+','+ny)){
        edges.push({x:px,y:py});break;
      }
    }
  }
  return edges;
}

function autoTrimSprites(){
  if(!sprites.length){toast('No sprites to trim');return;}
  if(!img){toast('No image loaded');return;}
  const tc=document.createElement('canvas');tc.width=imgW;tc.height=imgH;
  const tx=tc.getContext('2d');tx.drawImage(img,0,0);
  const d=tx.getImageData(0,0,imgW,imgH).data;
  const corners=[[0,0],[imgW-1,0],[0,imgH-1],[imgW-1,imgH-1]];
  const cols=corners.map(([x,y])=>{const i=(y*imgW+x)*4;return{r:d[i],g:d[i+1],b:d[i+2],a:d[i+3]};});
  const hasAlpha=cols.filter(c=>c.a<30).length>=2;
  const bgCol=hasAlpha?null:cols[0];
  function isBg(px,py){
    if(px<0||py<0||px>=imgW||py>=imgH)return true;
    const i=(py*imgW+px)*4;
    if(d[i+3]<30)return true;
    if(!hasAlpha&&bgCol){return(Math.abs(d[i]-bgCol.r)+Math.abs(d[i+1]-bgCol.g)+Math.abs(d[i+2]-bgCol.b))<40;}
    return false;
  }
  saveState();
  let fixed=0;
  sprites.forEach(s=>{
    let minX=s.x+s.w,minY=s.y+s.h,maxX=s.x,maxY=s.y;
    let hasContent=false;
    for(let py=s.y;py<s.y+s.h;py++){
      for(let px=s.x;px<s.x+s.w;px++){
        if(!isBg(px,py)){
          hasContent=true;
          if(px<minX)minX=px;if(px>maxX)maxX=px;
          if(py<minY)minY=py;if(py>maxY)maxY=py;
        }
      }
    }
    if(hasContent&&(minX>s.x||minY>s.y||maxX<s.x+s.w-1||maxY<s.y+s.h-1)){
      const nw=maxX-minX+1,nh=maxY-minY+1;
      if(nw>=1&&nh>=1&&(minX!==s.x||minY!==s.y||nw!==s.w||nh!==s.h)){
        s.x=minX;s.y=minY;s.w=nw;s.h=nh;
        fixed++;
      }
    }
  });
  refreshAll();
  if(fixed)toast('Trimmed '+fixed+' sprite box(es) to content');
  else toast('All sprites already tight to content');
}

// Minimal inline GIF encoder (no CDN dependency)
function encodeGIF(frames,width,height,delay){
  // frames = array of ImageData objects
  function writeLittleEndian(arr,val,bytes){for(let i=0;i<bytes;i++){arr.push(val&0xff);val>>=8;}}
  const out=[];
  // Header
  [0x47,0x49,0x46,0x38,0x39,0x61].forEach(b=>out.push(b)); // GIF89a
  writeLittleEndian(out,width,2);writeLittleEndian(out,height,2);
  out.push(0x70); // GCT flag=0, color res=7, sort=0, size=0 (no global table)
  out.push(0);out.push(0); // bg index, pixel aspect
  // Netscape extension for looping
  out.push(0x21,0xff,0x0b);
  [0x4e,0x45,0x54,0x53,0x43,0x41,0x50,0x45,0x32,0x2e,0x30].forEach(b=>out.push(b));
  out.push(3,1);writeLittleEndian(out,0,2);out.push(0);
  const delayCs=Math.round(delay/10);
  frames.forEach(imgData=>{
    // Build color table from frame (max 256 colors via median cut simplification)
    const pixels=imgData.data;const w=imgData.width;const h=imgData.height;
    const colorMap=new Map();const palette=[];let hasTransparent=false;
    for(let i=0;i<pixels.length;i+=4){
      if(pixels[i+3]<128){hasTransparent=true;continue;}
      const key=(pixels[i]<<16)|(pixels[i+1]<<8)|pixels[i+2];
      if(!colorMap.has(key)){if(palette.length<255){colorMap.set(key,palette.length);palette.push(key);}}}
    const transIdx=hasTransparent?palette.length:-1;
    if(hasTransparent)palette.push(0);
    // Pad to power of 2
    let palBits=1;while((1<<palBits)<palette.length)palBits++;
    const palSize=1<<palBits;while(palette.length<palSize)palette.push(0);
    // GCE
    out.push(0x21,0xf9,4);
    out.push(hasTransparent?0x09:0x08); // disposal=2 restore bg, transparent flag
    writeLittleEndian(out,delayCs,2);
    out.push(hasTransparent?transIdx:0);out.push(0);
    // Image descriptor
    out.push(0x2c);
    writeLittleEndian(out,0,2);writeLittleEndian(out,0,2);
    writeLittleEndian(out,w,2);writeLittleEndian(out,h,2);
    out.push(0x80|(palBits-1)); // local color table
    // Local color table
    for(let i=0;i<palSize;i++){const c=palette[i];out.push((c>>16)&0xff,(c>>8)&0xff,c&0xff);}
    // LZW compress
    const minCode=Math.max(2,palBits);
    const indexed=new Uint8Array(w*h);
    for(let i=0;i<w*h;i++){const pi=i*4;
      if(pixels[pi+3]<128){indexed[i]=transIdx>=0?transIdx:0;}
      else{const key=(pixels[pi]<<16)|(pixels[pi+1]<<8)|pixels[pi+2];indexed[i]=colorMap.get(key)||0;}}
    // Simple LZW encoder
    const clearCode=1<<minCode;const eoiCode=clearCode+1;
    let codeSize=minCode+1;let nextCode=eoiCode+1;const maxLzw=4096;
    let dict=new Map();let bits=0;let buf=0;let bitPos=0;const subOut=[];
    function emit(code){buf|=(code<<bitPos);bitPos+=codeSize;while(bitPos>=8){subOut.push(buf&0xff);buf>>=8;bitPos-=8;}}
    function initDict(){dict=new Map();for(let i=0;i<clearCode;i++)dict.set(String(i),i);nextCode=eoiCode+1;codeSize=minCode+1;}
    out.push(minCode);
    initDict();emit(clearCode);
    let cur=String(indexed[0]);
    for(let i=1;i<indexed.length;i++){
      const next=String(indexed[i]);const key=cur+','+next;
      if(dict.has(key)){cur=key;}
      else{emit(dict.get(cur));if(nextCode<maxLzw){dict.set(key,nextCode);if(nextCode>=(1<<codeSize)&&codeSize<12)codeSize++;nextCode++;}else{emit(clearCode);initDict();}cur=next;}}
    emit(dict.get(cur));emit(eoiCode);
    if(bitPos>0)subOut.push(buf&0xff);
    // Write sub-blocks
    let si=0;while(si<subOut.length){const len=Math.min(255,subOut.length-si);out.push(len);for(let j=0;j<len;j++)out.push(subOut[si+j]);si+=len;}
    out.push(0); // block terminator
  });
  out.push(0x3b); // trailer
  return new Blob([new Uint8Array(out)],{type:'image/gif'});
}

async function exportAnimGif(scIdOverride){
  const scId=scIdOverride||parseInt(document.getElementById('animSubcatSelect').value);
  const frms=sprites.filter(s=>s.subcatId===scId).sort((a,b)=>a.x===b.x?a.y-b.y:a.x-b.x);
  if(!frms.length)return null;
  const cfg=animConfigs[scId]||{delay:100,anchor:'bottom',baseLayers:[]};
  const anchor=cfg.anchor;const delay=cfg.delay;const baseLayers=cfg.baseLayers||[];
  let mw=0,mh=0;
  frms.forEach(s=>{mw=Math.max(mw,s.w);mh=Math.max(mh,s.h);});
  baseLayers.forEach(bl=>{const s=sprites.find(sp=>sp.id===bl.spriteId);if(s){mw=Math.max(mw,s.w);mh=Math.max(mh,s.h);}});
  const onTop=baseLayers.length>0&&baseLayers[0].onTop;
  const imageDataFrames=[];
  const fc=document.createElement('canvas');fc.width=mw;fc.height=mh;
  const fctx=fc.getContext('2d');
  frms.forEach(s=>{
    fctx.clearRect(0,0,mw,mh);fctx.imageSmoothingEnabled=false;
    function drawSp(sp){const{dx,dy}=getAnimAnchorOffset(anchor,mw,mh,sp.w,sp.h);fctx.drawImage(img,sp.x,sp.y,sp.w,sp.h,dx,dy,sp.w,sp.h);}
    if(!onTop) baseLayers.forEach(bl=>{const bs=sprites.find(sp=>sp.id===bl.spriteId);if(bs)drawSp(bs);});
    drawSp(s);
    if(onTop) baseLayers.forEach(bl=>{const bs=sprites.find(sp=>sp.id===bl.spriteId);if(bs)drawSp(bs);});
    imageDataFrames.push(fctx.getImageData(0,0,mw,mh));
  });
  return encodeGIF(imageDataFrames,mw,mh,delay);
}

// ===== AUTO COLOR (unchanged logic) =====
let colorDetail='shade',colorResults=[],colorPreviewPage=0;
const COLOR_PAGE_SIZE=20;
function showAutoColorModal(){if(!sprites.length){toast('No sprites');return;}document.getElementById('autoColorModal').style.display='flex';document.getElementById('colorPreviewWrap').style.display='none';document.getElementById('colorAnalysisStatus').textContent='';colorResults=[];updateColorDetailBtns();}
function setColorDetail(d){colorDetail=d;updateColorDetailBtns();}
function updateColorDetailBtns(){['basic','shade','fine'].forEach(d=>{const btn=document.getElementById('colorDetail'+d.charAt(0).toUpperCase()+d.slice(1));if(btn)btn.classList.toggle('active-mode',colorDetail===d);});}
function rgbToHsl(r,g,b){r/=255;g/=255;b/=255;const max=Math.max(r,g,b),min=Math.min(r,g,b),l=(max+min)/2;let h=0,s=0;if(max!==min){const d=max-min;s=l>0.5?d/(2-max-min):d/(max+min);if(max===r)h=((g-b)/d+(g<b?6:0))/6;else if(max===g)h=((b-r)/d+2)/6;else h=((r-g)/d+4)/6;}return{h:h*360,s:s*100,l:l*100};}
const COLOR_TABLE=[{name:'yellow',hMin:42,hMax:70,sMin:20,lMin:25,lMax:95},{name:'orange',hMin:15,hMax:42,sMin:30,lMin:20,lMax:85},{name:'rust',hMin:8,hMax:30,sMin:30,lMin:10,lMax:35},{name:'red',hMin:0,hMax:15,sMin:25,lMin:12,lMax:85},{name:'red',hMin:345,hMax:360,sMin:25,lMin:12,lMax:85},{name:'pink',hMin:310,hMax:345,sMin:20,lMin:40,lMax:90},{name:'pink',hMin:310,hMax:345,sMin:20,lMin:12,lMax:40},{name:'green',hMin:70,hMax:165,sMin:12,lMin:8,lMax:85},{name:'teal',hMin:165,hMax:195,sMin:12,lMin:8,lMax:85},{name:'blue',hMin:195,hMax:260,sMin:12,lMin:8,lMax:85},{name:'indigo',hMin:260,hMax:280,sMin:12,lMin:8,lMax:75},{name:'purple',hMin:280,hMax:310,sMin:12,lMin:8,lMax:85}];
function classifyColor(r,g,b,detail){const{h,s,l}=rgbToHsl(r,g,b);if(l<8)return addShade('black',l,detail,true);if(l>95)return addShade('white',l,detail,true);if(l>80&&s>=4&&s<30&&h>=15&&h<65)return addShade('cream',l,detail);if(l>85&&s<10)return addShade('white',l,detail,true);if(s<10)return addShade('gray',l,detail);if(h>=15&&h<50&&s>=10&&s<35&&l>=40&&l<=75)return addShade('tan',l,detail);if(h>=8&&h<50&&s>=15&&s<60&&l>=8&&l<40)return addShade('brown',l,detail);for(const c of COLOR_TABLE){if(h>=c.hMin&&h<c.hMax&&s>=c.sMin&&l>=c.lMin&&l<=c.lMax)return addShade(c.name,l,detail);}return addShade('gray',l,detail);}
function addShade(name,l,detail,achromatic){if(detail==='basic'||achromatic)return name;if(detail==='shade'){if(l<35)return 'dark '+name;if(l>70)return 'light '+name;return name;}if(l<18)return 'very dark '+name;if(l<35)return 'dark '+name;if(l>82)return 'very light '+name;if(l>65)return 'light '+name;return name;}
function analyzeSpriteDominantColor(s){const tc=document.createElement('canvas');tc.width=s.w;tc.height=s.h;const tx=tc.getContext('2d');tx.drawImage(img,s.x,s.y,s.w,s.h,0,0,s.w,s.h);const data=tx.getImageData(0,0,s.w,s.h).data;const colorCounts={};let totalOpaque=0;const step=Math.max(1,Math.floor(Math.sqrt(s.w*s.h)/40));for(let y=0;y<s.h;y+=step){for(let x=0;x<s.w;x+=step){const i=(y*s.w+x)*4;if(data[i+3]<30)continue;const r=data[i],g=data[i+1],b=data[i+2];const name=classifyColor(r,g,b,colorDetail);if(!colorCounts[name])colorCounts[name]={count:0,rSum:0,gSum:0,bSum:0};colorCounts[name].count++;colorCounts[name].rSum+=r;colorCounts[name].gSum+=g;colorCounts[name].bSum+=b;totalOpaque++;}}if(!totalOpaque)return{tagName:'unknown',dominantHex:'#808080',allColors:[]};const sorted=Object.entries(colorCounts).sort((a,b)=>b[1].count-a[1].count);const allColors=sorted.map(([name,d])=>{const n=d.count;const hex='#'+[Math.round(d.rSum/n),Math.round(d.gSum/n),Math.round(d.bSum/n)].map(v=>v.toString(16).padStart(2,'0')).join('');return{name,hex,pct:Math.round(n/totalOpaque*100)};});return{tagName:allColors[0].name,dominantHex:allColors[0].hex,allColors};}
function runColorAnalysis(){const onlySelected=document.getElementById('colorOnlySelected').checked;const pool=onlySelected?sprites.filter(s=>selectedSpriteIds.has(s.id)):sprites;if(!pool.length){toast('No sprites');return;}document.getElementById('colorAnalysisStatus').textContent='Analyzing...';colorResults=[];let idx=0;function processNext(){const batchEnd=Math.min(idx+20,pool.length);for(;idx<batchEnd;idx++){const s=pool[idx];const result=analyzeSpriteDominantColor(s);colorResults.push({spriteId:s.id,spriteName:s.name,...result});}document.getElementById('colorAnalysisStatus').textContent='Analyzed '+idx+'/'+pool.length;if(idx<pool.length){requestAnimationFrame(processNext);}else{document.getElementById('colorAnalysisStatus').textContent='Done!';colorPreviewPage=0;renderColorPreview();document.getElementById('colorPreviewWrap').style.display='block';}}requestAnimationFrame(processNext);}
function getColorTagBg(name){const n=name.replace(/very |light |dark /g,'').trim();const map={red:'#dc2626',orange:'#ea580c',rust:'#b91c1c',yellow:'#ca8a04',green:'#16a34a',teal:'#0d9488',blue:'#2563eb',indigo:'#4f46e5',purple:'#7c3aed',pink:'#db2777',brown:'#92400e',tan:'#a8896c',cream:'#d4c5a9',black:'#1f2937',white:'#94a3b8',gray:'#6b7280',unknown:'#6b7280'};return map[n]||'#6b7280';}
function renderColorPreview(){const body=document.getElementById('colorPreviewBody');const total=colorResults.length;const pages=Math.ceil(total/COLOR_PAGE_SIZE);const start=colorPreviewPage*COLOR_PAGE_SIZE;const end=Math.min(start+COLOR_PAGE_SIZE,total);document.getElementById('colorPreviewCount').textContent=total+' sprites';document.getElementById('colorPreviewIdx').textContent=(colorPreviewPage+1)+' / '+pages;let h='';for(let i=start;i<end;i++){const r=colorResults[i];const s=sprites.find(sp=>sp.id===r.spriteId);if(!s)continue;h+='<div class="color-preview-card"><div class="cp-thumb"><canvas data-cpid="'+i+'" width="36" height="36"></canvas></div><div class="cp-info"><div class="cp-name">'+esc(r.spriteName)+'</div><div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;margin-top:2px;"><div class="cp-tag" style="background:'+getColorTagBg(r.tagName)+'"><div class="cp-swatch" style="background:'+r.dominantHex+'"></div>'+esc(r.tagName)+'</div>';r.allColors.slice(0,3).forEach(c=>{h+='<span style="font-family:var(--font-mono);font-size:8px;color:var(--text2);"><span style="display:inline-block;width:6px;height:6px;border-radius:1px;background:'+c.hex+';vertical-align:middle;margin-right:2px;"></span>'+c.pct+'%</span>';});h+='</div></div></div>';}body.innerHTML=h;for(let i=start;i<end;i++){const r=colorResults[i];const s=sprites.find(sp=>sp.id===r.spriteId);if(!s)continue;const c=body.querySelector('canvas[data-cpid="'+i+'"]');if(!c)continue;const ctx=c.getContext('2d');ctx.imageSmoothingEnabled=false;const sc=Math.min(36/s.w,36/s.h),dw=s.w*sc,dh=s.h*sc;for(let y=0;y<36;y+=4)for(let x=0;x<36;x+=4){ctx.fillStyle=(Math.floor(x/4)+Math.floor(y/4))%2===0?'#2a2a32':'#1a1a20';ctx.fillRect(x,y,4,4);}ctx.drawImage(img,s.x,s.y,s.w,s.h,(36-dw)/2,(36-dh)/2,dw,dh);}}
function colorPreviewPrev(){if(colorPreviewPage>0){colorPreviewPage--;renderColorPreview();}}
function colorPreviewNext(){const pages=Math.ceil(colorResults.length/COLOR_PAGE_SIZE);if(colorPreviewPage<pages-1){colorPreviewPage++;renderColorPreview();}}
function applyColorTags(){if(!colorResults.length){toast('Run analysis first');return;}let colorCat=tagCategories.find(tc=>tc.name.toLowerCase().includes('color'));if(!colorCat){colorCat={id:'tc_'+(nextTagCatId++),name:'Colorway',color:'#14b8a6',tags:[]};tagCategories.push(colorCat);}const usedNames=new Set();colorResults.forEach(r=>usedNames.add(r.tagName));usedNames.forEach(n=>{if(!colorCat.tags.includes(n))colorCat.tags.push(n);});const replace=document.getElementById('colorReplace').checked;saveState();let applied=0;colorResults.forEach(r=>{const s=sprites.find(sp=>sp.id===r.spriteId);if(!s)return;if(!replace&&s.tags&&s.tags[colorCat.id])return;setTag(s,colorCat.id,r.tagName);applied++;});document.getElementById('autoColorModal').style.display='none';updateSpriteTagSelects();refreshAll();toast('Applied color tags to '+applied+' sprite(s)');}

function setStatus(m){document.getElementById('statusText').textContent=m;}
function toast(m){const t=document.createElement('div');t.className='toast';t.textContent=m;document.body.appendChild(t);setTimeout(()=>t.remove(),3000);}

// Init project name label
document.getElementById('projectNameLabel').textContent='.'+projectName;
