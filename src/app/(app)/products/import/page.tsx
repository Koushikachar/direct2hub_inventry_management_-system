import { Shell } from "@/components/Shell"; import ImportForm from "@/components/ImportForm"; import { ctx } from "@/lib/ctx";
export default async function ImportPage() {
  const c = await ctx();
  return <Shell title="Import products" active="Products" admin={c.op}>
    <p className="max-w-xl text-sm text-ink/70">Upload a CSV with the columns <code>sku, name, price, unit_cost</code> and optionally <code>reorder_at, opening_stock</code>. You'll see a preview with any row errors before anything is saved.</p>
    <ImportForm /></Shell>;
}
