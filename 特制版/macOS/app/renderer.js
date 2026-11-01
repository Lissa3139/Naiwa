const image=document.getElementById('pet');const query=new URLSearchParams(location.search);let form=query.get('form')||'battle',laughing=false,timer,start;
const audio=query.get('primary')==='true'?new Audio('assets/laugh.wav'):null;
function idle(){image.src=form==='battle'?'assets/look/00.png':'assets/forms/'+form+'.png';}
function stop(){laughing=false;clearInterval(timer);if(audio){audio.pause();audio.currentTime=0;}idle();}
window.naiwa.onMotion(action=>{if(action!=='laugh'){stop();return;}laughing=true;start=performance.now();clearInterval(timer);if(audio){audio.currentTime=0;audio.play().catch(()=>{});}timer=setInterval(()=>{let frame=Math.min(421,Math.floor((performance.now()-start)*.03));image.src='assets/laugh/'+String(frame).padStart(4,'0')+'.png';},1000/30);});
window.naiwa.onForm(value=>{form=value;if(!laughing)idle();});idle();
image.addEventListener('dblclick',()=>window.naiwa.laugh());
let drag=null,moved=false;
image.addEventListener('pointerdown',e=>{if(e.button===0){drag=[e.screenX,e.screenY];moved=false;image.setPointerCapture(e.pointerId);}});
image.addEventListener('pointermove',e=>{if(drag){const dx=e.screenX-drag[0],dy=e.screenY-drag[1];if(Math.abs(dx)+Math.abs(dy)>2){moved=true;window.naiwa.drag(dx,dy);drag=[e.screenX,e.screenY];}}else if(!laughing&&form==='battle'){const index=Math.max(0,Math.min(10,Math.round(e.clientX/innerWidth*10)));image.src='assets/look/'+String(index).padStart(2,'0')+'.png';}});
image.addEventListener('pointerup',()=>{drag=null;});image.addEventListener('lostpointercapture',()=>{drag=null;});
