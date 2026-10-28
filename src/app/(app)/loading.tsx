import * as S from "@/components/Skeleton";
/** Fallback skeleton for any app page without its own. */
export default function Loading() {
  return <S.Pulse><S.SkTitle /><S.SkStats n={4} /><S.SkTable rows={6} cols={5} /></S.Pulse>;
}
