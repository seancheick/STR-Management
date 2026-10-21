export type CleanerPayment = {
 id:string; owner_id:string; cleaner_id:string; amount:number; payment_date:string;
 method:string; reference:string|null; note:string|null; assignment_id:string|null;
 verified?:boolean; verified_at?:string|null; verified_by?:string|null; source_key:string|null; created_at:string; created_by:string; voided_at:string|null;
};
