"use client";
import SubmitButton from "./SubmitButton";
/** A SubmitButton that asks "Are you sure?" first. Use for deletes. */
export default function ConfirmSubmit({ message, children, className }: { message: string; children: React.ReactNode; className?: string }) {
  return <SubmitButton className={className} onClick={(e) => { if (!window.confirm(message)) e.preventDefault(); }}>{children}</SubmitButton>;
}
