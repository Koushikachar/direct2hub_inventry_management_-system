"use client";
import { ghost } from "./ui";
export default function PrintButton() { return <button onClick={() => window.print()} className={`${ghost} print:hidden`}>Print / Save as PDF</button>; }
