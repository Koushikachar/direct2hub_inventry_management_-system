import * as S from "@/components/Skeleton";
export default function Loading() {
  return <S.Pulse><S.SkTitle w="w-40"/><S.SkStats n={3}/><S.SkChart/></S.Pulse>;
}
