// Two simulated devices test the actual same-code encrypted D1 sync protocol.
// Test account is ephemeral; it is deleted after success, with no user data.
import { randomBytes, createHash, createCipheriv, createDecipheriv } from "node:crypto";
import assert from "node:assert/strict";
const url="https://cowatch-ai-danmaku-studio.yuguan2304.workers.dev/api/sync/v1";
const pairing=randomBytes(32);
function kdf(purpose){return createHash("sha256").update(Buffer.concat([Buffer.from(purpose),pairing])).digest();}
const token=kdf("cowatch-auth-v1:").toString("base64url");
const key=kdf("cowatch-encryption-v1:");
const testPayload={format:"cowatch-device-transfer",version:1,history:[{id:"test-danmaku",text:"来自 PC 的弹幕"}],screenings:[]};
function encrypt(value){
  const iv=randomBytes(12), cipher=createCipheriv("aes-256-gcm",key,iv);
  const encrypted=Buffer.concat([cipher.update(JSON.stringify(value),"utf8"),cipher.final()]);
  return Buffer.concat([iv,encrypted,cipher.getAuthTag()]).toString("base64url");
}
function decrypt(value){
  const raw=Buffer.from(value,"base64url");
  const decipher=createDecipheriv("aes-256-gcm",key,raw.subarray(0,12));
  decipher.setAuthTag(raw.subarray(-16));
  const plaintext=Buffer.concat([decipher.update(raw.subarray(12,-16)),decipher.final()]).toString("utf8");
  return JSON.parse(plaintext);
}
async function call(method,body,auth=true,knownVersion){
  const res=await fetch(url+(knownVersion?("?knownVersion="+knownVersion):""),{
    method,headers:{...(auth?{Authorization:"Bearer "+token}:{}),...(body?{"Content-Type":"application/json"}:{})},
    ...(body?{body:JSON.stringify(body)}:{})});
  return {status:res.status,data:await res.json()};
}
const unauthorized=await call("GET",undefined,false);
assert.equal(unauthorized.status,401);
const empty=await call("GET");
assert.equal(empty.status,200);
assert.equal(empty.data.version,0);
const created=await call("PUT",{expectedVersion:0,ciphertext:encrypt(testPayload)});
assert.equal(created.status,200,JSON.stringify(created));
assert.equal(created.data.version,1);
const phoneRead=await call("GET");
assert.equal(phoneRead.status,200);
assert.deepEqual(decrypt(phoneRead.data.ciphertext),testPayload,"Phone should decrypt PC ciphertext");
const unchanged=await call("GET",undefined,true,1);
assert.equal(unchanged.status,200);
assert.equal(unchanged.data.unchanged,true);
assert.equal(unchanged.data.ciphertext,undefined,"Unchanged check should not download data");
const conflict=await call("PUT",{expectedVersion:0,ciphertext:encrypt({old:true})});
assert.equal(conflict.status,409,"Stale PC write must be rejected");
const deleted=await call("DELETE",{expectedVersion:1});
assert.equal(deleted.status,200,JSON.stringify(deleted));
const missing=await call("GET");
assert.equal(missing.data.version,0);
console.log("PASS: Cloudflare D1 auth + PC/phone AES-256-GCM pairing + version checks + free low-bandwidth polling + cleanup");
