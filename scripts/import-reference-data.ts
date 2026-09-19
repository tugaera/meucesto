import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { z } from "zod";
import type { Database } from "../src/types/database.ts";

config({ path: ".env", override: false, quiet: true });
config({ path: ".env.local", override: true, quiet: true });

const environment = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  SUPABASE_SECRET_KEY: z.string().min(20),
}).parse(process.env);

const client = createClient<Database>(environment.NEXT_PUBLIC_SUPABASE_URL, environment.SUPABASE_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const stores = [
  "Continente",
  "Continente Bom Dia",
  "Pingo Doce",
  "Lidl",
  "Mercadona",
  "Aldi",
  "Auchan",
  "Intermarché",
  "Minipreço",
  "El Corte Inglés Supermercado",
  "Froiz",
  "Apolónia",
  "Spar",
  "Coviran",
  "E.Leclerc",
  "Makro",
  "Celeiro",
] as const;

const brands = [
  "Continente",
  "Pingo Doce",
  "Lidl",
  "Milbona",
  "Deluxe",
  "Combino",
  "Chef Select",
  "Mercadona",
  "Hacendado",
  "Bosque Verde",
  "Deliplus",
  "Aldi",
  "Auchan",
  "Mimosa",
  "Agros",
  "Terra Nostra",
  "Matinal",
  "Parmalat",
  "Président",
  "Danone",
  "Nestlé",
  "Nacional",
  "Milaneza",
  "Cigala",
  "Bom Sucesso",
  "Caçarola",
  "Gallo",
  "Oliveira da Serra",
  "Compal",
  "Sumol",
  "Super Bock",
  "Sagres",
  "Delta",
  "Nicola",
  "Nescafé",
  "Renova",
  "Dodot",
  "Fairy",
  "Skip",
  "Ariel",
  "Persil",
  "Finish",
  "Cif",
  "Sonasol",
  "Vaqueiro",
  "Planta",
  "Guloso",
  "Heinz",
  "Calvé",
  "Paladin",
  "Pescanova",
  "Iglo",
  "Riberalves",
  "Ferbar",
  "Cem Porcento",
  "Salutem",
] as const;

interface CategorySeed {
  name: string;
  children?: readonly string[];
}

const categories: readonly CategorySeed[] = [
  { name: "Fruta e legumes", children: ["Fruta fresca", "Legumes frescos", "Saladas e ervas", "Batatas, cebolas e alhos", "Frutos secos"] },
  { name: "Carne, peixe e marisco", children: ["Carne de aves", "Carne de porco", "Carne de vaca", "Charcutaria", "Peixe fresco", "Peixe embalado", "Marisco"] },
  { name: "Laticínios e ovos", children: ["Leite", "Iogurtes", "Queijo", "Manteiga e natas", "Ovos", "Bebidas vegetais"] },
  { name: "Padaria e pastelaria", children: ["Pão", "Bolos e pastelaria", "Tostas e bolachas de água e sal", "Cereais de pequeno-almoço"] },
  { name: "Mercearia", children: ["Arroz, massa e grãos", "Conservas", "Azeite, óleos e vinagre", "Molhos e temperos", "Farinha e açúcar", "Snacks", "Doces e sobremesas"] },
  { name: "Bebidas", children: ["Água", "Sumos e refrigerantes", "Café e chá", "Cerveja", "Vinho", "Bebidas espirituosas"] },
  { name: "Congelados", children: ["Legumes congelados", "Peixe congelado", "Carne congelada", "Refeições congeladas", "Gelados"] },
  { name: "Frescos e refeições prontas", children: ["Pratos prontos", "Sopas", "Saladas prontas", "Pizzas e massas frescas"] },
  { name: "Limpeza da casa", children: ["Detergente roupa", "Detergente loiça", "Limpa superfícies", "Papel higiénico e rolos", "Sacos do lixo"] },
  { name: "Higiene e beleza", children: ["Cabelo", "Banho e sabonete", "Higiene oral", "Desodorizante", "Barbear", "Cuidados de pele"] },
  { name: "Bebé", children: ["Fraldas", "Toalhitas", "Comida de bebé", "Higiene bebé"] },
  { name: "Animais", children: ["Comida de cão", "Comida de gato", "Areia e higiene", "Snacks para animais"] },
  { name: "Casa e descartáveis", children: ["Pilhas", "Lâmpadas", "Guardanapos", "Película e alumínio", "Utensílios"] },
] as const;

function key(name: string, parentId: string | null): string {
  return `${parentId ?? "root"}:${name.trim().toLocaleLowerCase("pt-PT")}`;
}

async function importStores(): Promise<{ insertedOrUpdated: number }> {
  const rows = stores.map((name, index) => ({ name, is_active: true, sort_order: (index + 1) * 10 }));
  const result = await client.from("stores").upsert(rows, { onConflict: "name" });
  if (result.error) throw result.error;
  return { insertedOrUpdated: rows.length };
}

async function importBrands(): Promise<{ insertedOrUpdated: number }> {
  const rows = brands.map((name) => ({ name, is_active: true, is_verified: true }));
  const result = await client.from("brands").upsert(rows, { onConflict: "name" });
  if (result.error) throw result.error;
  return { insertedOrUpdated: rows.length };
}

async function importCategories(): Promise<{ inserted: number; existing: number }> {
  const existingResult = await client.from("categories").select("id,name,parent_id");
  if (existingResult.error) throw existingResult.error;

  const known = new Map<string, { id: string; name: string; parent_id: string | null }>();
  for (const row of existingResult.data) {
    if (typeof row.id === "string" && typeof row.name === "string") {
      known.set(key(row.name, typeof row.parent_id === "string" ? row.parent_id : null), {
        id: row.id,
        name: row.name,
        parent_id: typeof row.parent_id === "string" ? row.parent_id : null,
      });
    }
  }

  let inserted = 0;
  let existing = 0;

  async function ensureCategory(name: string, parentId: string | null, sortOrder: number): Promise<string> {
    const existingCategory = known.get(key(name, parentId));
    if (existingCategory) {
      existing += 1;
      return existingCategory.id;
    }

    const insertResult = await client
      .from("categories")
      .insert({ name, parent_id: parentId, is_active: true, sort_order: sortOrder })
      .select("id,name,parent_id")
      .single();
    if (insertResult.error) throw insertResult.error;
    if (typeof insertResult.data.id !== "string") throw new Error(`Category insert did not return an id for ${name}`);

    const saved = {
      id: insertResult.data.id,
      name: String(insertResult.data.name),
      parent_id: typeof insertResult.data.parent_id === "string" ? insertResult.data.parent_id : null,
    };
    known.set(key(saved.name, saved.parent_id), saved);
    inserted += 1;
    return saved.id;
  }

  for (const [parentIndex, category] of categories.entries()) {
    const parentId = await ensureCategory(category.name, null, (parentIndex + 1) * 10);
    for (const [childIndex, child] of (category.children ?? []).entries()) {
      await ensureCategory(child, parentId, (childIndex + 1) * 10);
    }
  }

  return { inserted, existing };
}

const storeResult = await importStores();
const brandResult = await importBrands();
const categoryResult = await importCategories();

process.stdout.write([
  "Reference data import completed.",
  `Stores inserted/updated: ${storeResult.insertedOrUpdated}.`,
  `Brands inserted/updated: ${brandResult.insertedOrUpdated}.`,
  `Categories inserted: ${categoryResult.inserted}.`,
  `Categories already present: ${categoryResult.existing}.`,
].join("\n") + "\n");
