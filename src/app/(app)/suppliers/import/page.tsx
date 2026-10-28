import Link from "next/link";
import { Shell } from "@/components/Shell"; import ImportForm from "@/components/ImportForm"; import { ctx } from "@/lib/ctx";
export default async function ImportSuppliers() {
  const c = await ctx();
  return <Shell title="Import suppliers" active="Suppliers" admin={c.op}>
    <Link href="/suppliers" className="text-sm text-brand underline">← Suppliers</Link>
    <p className="max-w-xl text-sm text-ink/70">Upload a CSV with the columns <code>name</code> and optionally <code>phone, email</code>. You'll see a preview with any row errors before anything is saved.</p>
    <ImportForm kind="suppliers" /></Shell>;
}
