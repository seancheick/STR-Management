import {beforeEach,describe,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({client:vi.fn(),create:vi.fn(),notify:vi.fn(),revalidate:vi.fn(),redirect:vi.fn()}));
vi.mock('server-only',()=>({}));
vi.mock('next/cache',()=>({revalidatePath:mocks.revalidate}));
vi.mock('next/navigation',()=>({redirect:mocks.redirect}));
vi.mock('@/lib/auth/session',()=>({requireRole:vi.fn(async()=>({id:'owner',owner_id:'owner'}))}));
vi.mock('@/lib/queries/properties',()=>({resolveOwnerId:vi.fn(async()=>'owner')}));
vi.mock('@/lib/supabase/server',()=>({createServerSupabaseClient:mocks.client}));
vi.mock('@/lib/services/assignment-service',()=>({createAssignment:mocks.create}));
vi.mock('@/lib/notifications/notification-service',()=>({sendAssignmentBatchNotification:mocks.notify}));
import {createAssignmentAction} from '@/app/(admin)/dashboard/assignments/actions';
const cleaner='c0000000-0000-0000-0000-000000000002';
function form(){const fd=new FormData();for(const [key,value] of Object.entries({propertyId:'c0000000-0000-0000-0000-000000000010',cleanerId:cleaner,dueAt:'2020-10-15T19:00:00Z',assignmentMode:'complete',completionReason:'Confirmed completed by phone',completionConfirmed:'on'}))fd.set(key,value);return fd;}
describe('recording new past work through the shared owner workflow',()=>{
 beforeEach(()=>{vi.resetAllMocks();mocks.create.mockResolvedValue({success:true,assignmentId:'job'});mocks.notify.mockResolvedValue(undefined);});
 it('completes a past manual job without a checkout and refreshes balances',async()=>{
  const rpc=vi.fn(async()=>({error:null}));
  const q={select:vi.fn(),eq:vi.fn(),maybeSingle:vi.fn(async()=>({data:{id:'property',physical_unit_id:null,primary_checklist_template_id:null,default_clean_price:90},error:null}))};q.select.mockReturnValue(q);q.eq.mockReturnValue(q);
  mocks.client.mockResolvedValue({from:()=>q,rpc});
  await createAssignmentAction({status:'idle',message:null},form());
  expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({cleanerId:null,checkoutAt:null}));
  expect(rpc).toHaveBeenCalledWith('owner_manage_cleaning',expect.objectContaining({operation:'complete',target_cleaner:cleaner,confirmed:true,audit_reason:'Confirmed completed by phone'}));
  expect(mocks.notify).toHaveBeenCalledWith('owner',cleaner,['job'],'complete');
  expect(mocks.revalidate).toHaveBeenCalledWith('/dashboard','layout');
 });
 it.each(['confirmation','cleaner','future'])('validates %s before creating any job',async(kind)=>{
  const fd=form();if(kind==='confirmation')fd.delete('completionConfirmed');if(kind==='cleaner')fd.delete('cleanerId');if(kind==='future')fd.set('dueAt','2099-10-15T19:00:00Z');
  expect((await createAssignmentAction({status:'idle',message:null},fd)).status).toBe('error');
  expect(mocks.create).not.toHaveBeenCalled();
 });
});
