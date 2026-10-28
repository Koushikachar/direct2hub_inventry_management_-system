import * as S from "@/components/Skeleton";
export default function Loading() {
  return <S.Pulse><S.SkTitle w="w-40"/><S.SkTabs/><S.SkStats n={3}/><S.SkTable rows={5} cols={6}/></S.Pulse>;
}
