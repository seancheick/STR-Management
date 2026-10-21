/** An expected business refusal, safe to expose through REST and MCP. */
export class BusinessRuleError extends Error {
  readonly details: {editable:false;lockReason:string;correctionPath:string|null};
  constructor(message:string,lockReason:string,correctionPath:string|null) {
    super(message);
    this.details={editable:false,lockReason,correctionPath};
  }
}
