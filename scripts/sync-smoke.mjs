// Pure HTTP integration check: unauthenticated access, create, read,
// optimistic concurrency conflict and delete an ephemeral encrypted vault.
// Never includes a user's pairing code or video.
import { randomBytes } from "node:crypto";
import assert from "node:assert/strict";

const url="https://cowatch-ai-danmaku-studio.yuguan2304.workers.dev/api/sync/v1";
const key=randomBytes(32).toString("base64url");
const ciphertext=randomBytes(50).toString("base64url");
const headers={Authorization:"Bearer "+key};
async function call(method,body,auth=true){
  const r=await fetch(url,{method,headers:{...(auth?headers:{}),...(body?{"Content-Type":"application/json"}:{})},
    ...(body?{body:JSON.stringify(body)}:{})});
  const data=await r.json();
  return {status:r.status,data};
}
const unauthorized=await call("GET",undefined,false);
assert.equal(unauthorized.status,401,"Unauthorized request should be rejected");
const empty=await call("GET");
assert.equal(empty.status,200);
assert.equal(empty.data.version,0);
const created=await call("PUT",{expectedVersion:0,ciphertext});
assert.equal(created.status,200,JSON.stringify(created));
assert.equal(created.data.version,1);
const read=await call("GET");
assert.equal(read.status,200);
assert.equal(read.data.ciphertext,ciphertext);
assert.equal(read.data.version,1);
const conflict=await call("PUT",{expectedVersion:0,ciphertext:randomBytes(40).toString("base64url")});
assert.equal(conflict.status,409);
const deleted=await call("DELETE",{expectedVersion:1});
assert.equal(deleted.status,200);
const missing=await call("GET");
assert.equal(missing.data.version,0);
console.log("PASS: D1 sync API auth, encrypted payload storage, conflict handling, and cleanup");
