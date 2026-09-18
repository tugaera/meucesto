"use client";

import { CheckCircle2, Save, Trash2 } from "lucide-react";
import { useActionState } from "react";
import { Badge } from "@/components/ui/badge";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Field, Input, Select } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { useT } from "@/i18n/provider";
import { useMutationId } from "@/lib/actions/use-mutation-id";
import type { ReferenceData } from "@/types/domain";
import {
  deleteCatalogEntityDirectAction,
  initialAdminActionResult,
  saveBrandAction,
  saveCategoryAction,
  saveStoreAction,
  saveUnitAction,
  type AdminActionResult,
} from "./actions";
import { AdminFeedback } from "./admin-feedback";

function ActiveCheckbox({ defaultChecked = true }: { defaultChecked?: boolean }) {
  const { t } = useT();
  return <label className="flex min-h-11 items-center gap-3 text-sm font-semibold"><input type="checkbox" name="isActive" defaultChecked={defaultChecked} className="h-5 w-5 accent-[var(--emerald)]" />{t("admin.active")}</label>;
}

function DeleteEntity({ entityType, entityId }: { entityType: "category" | "brand" | "unit"; entityId: string }) {
  const { t } = useT();
  return <><input type="hidden" name="entityType" value={entityType} /><input type="hidden" name="entityId" value={entityId} /><ConfirmButton type="submit" formAction={deleteCatalogEntityDirectAction} variant="quiet" className="text-[var(--danger)]" confirmMessage={t("admin.hardDeleteWarning")}><Trash2 className="h-4 w-4" aria-hidden />{t("admin.hardDelete")}</ConfirmButton></>;
}

function FormFooter({ state, isAdmin, deleteEntity }: { state: AdminActionResult; isAdmin: boolean; deleteEntity?: { type: "category" | "brand" | "unit"; id: string } }) {
  const { t } = useT();
  return <><AdminFeedback result={state} /><div className="flex flex-wrap justify-between gap-3">{isAdmin && deleteEntity ? <DeleteEntity entityType={deleteEntity.type} entityId={deleteEntity.id} /> : <span />}<SubmitButton><Save className="h-4 w-4" aria-hidden />{t("admin.saveItem")}</SubmitButton></div></>;
}

export function StoresPanel({ references }: { references: ReferenceData }) {
  const { t } = useT();
  return <div className="grid gap-5"><StoreForm title={t("admin.newStore")} /><div className="divide-y divide-[var(--line)] border-y border-[var(--line)]">{references.stores.map((store) => <StoreForm key={store.id} store={store} title={store.name} />)}</div></div>;
}

function StoreForm({ title, store }: { title: string; store?: ReferenceData["stores"][number] }) {
  const { t } = useT();
  const [state, action] = useActionState(saveStoreAction, initialAdminActionResult);
  const mutationId = useMutationId(state);
  const form = <form action={action} className="grid gap-4 py-4"><input type="hidden" name="storeId" value={store?.id ?? ""} /><input type="hidden" name="mutationId" value={mutationId} /><div className="grid gap-4 sm:grid-cols-[1fr_130px]"><Field label={t("common.name")} htmlFor={`store-name-${store?.id ?? "new"}`}><Input id={`store-name-${store?.id ?? "new"}`} name="name" defaultValue={store?.name} required /></Field><Field label={t("admin.sortOrder")} htmlFor={`store-order-${store?.id ?? "new"}`}><Input id={`store-order-${store?.id ?? "new"}`} name="sortOrder" type="number" defaultValue={store?.sortOrder ?? ""} /></Field></div><ActiveCheckbox defaultChecked={store?.isActive ?? true} /><FormFooter state={state} isAdmin={false} /></form>;
  return store ? <details><summary className="flex min-h-14 cursor-pointer items-center justify-between gap-3 py-3"><span className="font-semibold">{title}</span><Badge tone={store.isActive ? "success" : "danger"}>{store.isActive ? t("common.active") : t("common.inactive")}</Badge></summary>{form}</details> : <section aria-label={title}><h2 className="text-lg font-bold">{title}</h2>{form}</section>;
}

