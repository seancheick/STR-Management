import {beforeEach,describe,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({client:vi.fn(),amounts:vi.fn()}));
vi.mock('server-only',()=>({}));
vi.mock('@/lib/supabase/server',()=>({createServerSupabaseClient:mocks.client}));
vi.mock('@/lib/queries/cleaner-finance',()=>({getOutstandingJobAmounts:mocks.amounts}));
import {listUnpaidPayableJobs} from '@/lib/queries/assignments';
describe('unpaid jobs use the canonical account balance',()=>{
 beforeEach(()=>vi.resetAllMocks());
 it('excludes reconciled and credit-covered jobs, retaining partial balances',async()=>{
  const rows=[{id:'historical',properties:null,status:'approved',paid_at:null},{id:'covered',properties:null,status:'approved',paid_at:null},{id:'partial',properties:null,status:'approved',paid_at:null}];
  const q={select:vi.fn(),order:vi.fn(),range:vi.fn(async()=>({data:rows,error:null}))};q.select.mockReturnValue(q);q.order.mockReturnValue(q);
  mocks.client.mockResolvedValue({from:()=>q});mocks.amounts.mockResolvedValue({partial:25});
  expect((await listUnpaidPayableJobs()).map(job=>job.id)).toEqual(['partial']);
 });
 it('fails visibly rather than pretending an unreadable assignment list is empty',async()=>{
  const q={select:vi.fn(),order:vi.fn(),range:vi.fn(async()=>({data:null,error:{message:'Read failed'}}))};q.select.mockReturnValue(q);q.order.mockReturnValue(q);
  mocks.client.mockResolvedValue({from:()=>q});mocks.amounts.mockResolvedValue({});
  await expect(listUnpaidPayableJobs()).rejects.toThrow('Read failed');
 });
});
