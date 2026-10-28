import * as S from "@/components/Skeleton";
export default function Loading() {
  return <S.Pulse><S.SkTitle w="w-40"/><S.SkPanel lines={8}/><S.SkForm fields={4}/></S.Pulse>;
}
