import {describe,it,expect} from 'vitest';
import {cleanerChoiceLabel,hasCleanerAppAccess} from '@/lib/services/cleaner-access';
describe('cleaner access identity',()=>{
 it('labels contractors without inventing a login',()=>{
  expect(cleanerChoiceLabel({full_name:'Alex',user_id:null})).toBe('Alex · Contractor (no app access)');expect(hasCleanerAppAccess({user_id:null})).toBe(false);
 });
 it('preserves a linked contractor name with a different auth identity',()=>{expect(cleanerChoiceLabel({full_name:'Alex',user_id:'different-login'})).toBe('Alex');expect(hasCleanerAppAccess({user_id:'different-login'})).toBe(true);});
});
