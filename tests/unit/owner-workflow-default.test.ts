import {describe,it,expect} from 'vitest';
import {suggestCleaningOperation} from '@/lib/services/cleaning-workflow';
const now=new Date('2026-10-17T16:00:00Z');
describe('shared past work suggestion',()=>{
 it('suggests recording yesterday as completed',()=>expect(suggestCleaningOperation({status:'confirmed',checkout_at:'2026-10-16T15:00Z',due_at:'2026-10-16T19:00Z'},now)).toBe('complete'));
 it('keeps today assigned even after checkout',()=>expect(suggestCleaningOperation({status:'unassigned',checkout_at:'2026-10-17T15:00Z',due_at:'2026-10-17T19:00Z'},now)).toBe('direct'));
 it('uses the property local date at a UTC day boundary',()=>expect(suggestCleaningOperation({status:'unassigned',checkout_at:null,due_at:'2026-10-17T01:00Z'},now)).toBe('complete'));
 it('tolerates an empty date while editing',()=>expect(suggestCleaningOperation({status:'unassigned',checkout_at:'',due_at:''},now)).toBe('direct'));
 it('keeps future work confirmed',()=>expect(suggestCleaningOperation({status:'unassigned',checkout_at:'2026-10-18T15:00Z',due_at:'2026-10-18T19:00Z'},now)).toBe('direct'));
});
