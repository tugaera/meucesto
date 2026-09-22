import { z } from "zod";

const nullableString = z.string().nullable().optional();
const decimalString = z.union([z.string(), z.number()]).transform(String);

export const cartSchema = z.object({
  id: z.uuid(),
  ownerId: z.uuid(),
  ownerEmail: nullableString,
  storeId: z.uuid().nullable(),
  storeName: nullableString,
  trackingListId: z.uuid().nullable(),
  trackingState: z.object({ manuallyChecked: z.array(z.uuid()), suppressedAutoMatch: z.array(z.uuid()) }),
  total: decimalString,
  revision: z.number().int().positive(),
  finalizedAt: nullableString,
  isOwner: z.boolean(),
  isShared: z.boolean().optional().default(false),
  canEditItems: z.boolean(),
  canManageCart: z.boolean(),
  canManageReceipts: z.boolean().optional().default(false),
});

export const cartItemSchema = z.object({
  id: z.uuid(),
  cartId: z.uuid(),
  productId: z.uuid().nullable(),
  productEntryId: z.uuid().nullable(),
  name: z.string(),
  barcode: nullableString,
  price: decimalString,
  originalPrice: nullableString,
  quantity: decimalString,
  lineSubtotal: decimalString,
  lineSavings: decimalString,
  revision: z.number().int().positive(),
  addedBy: z.uuid().nullable(),
  addedByEmail: nullableString,
  product: z.object({
    id: z.uuid(), name: z.string(), barcode: nullableString, tags: z.array(z.string()),
    brand: nullableString, measurementQuantity: nullableString, unit: nullableString,
  }).nullable(),
});

export const cartItemsSchema = z.array(cartItemSchema);

export const referenceDataSchema = z.object({
  stores: z.array(z.object({ id: z.uuid(), name: z.string(), isActive: z.boolean(), sortOrder: z.number().int().nullable() })),
  categories: z.array(z.object({ id: z.uuid(), name: z.string(), parentId: z.uuid().nullable(), isActive: z.boolean(), sortOrder: z.number().int().nullable() })),
  brands: z.array(z.object({ id: z.uuid(), name: z.string(), isActive: z.boolean(), isVerified: z.boolean() })),
  units: z.array(z.object({ id: z.uuid(), name: z.string(), abbreviation: z.string(), isActive: z.boolean(), isDefault: z.boolean() })),
});

export const listDirectoryItemSchema = z.object({
  id: z.uuid(), name: z.string(), revision: z.number().int(), ownerId: z.uuid(), ownerEmail: z.string(),
  isShared: z.boolean(), itemCount: z.number().int(), createdAt: z.string(), updatedAt: z.string(),
});
export const listDirectorySchema = z.array(listDirectoryItemSchema);

export const listDetailSchema = z.object({
  id: z.uuid(), name: z.string(), revision: z.number().int(), ownerId: z.uuid(), ownerEmail: z.string(),
  isOwner: z.boolean(), isShared: z.boolean(), canManage: z.boolean(), createdAt: z.string(), updatedAt: z.string(),
});

export const listItemSchema = z.object({
  id: z.uuid(), productId: z.uuid().nullable(), name: z.string(), barcode: nullableString,
  quantity: decimalString, revision: z.number().int(), addedBy: z.uuid().nullable(), addedByEmail: nullableString,
  createdAt: z.string(),
});
export const listItemsSchema = z.array(listItemSchema);

export const productSummarySchema = z.object({
  id: z.uuid(), name: z.string(), barcode: nullableString, tags: z.array(z.string()),
  measurementQuantity: z.union([z.number(), z.string()]).nullable(), isActive: z.boolean(),
  category: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  subcategory: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  brand: z.object({ id: z.uuid(), name: z.string(), isVerified: z.boolean() }).nullable(),
  unit: z.object({ id: z.uuid(), name: z.string(), abbreviation: z.string() }).nullable(),
  latestPrice: z.object({ id: z.uuid(), storeId: z.uuid(), storeName: z.string(), price: decimalString, originalPrice: z.union([z.string(), z.number()]).nullable(), quantity: decimalString, createdAt: z.string() }).nullable(),
});
export const productSummariesSchema = z.array(productSummarySchema);

