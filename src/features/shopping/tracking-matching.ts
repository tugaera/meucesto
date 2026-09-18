export interface TrackingListMatchItem {
  id: string;
  productId: string | null;
  name: string;
}

export interface TrackingCartMatchItem {
  id: string;
  productId: string | null;
  name: string;
}

export interface AmbiguousTrackingMatch {
  cartItemId: string;
  cartItemName: string;
  candidateIds: string[];
}

export interface TrackingMatches {
  automaticIds: Set<string>;
  ambiguities: AmbiguousTrackingMatch[];
}

export function normalizeTrackingName(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/gu, " ");
}

function namesMatch(left: string, right: string): boolean {
  const normalizedLeft = normalizeTrackingName(left);
  const normalizedRight = normalizeTrackingName(right);
  return Boolean(normalizedLeft && normalizedRight)
    && (normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft));
}

export function buildTrackingMatches(
  listItems: readonly TrackingListMatchItem[],
  cartItems: readonly TrackingCartMatchItem[],
): TrackingMatches {
  const automaticIds = new Set<string>();
  const ambiguities: AmbiguousTrackingMatch[] = [];

  for (const cartItem of cartItems) {
    const exactProductMatches = cartItem.productId
      ? listItems.filter((listItem) => listItem.productId === cartItem.productId)
      : [];
    const candidates = exactProductMatches.length
      ? exactProductMatches
      : listItems.filter((listItem) => namesMatch(listItem.name, cartItem.name));

    if (candidates.length === 1) {
      const candidate = candidates[0];
      if (candidate) automaticIds.add(candidate.id);
    } else if (candidates.length > 1) {
      ambiguities.push({
        cartItemId: cartItem.id,
        cartItemName: cartItem.name,
        candidateIds: candidates.map((candidate) => candidate.id),
      });
    }
  }

  return { automaticIds, ambiguities };
}
