import {describe,it,expect} from 'vitest';
import {cashPaidInRange} from '@/lib/services/cleaning-spending';
const entry=(id:string,date:string,amount:number,kind:'cleaning'|'payment')=>({id,entry_date:date,sequence:1,kind,description:id,amount});
describe('weekly cash uses the canonical statement',()=>{
 it('includes account payments and excludes historical payments outside the window',()=>{
  expect(cashPaidInRange([{cleanerId:'mary',statementEntries:[entry('old','2026-10-08',-1000,'payment'),entry('new-account','2026-10-17',-1000,'payment'),entry('work','2026-10-13',90,'cleaning')]}],'2026-10-10','2026-10-17')).toBe(1000);
 });
 it('totals all payees in cents without treating work costs as money sent',()=>{
  expect(cashPaidInRange([{cleanerId:'one',statementEntries:[entry('cash','2026-10-17',-75.25,'payment')]},{cleanerId:'two',statementEntries:[entry('cash2','2026-10-17',-24.75,'payment'),entry('fee','2026-10-17',200,'cleaning')]}],'2026-10-17','2026-10-17')).toBe(100);
 });
});
