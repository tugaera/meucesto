export type FieldErrors = Readonly<Record<string, readonly string[]>>;

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; errorCode: string; fieldErrors?: FieldErrors };

export const initialActionResult: ActionResult<never> = {
  success: false,
  errorCode: "IDLE",
};
