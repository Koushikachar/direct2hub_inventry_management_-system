import * as S from "@/components/Skeleton";
export default function Loading() {
  return <S.Pulse><S.SkTitle w="w-64"/><S.SkTabs/><S.SkStats n={4}/><S.SkForm fields={2}/><S.SkTable rows={4} cols={3}/><S.SkTable rows={6} cols={3}/></S.Pulse>;
}
