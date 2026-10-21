import {afterEach,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({refresh:vi.fn(),cleanups:[] as (()=>void)[]}));
vi.mock("react",()=>({startTransition:(fn:()=>void)=>fn(),useRef:(value:unknown)=>({current:value}),useEffect:(fn:()=>void|(()=>void))=>{const cleanup=fn();if(cleanup)mocks.cleanups.push(cleanup);}}));
vi.mock("next/navigation",()=>({useRouter:()=>({refresh:vi.fn()})}));
vi.mock("@/app/actions/refresh-job-views",()=>({refreshJobViewsAction:mocks.refresh}));
vi.mock("@/lib/supabase/client",()=>({createBrowserSupabaseClient:()=>{const channel={on:()=>channel,subscribe:vi.fn()};return{channel:()=>channel,auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe:vi.fn()}}})},removeChannel:vi.fn()};}}));
import {LiveJobUpdates} from "@/components/shared/live-job-updates";
afterEach(()=>{mocks.cleanups.splice(0).forEach(fn=>fn());vi.useRealTimers();vi.unstubAllGlobals();vi.clearAllMocks();});
it("keeps a single background refresh in flight while a slow action or sync blocks the action queue",async()=>{
 vi.useFakeTimers();const document=Object.assign(new EventTarget(),{visibilityState:"visible"});vi.stubGlobal("document",document);vi.stubGlobal("window",new EventTarget());let finish!:()=>void;mocks.refresh.mockImplementation(()=>new Promise<void>(r=>{finish=r;}));
 LiveJobUpdates({ownerId:"owner",userId:"owner"});
 await vi.advanceTimersByTimeAsync(30250);expect(mocks.refresh).toHaveBeenCalledTimes(1);
 finish();await Promise.resolve();await vi.advanceTimersByTimeAsync(10250);expect(mocks.refresh).toHaveBeenCalledTimes(2);
});
