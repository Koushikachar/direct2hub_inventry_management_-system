import * as S from "@/components/Skeleton";
/** Skeleton for sign-in, register, verify and other pages outside the app frame. */
export default function Loading() {
  return <main className="grid min-h-dvh place-items-center p-6"><div className="glass w-full max-w-sm p-8"><S.Pulse><S.SkTitle w="w-48" /><S.SkLine w="w-64" /><S.SkBar /><S.SkBar /><S.SkBar h="h-11" w="w-full" /></S.Pulse></div></main>;
}
