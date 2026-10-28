import * as S from "@/components/Skeleton";
export default function Loading() {
  return <S.Pulse><S.SkTitle w="w-40"/><S.SkTabs/><S.SkStats n={2}/><S.SkTable rows={4} cols={4}/></S.Pulse>;
}
