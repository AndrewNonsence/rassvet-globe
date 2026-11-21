/* LRO lunar surface viewer. Assets are loaded only when create() is called. */
(() => {
  'use strict';
  const RAD = Math.PI / 180;
  const R = 1737.4; // IAU lunar reference sphere, km
  const HOME = {lat: 5, lon: 5, range: 4200, tilt: 0, bearing: 0};
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  const wrap = x => ((x + 180) % 360 + 360) % 360 - 180;
  const dot = (a,b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
  const add = (a,b,k=1) => a.map((v,i) => v + k*b[i]);
  const scale = (a,k) => a.map(v => v*k);
  const unit = a => scale(a,1/(Math.hypot(...a) || 1));
  const cross = (a,b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
  function radial(lat, lon) {
    const phi = lat*RAD, lam = lon*RAD;
    return [Math.cos(phi)*Math.sin(lam), Math.sin(phi), Math.cos(phi)*Math.cos(lam)];
  }
  function globeHeight(grid, lat, lon) {
    const x = (wrap(lon)+180)*2 - 0.5, y = clamp((90-lat)*2 - 0.5,0,359);
    const ix = Math.floor(x), iy = Math.floor(y), fx = x-ix, fy = y-iy;
    const west = (ix+720)%720, east = (west+1)%720;
    const row = j => grid[j*720+west]*(1-fx)+grid[j*720+east]*fx;
    return (row(iy)*(1-fy)+row(Math.min(iy+1,359))*fy)/1000;
  }
  const contains = (p,lat,lon) => lat >= p.south && lat <= p.north && lon >= p.west && lon <= p.east;
  function siteHeight(grid, site, lat, lon) {
    const x = clamp((lon-site.west)/(site.east-site.west)*256,0,256);
    const y = clamp((site.north-lat)/(site.north-site.south)*256,0,256);
    const ix = Math.floor(x), iy = Math.floor(y);
    const row = j => grid[j*257+ix]*(1-x+ix)+grid[j*257+Math.min(256,ix+1)]*(x-ix);
    return (row(iy)*(1-y+iy)+row(Math.min(256,iy+1))*(y-iy))/10000;
  }
  async function fetchChecked(url,signal) {
    const response = await fetch(url,{signal});
    if (!response.ok) throw new Error(response.status+' '+url);
    return response;
  }
  async function fetchGrid(url,length,signal) {
    const buffer = await (await fetchChecked(url,signal)).arrayBuffer();
    if (buffer.byteLength !== length*2) throw new Error('Invalid elevation grid: '+url);
    return new Int16Array(buffer);
  }
  function program(gl) {
    const shaders = [];
    const p = gl.createProgram();
    function stage(type, source) {
      const s = gl.createShader(type);
      gl.shaderSource(s,source); gl.compileShader(s); shaders.push(s);
      if (!gl.getShaderParameter(s,gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      gl.attachShader(p,s);
    }
    try {
      stage(gl.VERTEX_SHADER,`
        attribute vec3 position, normal;
        attribute vec2 texCoord;
        uniform vec3 eye, right, up, forward, light;
        uniform vec4 projection;
        varying vec2 uv;
        varying float illumination;
        void main(){
          vec3 delta = position-eye;
          float z = dot(delta,forward);
          gl_Position=vec4(dot(delta,right)*projection.x,dot(delta,up)*projection.y,
                           z*projection.z+projection.w,z);
          uv=texCoord;
          illumination=max(0.0,dot(normal,light));
        }`);
      stage(gl.FRAGMENT_SHADER,`
        precision highp float;
        uniform sampler2D colorMap;
        uniform float local;
        varying vec2 uv;
        varying float illumination;
        void main(){
          vec3 color=texture2D(colorMap,uv).rgb;
          float light=mix(0.32+0.86*illumination,0.86+0.17*illumination,local);
          float edge=min(min(uv.x,1.0-uv.x),min(uv.y,1.0-uv.y));
          gl_FragColor=vec4(color*light,mix(1.0,smoothstep(0.0,0.075,edge),local));
        }`);
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
      return p;
    } catch (error) { gl.deleteProgram(p); throw error; }
    finally { shaders.forEach(s => gl.deleteShader(s)); }
  }
  // Row bands fit WebGL 1's 16-bit index type on mobile GPUs.
  function buildMesh(gl, width, height, coordinate) {
    const stride = 8, vertices = new Float32Array(width*height*stride);
    for (let y=0; y<height; y++) for (let x=0; x<width; x++) {
      const i = (y*width+x)*stride, [lat,lon,h] = coordinate(x,y);
      vertices.set(scale(radial(lat,lon),R+h),i);
      vertices[i+6]=x/(width-1); vertices[i+7]=y/(height-1);
    }
    for (let y=0; y<height; y++) for (let x=0; x<width; x++) {
      const i = (y*width+x)*stride;
      const left=x>0?i-stride:i, right=x<width-1?i+stride:i;
      const top=y>0?i-width*stride:i, bot=y<height-1?i+width*stride:i;
      const dx=vertices[right]-vertices[left], dy=vertices[right+1]-vertices[left+1], dz=vertices[right+2]-vertices[left+2];
      const ex=vertices[bot]-vertices[top], ey=vertices[bot+1]-vertices[top+1], ez=vertices[bot+2]-vertices[top+2];
      const n=[ey*dz-ez*dy,ez*dx-ex*dz,ex*dy-ey*dx];
      vertices.set(unit(Math.hypot(...n)>1e-10?n:vertices.subarray(i,i+3)),i+3);
    }
    const vertexBuffer=gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER,vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER,vertices,gl.STATIC_DRAW);
    const bands=[], rows=Math.floor(65535/width)-1;
    for (let y=0; y<height-1; y+=rows) {
      const count=Math.min(rows,height-1-y);
      const indices=new Uint16Array(count*(width-1)*6);
      let k=0;
      for (let j=0; j<count; j++) for (let x=0; x<width-1; x++) {
        const a=j*width+x,b=a+width;
        indices[k++]=a; indices[k++]=b; indices[k++]=a+1;
        indices[k++]=a+1; indices[k++]=b; indices[k++]=b+1;
      }
      const buffer=gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,buffer);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,indices,gl.STATIC_DRAW);
      bands.push({buffer,offset:y*width*stride*4,count:indices.length});
    }
    return {vertexBuffer,bands};
  }
  async function texture(gl,url,signal) {
    const blob=await (await fetchChecked(url,signal)).blob();
    const img=new Image(), localUrl=URL.createObjectURL(blob);
    try {
      img.src=localUrl; await img.decode(); signal.throwIfAborted();
      const tex=gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D,tex);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,gl.RGB,gl.UNSIGNED_BYTE,img);
      for (const axis of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D,axis,gl.CLAMP_TO_EDGE);
      for (const filter of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D,filter,gl.LINEAR);
      return tex;
    } finally { URL.revokeObjectURL(localUrl); }
  }
  async function create(canvas, options={}) {
    const {onStatus=()=>{}, onView=()=>{}, onPick=()=>{}}=options;
    const base=(options.base || '/assets/moon/terrain/').replace(/\/?$/,'/');
    const gl=canvas.getContext('webgl',{alpha:true,antialias:true,powerPreference:'low-power'});
    if (!gl) throw new Error('WebGL unavailable');
    const abort=new AbortController(), signal=abort.signal;
    const meshes=[], textures=[];
    const resources={};
    const layer=document.createElement('div');
    layer.style.cssText='position:absolute;inset:0;pointer-events:none;overflow:hidden';
    let paused=false, frame=0, animation=null, markers=[], patch=null, pending=null;
    let site, heights, globe, shader, attr, uni, observer;
    let state={...HOME};
    function requestDraw() {
      if (!paused && !signal.aborted && !frame) frame=requestAnimationFrame(draw);
    }
    function destroy() {
      abort.abort(); cancelAnimationFrame(frame); observer?.disconnect(); layer.remove();
      textures.forEach(t=>gl.deleteTexture(t));
      meshes.forEach(m=>{gl.deleteBuffer(m.vertexBuffer); m.bands.forEach(b=>gl.deleteBuffer(b.buffer));});
      if (shader) gl.deleteProgram(shader);
    }
    async function loadTex(name) {
      const t=await texture(gl,base+name,signal); textures.push(t); return t;
    }
    function heightAt(lat,lon) {
      if (patch && state.range<80 && contains(site,lat,lon)) return siteHeight(patch.heights,site,lat,lon);
      return globeHeight(heights,lat,lon);
    }
    function loadPatch() {
      if (patch || pending) return pending;
      onStatus('detail-loading');
      const area=resources.meta.apollo11Area;
      pending=Promise.all([fetchGrid(base+'apollo11.bin',257*257,signal),loadTex('apollo11.jpg'),
        fetchGrid(base+'apollo11-area.bin',area.width*area.height,signal),loadTex('apollo11-area.jpg')])
        .then(([grid,tex,outer,outerTex])=>{
          signal.throwIfAborted();
          const mesh=buildMesh(gl,257,257,(x,y)=>[
            site.north+(site.south-site.north)*y/256,site.west+(site.east-site.west)*x/256,
            grid[y*257+x]/10000]);
          const outerMesh=buildMesh(gl,area.width,area.height,(x,y)=>[
            area.north+(area.south-area.north)*y/(area.height-1),
            area.west+(area.east-area.west)*x/(area.width-1), outer[y*area.width+x]/10000]);
          meshes.push(mesh,outerMesh);
          patch={mesh,texture:tex,heights:grid,area:{mesh:outerMesh,texture:outerTex}};
          onStatus('detail-ready'); requestDraw();
        }).catch(error=>{if (!signal.aborted) onStatus('detail-error',error);})
        .finally(()=>{pending=null;});
      return pending;
    }
    function drawMesh(object,local) {
      gl.uniform1f(uni.local,local);
      gl.bindTexture(gl.TEXTURE_2D,object.texture);
      gl.bindBuffer(gl.ARRAY_BUFFER,object.mesh.vertexBuffer);
      for (const b of object.mesh.bands) {
        gl.vertexAttribPointer(attr.position,3,gl.FLOAT,false,32,b.offset);
        gl.vertexAttribPointer(attr.normal,3,gl.FLOAT,false,32,b.offset+12);
        gl.vertexAttribPointer(attr.texCoord,2,gl.FLOAT,false,32,b.offset+24);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,b.buffer);
        gl.drawElements(gl.TRIANGLES,b.count,gl.UNSIGNED_SHORT,0);
      }
    }
    function draw(time) {
      frame=0;
      if (paused || signal.aborted || !globe) return;
      if (animation) {
        const t=clamp((time-animation.start)/animation.duration,0,1);
        const ease=t*t*(3-2*t), {from,to}=animation;
        // Orient the sphere before diving to a landing site.
        const turn=Math.min(1,ease*2), end=t===1;
        state.lat=from.lat+(to.lat-from.lat)*turn;
        state.lon=wrap(from.lon+wrap(to.lon-from.lon)*turn);
        state.range=Math.exp(Math.log(from.range)+(Math.log(to.range)-Math.log(from.range))*ease);
        state.tilt=from.tilt+(to.tilt-from.tilt)*ease;
        state.bearing=from.bearing+wrap(to.bearing-from.bearing)*ease;
        if (end) {state={...to}; animation=null;} else requestDraw();
      }
      const rect=canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const ratio=Math.min(window.devicePixelRatio || 1,1.75);
      const width=Math.max(1,Math.round(rect.width*ratio)), height=Math.max(1,Math.round(rect.height*ratio));
      if (canvas.width!==width || canvas.height!==height) {canvas.width=width; canvas.height=height;}
      gl.viewport(0,0,width,height);
      gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
      const dir=radial(state.lat,state.lon), east=radial(0,state.lon+90), north=cross(dir,east);
      const bearing=state.bearing*RAD, tilt=state.tilt*RAD;
      const heading=add(scale(north,Math.cos(bearing)),east,Math.sin(bearing));
      const right=unit(cross(heading,dir));
      const back=add(scale(dir,Math.cos(tilt)),heading,-Math.sin(tilt));
      const up=unit(cross(back,right)), forward=scale(back,-1);
      const target=scale(dir,R+heightAt(state.lat,state.lon));
      const eye=add(target,back,state.range);
      // Fit the whole disk on narrow screens. Horizontal and vertical FOV
      // converge to the same scale when the viewport becomes square.
      const focal=2.3*Math.min(1,width/height), fx=focal*height/width;
      const near=Math.max(0.002,state.range*0.004), far=state.range+2.5*R;
      gl.uniform3fv(uni.eye,eye); gl.uniform3fv(uni.right,right);
      gl.uniform3fv(uni.up,up); gl.uniform3fv(uni.forward,forward);
      gl.uniform3fv(uni.light,unit(add(add(scale(dir,0.6),east,-0.65),north,0.48)));
      gl.uniform4f(uni.projection,fx,focal,(far+near)/(far-near),-2*far*near/(far-near));
      const detailed=!!patch && state.range<80 && contains(site,state.lat,state.lon);
      drawMesh(globe,0);
      if (detailed) {
        // Draw the independently sampled levels back to front. A narrow
        // feather hides tiny registration and resolution differences.
        gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
        gl.clear(gl.DEPTH_BUFFER_BIT); drawMesh(patch.area,1);
        gl.clear(gl.DEPTH_BUFFER_BIT); drawMesh(patch,1);
        gl.disable(gl.BLEND);
      }
      const overlay=layer.getBoundingClientRect();
      for (const m of markers) {
        const normal=radial(m.lat,m.lon);
        const pos=scale(normal,R+heightAt(m.lat,m.lon));
        const delta=add(pos,eye,-1), z=dot(delta,forward);
        const nx=fx*dot(delta,right)/z, ny=focal*dot(delta,up)/z;
        m.button.hidden=z<=0 || dot(normal,delta)>=0 || Math.abs(nx)>1 || Math.abs(ny)>1;
        if (!m.button.hidden) {
          m.button.style.left=(rect.left-overlay.left+(nx+1)*rect.width/2)+'px';
          m.button.style.top=(rect.top-overlay.top+(1-ny)*rect.height/2)+'px';
        }
      }
      canvas.dataset.lat=state.lat.toFixed(6); canvas.dataset.lon=state.lon.toFixed(6);
      canvas.dataset.rangeKm=state.range.toFixed(4); canvas.dataset.tilt=state.tilt.toFixed(1);
      canvas.dataset.detail=detailed?'apollo11':'global';
      onView({...state,detail:canvas.dataset.detail});
    }
    function setMarkers(list) {
      layer.replaceChildren(); markers=[];
      for (const item of list) {
        if (!Number.isFinite(item.lat) || !Number.isFinite(item.lon)) continue;
        const button=document.createElement('button');
        button.type='button';
        button.style.cssText='position:absolute;pointer-events:auto;transform:translate(-5px,-50%);white-space:nowrap;padding:0;border:0;color:white;background:transparent;font:600 11px system-ui;cursor:pointer';
        button.style.minHeight=matchMedia('(pointer: coarse)').matches?'44px':'28px';
        const label=document.createElement('span');
        label.textContent=item.label || item.id;
        label.style.cssText='display:inline-block;padding:4px 7px 4px 15px;border-radius:12px;background:radial-gradient(circle at 5px 50%,#fcdb84 0 3px,#3e2b12 3px 4px,transparent 5px),rgba(13,17,22,.74)';
        button.append(label);
        button.addEventListener('click',()=>onPick(item.id),{signal});
        layer.append(button); markers.push({...item,button});
      }
      requestDraw();
    }
    function animate(to,duration=1200) {
      animation={from:{...state},to,start:performance.now(),duration:matchMedia('(prefers-reduced-motion: reduce)').matches?1:duration};
      requestDraw();
    }
    let intent=0;
    async function focus(lat,lon,opts={}) {
      const choice=++intent;
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
      const to={lat:clamp(lat,-89.99,89.99),lon:wrap(lon),tilt:15,bearing:0,range:600};
      const local=opts.detail && contains(site,lat,lon);
      if (local && !patch) {animate(to,800); await loadPatch();}
      if (choice!==intent || signal.aborted) return;
      if (local && patch) {to.range=1.3; to.tilt=28;}
      animate(to);
    }
    function zoom(factor) {
      if (!Number.isFinite(factor) || factor<=0) return;
      ++intent; animation=null;
      const local=contains(site,state.lat,state.lon);
      const next=state.range/factor;
      if (local && next<240 && !patch) loadPatch();
      state.range=clamp(next,patch && local?0.13:160,6500); requestDraw();
    }
    function setState(value) {
      if (!value || !Object.keys(HOME).every(k=>Number.isFinite(value[k]))) return;
      ++intent; animation=null;
      const local=contains(site,value.lat,value.lon);
      state={lat:clamp(value.lat,-89.99,89.99),lon:wrap(value.lon),
        range:clamp(value.range,local?0.13:160,6500),tilt:clamp(value.tilt,0,72),bearing:wrap(value.bearing)};
      if (local && state.range<240 && !patch) loadPatch();
      requestDraw();
    }
    function tilt(degrees) {
      if (!Number.isFinite(degrees)) return;
      ++intent; animation=null; state.tilt=clamp(degrees,0,72); requestDraw();
    }
    const contacts=new Map();
    function pan(dx,dy) {
      const angle=state.bearing*RAD;
      const k=state.range/(R*RAD*Math.max(1,Math.min(canvas.clientWidth,canvas.clientHeight)));
      const right=-dx*k, north=dy*k;
      const lat=state.lat+(north*Math.cos(angle)-right*Math.sin(angle));
      const lon=state.lon+(right*Math.cos(angle)+north*Math.sin(angle))/Math.max(0.04,Math.cos(state.lat*RAD));
      if (state.range<160 && patch && contains(site,state.lat,state.lon)) {
        state.lat=clamp(lat,site.south,site.north); state.lon=clamp(lon,site.west,site.east);
      } else {state.lat=clamp(lat,-89.99,89.99); state.lon=wrap(lon);}
    }
    const pose=()=>{
      const [a,b]=contacts.values();
      return {y:(a.y+b.y)/2,distance:Math.hypot(b.x-a.x,b.y-a.y),angle:Math.atan2(b.y-a.y,b.x-a.x)};
    };
    const listen=(name,fn,extra={})=>canvas.addEventListener(name,fn,{signal,...extra});
    try {
      onStatus('loading');
      [resources.meta,heights,resources.color]=await Promise.all([
        fetchChecked(base+'sources.json',signal).then(r=>r.json()),
        fetchGrid(base+'lola.bin',720*360,signal),loadTex('lroc.jpg')]);
      site=resources.meta.apollo11;
      shader=program(gl); gl.useProgram(shader);
      attr={}; uni={};
      for (const name of ['position','normal','texCoord']) {
        attr[name]=gl.getAttribLocation(shader,name); gl.enableVertexAttribArray(attr[name]);
      }
      for (const name of ['eye','right','up','forward','projection','light','local'])
        uni[name]=gl.getUniformLocation(shader,name);
      const mesh=buildMesh(gl,721,361,(x,y)=>{
        const lat=90-y/2,lon=x/2-180; return [lat,lon,globeHeight(heights,lat,lon)];
      });
      meshes.push(mesh); globe={mesh,texture:resources.color};
      gl.enable(gl.DEPTH_TEST); gl.clearColor(0,0,0,0);
      canvas.after(layer); canvas.style.touchAction='none';
      listen('contextmenu',event=>event.preventDefault());
      listen('pointerdown',event=>{
        ++intent; animation=null;
        canvas.setPointerCapture(event.pointerId);
        contacts.set(event.pointerId,{x:event.clientX,y:event.clientY});
      });
      listen('pointermove',event=>{
        const prev=contacts.get(event.pointerId); if (!prev) return;
        const oldPose=contacts.size===2?pose():null;
        const dx=event.clientX-prev.x,dy=event.clientY-prev.y;
        contacts.set(event.pointerId,{x:event.clientX,y:event.clientY});
        if (oldPose) {
          const next=pose();
          if (next.distance>0 && oldPose.distance>0) zoom(next.distance/oldPose.distance);
          state.tilt=clamp(state.tilt+(next.y-oldPose.y)*0.25,0,72);
          state.bearing=wrap(state.bearing+(next.angle-oldPose.angle)/RAD);
        } else if (event.shiftKey || (event.buttons & 2)) {
          state.tilt=clamp(state.tilt+dy*0.24,0,72); state.bearing=wrap(state.bearing-dx*0.25);
        } else pan(dx,dy);
        requestDraw();
      });
      for (const type of ['pointerup','pointercancel','lostpointercapture'])
        listen(type,event=>contacts.delete(event.pointerId));
      listen('wheel',event=>{
        event.preventDefault();
        const delta=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?canvas.clientHeight:1);
        zoom(Math.exp(-clamp(delta,-600,600)*0.002));
      },{passive:false});
      listen('keydown',event=>{
        if (!['ArrowLeft','ArrowRight','ArrowDown','ArrowUp','+','=','-','Home'].includes(event.key)) return;
        event.preventDefault(); ++intent; animation=null;
        if (event.key==='Home') animate({...HOME});
        else if (event.key==='+' || event.key==='=') zoom(1.5);
        else if (event.key==='-') zoom(1/1.5);
        else if (event.shiftKey) tilt(state.tilt+(event.key==='ArrowUp'?5:-5));
        else pan(event.key==='ArrowLeft'?55:event.key==='ArrowRight'?-55:0,
                 event.key==='ArrowUp'?55:event.key==='ArrowDown'?-55:0);
        requestDraw();
      });
      listen('webglcontextlost',event=>{
        event.preventDefault(); paused=true; cancelAnimationFrame(frame); frame=0;
        onStatus('error',new Error('WebGL context lost'));
      });
      observer=new ResizeObserver(requestDraw); observer.observe(canvas);
      requestDraw(); onStatus('ready');
    } catch (error) {destroy(); onStatus('error',error); throw error;}
    return {focus, zoom, tilt, setMarkers, getState:()=>({...state}),setState,
      reset(){++intent; animate({...HOME});},
      pause(){paused=true; cancelAnimationFrame(frame); frame=0; contacts.clear();},
      resume(){paused=false; requestDraw();},destroy};
  }
  window.RassvetMoonTerrain={create};
})();
