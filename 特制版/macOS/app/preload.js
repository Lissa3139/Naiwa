const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('naiwa',{laugh:()=>ipcRenderer.send('laugh'),drag:(x,y)=>ipcRenderer.send('drag',[x,y]),onMotion:fn=>ipcRenderer.on('motion',(_,action)=>fn(action)),onForm:fn=>ipcRenderer.on('form',(_,form)=>fn(form))});
