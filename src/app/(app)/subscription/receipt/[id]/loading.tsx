import * as S from "@/components/Skeleton";
export default function Loading() {
  return <S.Pulse><S.SkTitle w="w-40"/><S.SkPanel lines={3}/><S.SkPanel lines={2}/></S.Pulse>;
}
