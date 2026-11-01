const assert=require('node:assert/strict');
const {Remote,frame,str}=require('./app/mqtt');
assert.deepEqual([...frame(0xc0,Buffer.alloc(0))],[0xc0,0]);
assert.equal(frame(0x30,Buffer.alloc(200))[1],200);
assert.equal(frame(0x30,Buffer.alloc(200))[2],1);
class FakeSocket {
 constructor(){this.readyState=1;this.sent=[];FakeSocket.last=this;queueMicrotask(()=>this.onopen());}
 send(data){this.sent.push(Buffer.from(data));}
 close(){this.readyState=3;this.onclose?.();}
 receive(data){this.onmessage({data});}
}
global.WebSocket=FakeSocket;
const actions=[],states=[];
const remote=new Remote({state:s=>states.push(s),command:a=>actions.push(a),revoked:()=>{}});
const id='00000000-0000-4000-8000-000000000001';
remote.identity=()=>({id,secret:'mock-local-only-secret'});
remote.start();
setImmediate(()=>{
 try {
  const socket=FakeSocket.last;
  assert.equal(socket.sent[0][0],0x10);
  socket.receive(Buffer.from([0x20,2,0,0]));
  assert(states.includes('已连接'));
  assert(socket.sent.some(p=>p[0]===0x82));
  const message=frame(0x30,Buffer.concat([str('frog/'+id+'/command'),Buffer.from(JSON.stringify({id:'command-one',action:'laugh_split'}))]));
  socket.receive(message);socket.receive(message);
  assert.deepEqual(actions,['laugh_split']);
  console.log('MQTT framing, acknowledgement, subscription, dispatch and duplicate filtering: PASS');
 } finally {remote.stop();}
});
