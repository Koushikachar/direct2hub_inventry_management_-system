import * as S from "@/components/Skeleton";
export default function Loading() {
  return <S.Pulse><S.SkTitle w="w-56"/><S.SkStats n={4}/><S.SkPanel lines={2}/><S.SkTable rows={3} cols={4}/><S.SkTable rows={3} cols={4}/></S.Pulse>;
}
