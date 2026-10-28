"use client";
import { ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
const grid = "rgba(100,130,145,.2)";
export function SalesChart({ data }: { data: { d: string; v: number }[] }) {
  return <div className="h-56 w-full"><ResponsiveContainer width="100%" height="100%"><AreaChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
    <CartesianGrid strokeDasharray="3 3" stroke={grid} /><XAxis dataKey="d" tick={{ fontSize: 11 }} minTickGap={24} /><YAxis tick={{ fontSize: 11 }} width={48} />
    <Tooltip formatter={(v: any) => `₹${v}`} /><Area type="monotone" dataKey="v" stroke="#0F766E" strokeWidth={2} fill="#0F766E" fillOpacity={0.18} /></AreaChart></ResponsiveContainer></div>;
}
export function StatusChart({ data }: { data: { s: string; n: number }[] }) {
  return <div className="h-56 w-full"><ResponsiveContainer width="100%" height="100%"><BarChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
    <CartesianGrid strokeDasharray="3 3" stroke={grid} /><XAxis dataKey="s" tick={{ fontSize: 11 }} /><YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={32} />
    <Tooltip /><Bar dataKey="n" fill="#F0A202" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></div>;
}
