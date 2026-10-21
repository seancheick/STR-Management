import { describe, it, expect } from "vitest";
import { BusinessRuleError } from "@/lib/domain/business-error";

describe("business refusals",()=>{
 it("carries machine-readable correction routing",()=>{
  const error=new BusinessRuleError("Imported history is immutable.","imported_history","post_cleaner_adjustment");
  expect(error.details).toEqual({editable:false,lockReason:"imported_history",correctionPath:"post_cleaner_adjustment"});
 });
});
