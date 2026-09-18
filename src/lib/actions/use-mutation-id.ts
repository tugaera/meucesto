"use client";

import { useEffect, useRef, useState } from "react";

interface MutationResultLike {
  readonly success: boolean;
}

export function useMutationId(result?: MutationResultLike): string {
  const [mutationId, setMutationId] = useState(() => crypto.randomUUID());
  const previousResult = useRef(result);

  useEffect(() => {
    if (result?.success && result !== previousResult.current) setMutationId(crypto.randomUUID());
    previousResult.current = result;
  }, [result]);

  return mutationId;
}
