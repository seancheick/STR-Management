import { beforeEach, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({results:[] as unknown[]}));
vi.mock("server-only",()=>({}));
vi.mock("@/lib/auth/session",()=>({requireRole:vi.fn()}));
vi.mock("@/lib/supabase/server",()=>({createServerSupabaseClient:async()=>({from:()=>{const result=mocks.results.shift();const chain:unknown=new Proxy({},{get:(_t,key)=>key==='then'?(resolve:(v:unknown)=>void)=>Promise.resolve(result).then(resolve):()=>chain});return chain;}})}));
import {getBookabilityAlert} from "@/lib/queries/bookability";
beforeEach(()=>{mocks.results=[];});
it("does not show a healthy banner when alert data cannot be read",async()=>{
 mocks.results=[{error:{message:"database unavailable"},count:null},{error:null,count:1},{error:null,data:{finished_at:new Date().toISOString()}}];
 expect(await getBookabilityAlert()).toEqual({critical:0,stale:true});
});
it("reports current critical findings when every read succeeds",async()=>{
 mocks.results=[{error:null,count:2},{error:null,count:1},{error:null,data:{finished_at:new Date().toISOString()}}];
 expect(await getBookabilityAlert()).toEqual({critical:2,stale:false});
});
