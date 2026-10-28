import * as S from "@/components/Skeleton";
export default function Loading() {
  return <S.Pulse><S.SkTitle w="w-56"/><S.SkTabs/><S.SkStats n={4}/><S.SkTable rows={5} cols={3}/><S.SkTable rows={6} cols={2}/></S.Pulse>;
}
