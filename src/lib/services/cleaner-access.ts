/** Undefined keeps compatibility with old serialized staff records during rollout. */
export function hasCleanerAppAccess(cleaner:{user_id?:string|null}|undefined|null) {
 return !!cleaner && cleaner.user_id!==null;
}
export function cleanerChoiceLabel(cleaner:{full_name:string;user_id?:string|null}) {
 return `${cleaner.full_name}${cleaner.user_id===null?' · Contractor (no app access)':''}`;
}
