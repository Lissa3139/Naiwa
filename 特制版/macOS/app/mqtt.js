'use strict';
const {randomUUID,randomBytes}=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const ENDPOINT='wss://naiwa-milk-frog-control-4317.leeliannss.chatgpt.site/mqtt';
const str=s=>{const b=Buffer.from(s);const n=Buffer.alloc(2);n.writeUInt16BE(b.length);return Buffer.concat([n,b]);};
function frame(head,body){let n=body.length,a=[head];do{let b=n%128;n=Math.floor(n/128);if(n)b|=128;a.push(b);}while(n);return Buffer.concat([Buffer.from(a),body]);}
class Remote {
 constructor({identityPath,safeStorage,state,command,revoked}){Object.assign(this,{identityPath,safeStorage,state,command,revoked});this.generation=0;this.seen=new Set();}
 identity(){
  if(!this.safeStorage.isEncryptionAvailable())throw Error('系统钥匙串不可用，无法保护设备凭据');
  if(fs.existsSync(this.identityPath)){
   const i=JSON.parse(fs.readFileSync(this.identityPath,'utf8'));
   return {id:i.id,secret:this.safeStorage.decryptString(Buffer.from(i.secret,'base64'))};
  }
  const identity={id:randomUUID(),secret:randomBytes(32).toString('base64url')};
  fs.mkdirSync(path.dirname(this.identityPath),{recursive:true});
  fs.writeFileSync(this.identityPath,JSON.stringify({id:identity.id,secret:this.safeStorage.encryptString(identity.secret).toString('base64')}),{mode:0o600});
  return identity;
 }
 stop(){this.generation++;clearTimeout(this.retry);clearInterval(this.ping);if(this.ws){this.ws.onclose=null;this.ws.close();this.ws=null;}this.state('已关闭');}
 start(){this.stop();const generation=this.generation;let identity;try{identity=this.identity();}catch(e){this.state(e.message);return;}
  let delay=1000;
  const connect=()=>{
   if(generation!==this.generation)return;
   this.state('连接中');const ws=this.ws=new WebSocket(ENDPOINT);ws.binaryType='arraybuffer';
   const timeout=setTimeout(()=>ws.close(),15000);
   ws.onopen=()=>ws.send(frame(0x10,Buffer.concat([str('MQTT'),Buffer.from([4,0xc2,0,60]),str('frog-'+identity.id),str(identity.id),str(identity.secret)])));
   ws.onmessage=e=>{
    if(generation!==this.generation)return;
    try{
     const bytes=Buffer.from(e.data);let offset=0;
     while(offset<bytes.length){let head=bytes[offset++],length=0,mult=1,b,count=0;do{if(offset>=bytes.length||count++>=4)throw Error('invalid packet');b=bytes[offset++];length+=(b&127)*mult;mult*=128;}while(b&128);
      if(length>4096||offset+length>bytes.length)throw Error('invalid packet size');const body=bytes.subarray(offset,offset+length);offset+=length;
      if(head===0x20){clearTimeout(timeout);if(body.length!==2)throw Error('invalid connack');if(body[1]===5){this.stop();this.revoked();this.state('配对已移除');return;}if(body[1]!==0)throw Error('MQTT rejected');
       delay=1000;this.state('已连接');ws.send(frame(0x82,Buffer.concat([Buffer.from([0,1]),str('frog/'+identity.id+'/command'),Buffer.from([0])])));
       ws.send(frame(0x30,Buffer.concat([str('frog/'+identity.id+'/status'),Buffer.from('{"state":"ready"}')])));
       clearInterval(this.ping);this.ping=setInterval(()=>{if(ws.readyState===1)ws.send(Buffer.from([0xc0,0]));},2000);
      }else if(head===0x30){if(body.length<2)throw Error('invalid publish');const n=body.readUInt16BE(0);if(n<1||n+2>body.length||body.subarray(2,n+2).toString()!=='frog/'+identity.id+'/command')throw Error('invalid topic');
       const msg=JSON.parse(body.subarray(n+2).toString());if(typeof msg.id!=='string'||msg.id.length>64||!['laugh_split','reset_one','stop_laugh'].includes(msg.action)||this.seen.has(msg.id))continue;
       this.seen.add(msg.id);if(this.seen.size>128)this.seen.delete(this.seen.values().next().value);this.command(msg.action);
      }
     }
    }catch{ws.close();}
   };
   ws.onerror=()=>{};
   ws.onclose=()=>{clearTimeout(timeout);clearInterval(this.ping);if(generation!==this.generation)return;this.state('正在重连');this.retry=setTimeout(connect,delay);delay=Math.min(30000,delay*2);};
  };connect();
 }
 async remove(){const i=this.identity();const r=await fetch(ENDPOINT.replace('wss:','https:').replace('/mqtt','/api/device/remove'),{method:'POST',headers:{Authorization:'Device '+i.id+'.'+i.secret}});if(!r.ok&&r.status!==404)throw Error('移除配对失败，请联网后重试');this.stop();fs.unlinkSync(this.identityPath);}
}
module.exports={Remote,frame,str};
