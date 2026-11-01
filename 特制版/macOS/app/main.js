'use strict';
const {app,BrowserWindow,Menu,Tray,dialog,ipcMain,safeStorage,shell,screen,nativeImage}=require('electron');
const fs=require('node:fs'),path=require('node:path');
const {Remote}=require('./mqtt');
let pets=[],tray,remote,configPath,state='已关闭',enabled=false,cycle=null,queued=0,quitting=false,temporaryRemoteSessionTimer=null;
const forms=['battle','angel','anger','love','death','laughing','gentle','melancholy','void'];
const labels=['战斗','天使','生气','爱心','死亡','大笑','温柔','忧郁','虚无'];
const metadata=JSON.parse(fs.readFileSync(path.join(__dirname,'assets','metadata.json'),'utf8'));
function config(){try{return /^enabled=true\s*$/im.test(fs.readFileSync(configPath,'utf8'));}catch{return false;}}
function setEnabled(value){fs.writeFileSync(configPath,'; Local remote-control switch\nenabled='+value+'\n');sync();}
function status(){return !enabled?'断开连接':state==='已连接'?'连接正常':['已关闭','连接中'].includes(state)?'断开连接':'连接失败';}
function update(){if(tray){tray.setTitle(enabled?'远程控制：'+status():'');tray.setToolTip('奶蛙远程控制：'+status());}}
function sync(){const next=config();if(next===enabled)return;enabled=next;if(enabled)remote.start();else remote.stop();update();}
function settings(){dialog.showMessageBox({type:'info',title:'奶蛙远程控制设置',message:status(),detail:'启用远程控制后，奶蛙会连接网络，并允许已配对的控制端远程控制奶蛙动作',buttons:['关闭窗口','启动远控','关闭远控','移除设备配对'],defaultId:0,cancelId:0}).then(async({response})=>{try{if(response===1)setEnabled(true);if(response===2)setEnabled(false);if(response===3){setEnabled(false);await remote.remove();}}catch(e){dialog.showErrorBox('连接设置',e.message);}});}
function send(action){for(const p of pets)if(!p.win.isDestroyed())p.win.webContents.send('motion',action);}
function stop(){clearTimeout(cycle);cycle=null;queued=0;send('stop');}
function reset(){stop();for(const p of pets.slice(1))p.win.close();pets=pets.slice(0,1);}
function laugh(){if(cycle){queued=Math.min(queued+1,32);return;}send('laugh');cycle=setTimeout(()=>{cycle=null;send('stop');if(pets.length<32){const present=new Set(pets.map(p=>p.form));const form=forms.findIndex((_,i)=>!present.has(i));createPet(form<0?pets.length%9:form);}if(queued){queued--;laugh();}},metadata.frames/metadata.fps*1000+250);}
function createPet(form=0){
 const area=screen.getPrimaryDisplay().workArea;const win=new BrowserWindow({width:244,height:312,x:Math.max(area.x,area.x+area.width-320-pets.length*32),y:Math.max(area.y,area.y+area.height-350),transparent:true,frame:false,resizable:false,hasShadow:false,alwaysOnTop:true,skipTaskbar:true,webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true,autoplayPolicy:'no-user-gesture-required'}});
 const pet={win,form};pets.push(pet);win.loadFile('pet.html',{query:{form:forms[form],primary:pets.length===1?'true':'false'}});
 if(process.argv.includes('--smoke-test')){
  const timeout=setTimeout(()=>app.exit(3),15000);
  win.webContents.once('did-finish-load',async()=>{
   let ready=false;
   try{ready=await win.webContents.executeJavaScript("new Promise(resolve=>{const image=document.getElementById('pet');if(!image){resolve(false);return;}if(image.complete){resolve(image.naturalWidth>0);return;}image.addEventListener('load',()=>resolve(image.naturalWidth>0),{once:true});image.addEventListener('error',()=>resolve(false),{once:true});})");}catch{}
   clearTimeout(timeout);app.exit(ready?0:2);
  });
 }
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',e=>e.preventDefault());
 win.on('closed',()=>{pets=pets.filter(p=>p!==pet);if(!pets.length&&!quitting)app.quit();});
 win.webContents.on('context-menu',()=>Menu.buildFromTemplate([
  {label:'捧腹大笑（双击）',click:laugh},{label:'停止大笑',click:stop},{label:'恢复为一只',click:reset},{type:'separator'},
  {label:'切换形态',submenu:forms.map((name,i)=>({label:labels[i],click:()=>{pet.form=i;win.webContents.send('form',name);}}))},
  {label:'退出奶蛙',click:()=>app.quit()}
 ]).popup({window:win}));
 return pet;
}
if(!app.requestSingleInstanceLock()){app.quit();}else{
 app.on('second-instance',(_,argv)=>{if(argv.includes('--connection-settings'))settings();else if(pets[0])pets[0].win.show();});
 app.whenReady().then(()=>{
  configPath=path.join(app.isPackaged?path.resolve(process.resourcesPath,'../../..'):path.dirname(__dirname),'remote-control.ini');
  if(!fs.existsSync(configPath))fs.writeFileSync(configPath,'enabled=false\n');
  remote=new Remote({identityPath:path.join(app.getPath('userData'),'identity.json'),safeStorage,state:s=>{state=s;update();if(process.env.NAIWA_REMOTE_TEST==='1'){console.log('NAIWA_REMOTE_STATUS='+status());if(s==='已连接'&&!temporaryRemoteSessionTimer){const minutes=Math.max(1,Math.min(60,Number(process.env.NAIWA_REMOTE_TEST_MINUTES)||30));console.log('NAIWA_REMOTE_SESSION_MINUTES='+minutes);temporaryRemoteSessionTimer=setTimeout(async()=>{try{await remote.remove();console.log('NAIWA_REMOTE_CLEANUP=complete');}catch{console.log('NAIWA_REMOTE_CLEANUP=failed');}app.quit();},minutes*60*1000);}}},command:a=>{if(a==='laugh_split')laugh();else if(a==='reset_one')reset();else stop();},revoked:()=>setEnabled(false)});
  tray=new Tray(nativeImage.createFromPath(path.join(__dirname,'assets','forms','gentle.png')).resize({width:20,height:20}));tray.on('click',settings);update();
  Menu.setApplicationMenu(Menu.buildFromTemplate([{label:'奶蛙',submenu:[{label:'连接设置',click:settings},{label:'恢复为一只',click:reset},{role:'quit',label:'退出'}]}]));
  createPet();sync();setInterval(sync,1000);if(process.argv.includes('--connection-settings'))settings();app.dock.hide();
 });
 app.on('before-quit',()=>{quitting=true;clearTimeout(cycle);clearTimeout(temporaryRemoteSessionTimer);if(remote)remote.stop();});
 app.on('window-all-closed',()=>app.quit());
}
ipcMain.on('laugh',()=>laugh());
ipcMain.on('drag',(event,delta)=>{const win=BrowserWindow.fromWebContents(event.sender);if(!win||!Array.isArray(delta)||delta.length!==2||!delta.every(Number.isFinite))return;const [x,y]=win.getPosition();win.setPosition(x+Math.max(-300,Math.min(300,Math.round(delta[0]))),y+Math.max(-300,Math.min(300,Math.round(delta[1]))));});