export const openFoodFactsSuggestionSchema = z.object({
  source: z.literal("open-food-facts"),
  barcode: z.string(),
  name: z.string(),
  brandName: z.string().nullable(),
  tags: z.array(z.string()),
  measurementQuantity: z.string().nullable(),
  unitAbbreviation: z.string().nullable(),
});

export const barcodeLookupResponseSchema = z.discriminatedUnion("source", [
  z.object({ source: z.literal("local"), product: productSummarySchema }),
  z.object({ source: z.literal("open-food-facts"), product: openFoodFactsSuggestionSchema }),
  z.object({ source: z.literal("none"), product: z.null() }),
]);

export const productDetailSchema = z.object({
  id: z.uuid(), name: z.string(), barcode: nullableString, tags: z.array(z.string()),
  measurementQuantity: z.union([z.number(), z.string()]).nullable(), isActive: z.boolean(),
  categoryId: z.uuid().nullable(), subcategoryId: z.uuid().nullable(), brandId: z.uuid().nullable(), unitId: z.uuid().nullable(),
  categoryName: nullableString, subcategoryName: nullableString, brandName: nullableString,
  unitName: nullableString, unitAbbreviation: nullableString, createdAt: z.string(), updatedAt: z.string(),
});

export const priceHistoryEntrySchema = z.object({
  id: z.uuid(), storeId: z.uuid(), storeName: z.string(), price: decimalString,
  originalPrice: z.union([z.string(), z.number()]).nullable(), quantity: decimalString,
  createdAt: z.string(), sourceCartId: z.uuid().nullable().optional(),
});
export const priceHistorySchema = z.array(priceHistoryEntrySchema);

export const historyRowSchema = z.object({
  id: z.uuid(), finalizedAt: z.string(), ownerEmail: z.string(), isShared: z.boolean(),
  store: z.object({ id: z.uuid(), name: z.string() }).nullable(), total: decimalString, itemCount: z.number().int(),
});
export const historyRowsSchema = z.array(historyRowSchema);

export const historyCartDetailSchema = z.object({
  id: z.uuid(), ownerId: z.uuid(), ownerEmail: z.string(), isOwner: z.boolean(), canManageReceipts: z.boolean(),
  isReceiptImport: z.boolean().default(false),
  store: z.object({ id: z.uuid(), name: z.string() }).nullable(), total: decimalString,
  finalizedAt: z.string(), createdAt: z.string(), revision: z.number().int(),
});

export const historyCartItemSchema = z.object({
  id: z.uuid(), productId: z.uuid().nullable(), productEntryId: z.uuid().nullable(), name: z.string(),
  barcode: nullableString, price: decimalString, originalPrice: nullableString, quantity: decimalString,
  lineTotal: decimalString, addedByEmail: nullableString, createdAt: z.string(),
});
export const historyCartItemsSchema = z.array(historyCartItemSchema);

export const receiptMetadataSchema = z.object({
  id: z.uuid(), bucketId: z.literal("receipts"), objectPath: z.string().min(1),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]), byteSize: z.number().int().positive(),
  width: z.number().int().positive().nullable(), height: z.number().int().positive().nullable(),
  sortOrder: z.number().int().nonnegative(), createdAt: z.string(),
});
export const receiptMetadataListSchema = z.array(receiptMetadataSchema);

export type Cart = z.infer<typeof cartSchema>;
export type CartItem = z.infer<typeof cartItemSchema>;
export type ReferenceData = z.infer<typeof referenceDataSchema>;
export type ListDirectoryItem = z.infer<typeof listDirectoryItemSchema>;
export type ListDetail = z.infer<typeof listDetailSchema>;
export type ListItem = z.infer<typeof listItemSchema>;
export type ProductSummary = z.infer<typeof productSummarySchema>;
export type BarcodeLookupResponse = z.infer<typeof barcodeLookupResponseSchema>;
export type ProductDetail = z.infer<typeof productDetailSchema>;
export type PriceHistoryEntry = z.infer<typeof priceHistoryEntrySchema>;
export type HistoryRow = z.infer<typeof historyRowSchema>;
export type HistoryCartDetail = z.infer<typeof historyCartDetailSchema>;
export type HistoryCartItem = z.infer<typeof historyCartItemSchema>;
export type ReceiptMetadata = z.infer<typeof receiptMetadataSchema>;