export function CategoriesPanel({ references, isAdmin }: { references: ReferenceData; isAdmin: boolean }) {
  const { t } = useT();
  const roots = references.categories.filter((category) => !category.parentId);
  return <div className="grid gap-5"><CategoryForm title={t("admin.newCategory")} categories={roots} isAdmin={isAdmin} /><div className="divide-y divide-[var(--line)] border-y border-[var(--line)]">{references.categories.map((category) => <CategoryForm key={category.id} title={category.name} category={category} categories={roots.filter((root) => root.id !== category.id)} isAdmin={isAdmin} />)}</div></div>;
}

function CategoryForm({ title, category, categories, isAdmin }: { title: string; category?: ReferenceData["categories"][number]; categories: ReferenceData["categories"]; isAdmin: boolean }) {
  const { t } = useT();
  const [state, action] = useActionState(saveCategoryAction, initialAdminActionResult);
  const saveMutationId = useMutationId(state);
  const deleteMutationId = useMutationId();
  const mutationIds = { save: saveMutationId, delete: deleteMutationId };
  const form = <form action={action} className="grid gap-4 py-4"><input type="hidden" name="categoryId" value={category?.id ?? ""} /><input type="hidden" name="mutationId" value={mutationIds.save} /><input type="hidden" name="deleteMutationId" value={mutationIds.delete} /><Field label={t("common.name")} htmlFor={`category-name-${category?.id ?? "new"}`}><Input id={`category-name-${category?.id ?? "new"}`} name="name" defaultValue={category?.name} required /></Field><div className="grid gap-4 sm:grid-cols-[1fr_130px]"><Field label={t("admin.parent")} htmlFor={`category-parent-${category?.id ?? "new"}`}><Select id={`category-parent-${category?.id ?? "new"}`} name="parentId" defaultValue={category?.parentId ?? ""}><option value="">{t("common.none")}</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field><Field label={t("admin.sortOrder")} htmlFor={`category-order-${category?.id ?? "new"}`}><Input id={`category-order-${category?.id ?? "new"}`} name="sortOrder" type="number" defaultValue={category?.sortOrder ?? ""} /></Field></div><ActiveCheckbox defaultChecked={category?.isActive ?? true} /><FormFooter state={state} isAdmin={isAdmin} {...(category ? { deleteEntity: { type: "category" as const, id: category.id } } : {})} /></form>;
  return category ? <details><summary className="flex min-h-14 cursor-pointer items-center justify-between gap-3 py-3"><span className={category.parentId ? "pl-5 font-semibold" : "font-bold"}>{title}</span><Badge tone={category.isActive ? "success" : "danger"}>{category.isActive ? t("common.active") : t("common.inactive")}</Badge></summary>{form}</details> : <section aria-label={title}><h2 className="text-lg font-bold">{title}</h2>{form}</section>;
}

export function BrandsPanel({ references, isAdmin }: { references: ReferenceData; isAdmin: boolean }) {
  const { t } = useT();
  const ordered = [...references.brands].sort((left, right) => Number(left.isVerified) - Number(right.isVerified) || left.name.localeCompare(right.name));
  return <div className="grid gap-5"><BrandForm title={t("admin.newBrand")} isAdmin={isAdmin} /><div className="divide-y divide-[var(--line)] border-y border-[var(--line)]">{ordered.map((brand) => <BrandForm key={brand.id} title={brand.name} brand={brand} isAdmin={isAdmin} />)}</div></div>;
}

