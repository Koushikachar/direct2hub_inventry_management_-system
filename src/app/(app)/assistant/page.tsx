import { Shell } from "@/components/Shell"; import AssistantChat from "@/components/AssistantChat";
import { ctx } from "@/lib/ctx"; import { aiReady, aiLabel } from "@/lib/ai";
export const dynamic = "force-dynamic";
export default async function Assistant() { const c = await ctx(); return <Shell title="Assistant" active="Assistant" admin={c.op}><AssistantChat ready={aiReady()} via={aiLabel("chat")} /></Shell>; }
