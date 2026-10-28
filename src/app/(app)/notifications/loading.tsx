import * as S from "@/components/Skeleton";
export default function Loading() {
  return <S.Pulse><S.SkTitle w="w-52"/><S.SkBar h="h-10" w="w-40"/><S.SkList n={6}/></S.Pulse>;
}
