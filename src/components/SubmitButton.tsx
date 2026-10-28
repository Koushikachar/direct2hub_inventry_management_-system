"use client";
import { useFormStatus } from "react-dom";
/** A submit button that shows it is working and can't be pressed twice. Use it in place of <button> inside any <form action={...}>. Outside a form it behaves like a normal button. */
export default function SubmitButton({ children, className = "", pendingText, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { pendingText?: string }) {
  const { pending } = useFormStatus();
  return <button {...rest} type={rest.type ?? "submit"} disabled={pending || rest.disabled} aria-busy={pending || undefined} className={`${className} ${pending ? "cursor-progress opacity-70" : ""}`}>
    {pending ? <span className="inline-flex items-center gap-2"><span aria-hidden className="h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent motion-safe:animate-spin" />{pendingText ?? children}</span> : children}</button>;
}
