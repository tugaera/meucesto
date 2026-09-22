export type FieldErrors = Readonly<Record<string, readonly string[]>>;

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; errorCode: string; fieldErrors?: FieldErrors };

export const initialActionResult: ActionResult<never> = {
  success: false,
  errorCode: "IDLE",
};

export const initialCartMutationResult = initialActionResult;
export const initialJoinResult = initialActionResult;
export const initialProfileActionResult = initialActionResult;
export const initialProductMutationResult = initialActionResult;
export const initialListMutationResult = initialActionResult;
export const initialAiReceiptResult = initialActionResult;
export const initialAiReviewDecisionResult = initialActionResult;
export const initialReceiptMutationResult = initialActionResult;
export const initialReceiptImportResult = initialActionResult;
export const initialSignedReceiptResult = initialActionResult;
export const initialAdminActionResult = initialActionResult;