function BrandForm({ title, brand, isAdmin }: { title: string; brand?: ReferenceData["brands"][number]; isAdmin: boolean }) {
  const { t } = useT();
  const [state, action] = useActionState(saveBrandAction, initialAdminActionResult);
  const saveMutationId = useMutationId(state);
  const deleteMutationId = useMutationId();
  const mutationIds = { save: saveMutationId, delete: deleteMutationId };
  const form = <form action={action} className="grid gap-4 py-4"><input type="hidden" name="brandId" value={brand?.id ?? ""} /><input type="hidden" name="mutationId" value={mutationIds.save} /><input type="hidden" name="deleteMutationId" value={mutationIds.delete} /><Field label={t("common.name")} htmlFor={`brand-name-${brand?.id ?? "new"}`}><Input id={`brand-name-${brand?.id ?? "new"}`} name="name" defaultValue={brand?.name} required /></Field><div className="flex flex-wrap gap-5"><ActiveCheckbox defaultChecked={brand?.isActive ?? true} /><label className="flex min-h-11 items-center gap-3 text-sm font-semibold"><input type="checkbox" name="isVerified" defaultChecked={brand?.isVerified ?? true} className="h-5 w-5 accent-[var(--emerald)]" />{t("admin.verified")}</label></div><FormFooter state={state} isAdmin={isAdmin} {...(brand ? { deleteEntity: { type: "brand" as const, id: brand.id } } : {})} /></form>;
  return brand ? <details><summary className="flex min-h-14 cursor-pointer items-center justify-between gap-3 py-3"><span className="font-semibold">{title}</span><div className="flex gap-2">{!brand.isVerified ? <Badge tone="warning">{t("products.awaitingBrand")}</Badge> : <Badge tone="success"><CheckCircle2 className="mr-1 h-3.5 w-3.5" aria-hidden />{t("admin.verified")}</Badge>}</div></summary>{form}</details> : <section aria-label={title}><h2 className="text-lg font-bold">{title}</h2>{form}</section>;
}

export function UnitsPanel({ references, isAdmin }: { references: ReferenceData; isAdmin: boolean }) {
  const { t } = useT();
  return <div className="grid gap-5"><UnitForm title={t("admin.newUnit")} units={references.units} isAdmin={isAdmin} /><div className="divide-y divide-[var(--line)] border-y border-[var(--line)]">{references.units.map((unit) => <UnitForm key={unit.id} title={`${unit.name} (${unit.abbreviation})`} unit={unit} units={references.units} isAdmin={isAdmin} />)}</div></div>;
}

function UnitForm({ title, unit, units, isAdmin }: { title: string; unit?: ReferenceData["units"][number]; units: ReferenceData["units"]; isAdmin: boolean }) {
  const { t } = useT();
  const [state, action] = useActionState(saveUnitAction, initialAdminActionResult);
  const saveMutationId = useMutationId(state);
  const deleteMutationId = useMutationId();
  const mutationIds = { save: saveMutationId, delete: deleteMutationId };
  const form = <form action={action} className="grid gap-4 py-4"><input type="hidden" name="unitId" value={unit?.id ?? ""} /><input type="hidden" name="mutationId" value={mutationIds.save} /><input type="hidden" name="deleteMutationId" value={mutationIds.delete} /><div className="grid gap-4 sm:grid-cols-2"><Field label={t("common.name")} htmlFor={`unit-name-${unit?.id ?? "new"}`}><Input id={`unit-name-${unit?.id ?? "new"}`} name="name" defaultValue={unit?.name} required /></Field><Field label={t("admin.abbreviation")} htmlFor={`unit-abbreviation-${unit?.id ?? "new"}`}><Input id={`unit-abbreviation-${unit?.id ?? "new"}`} name="abbreviation" defaultValue={unit?.abbreviation} required /></Field></div><div className="flex flex-wrap gap-5"><ActiveCheckbox defaultChecked={unit?.isActive ?? true} /><label className="flex min-h-11 items-center gap-3 text-sm font-semibold"><input type="checkbox" name="makeDefault" defaultChecked={unit?.isDefault ?? false} className="h-5 w-5 accent-[var(--emerald)]" />{t("admin.default")}</label></div>{unit?.isDefault ? <Field label={t("admin.default")} htmlFor={`unit-replacement-${unit.id}`}><Select id={`unit-replacement-${unit.id}`} name="replacementDefaultId" defaultValue=""><option value="">{t("common.none")}</option>{units.filter((item) => item.id !== unit.id && item.isActive).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field> : <input type="hidden" name="replacementDefaultId" value="" />}<FormFooter state={state} isAdmin={isAdmin} {...(unit ? { deleteEntity: { type: "unit" as const, id: unit.id } } : {})} /></form>;
  return unit ? <details><summary className="flex min-h-14 cursor-pointer items-center justify-between gap-3 py-3"><span className="font-semibold">{title}</span>{unit.isDefault ? <Badge tone="info">{t("admin.default")}</Badge> : null}</summary>{form}</details> : <section aria-label={title}><h2 className="text-lg font-bold">{title}</h2>{form}</section>;
}
