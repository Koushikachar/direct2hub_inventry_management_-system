import * as S from "@/components/Skeleton";
export default function Loading() {
  return <S.Pulse><S.SkTitle w="w-32"/><S.SkForm fields={6}/><S.SkTable rows={7} cols={6}/></S.Pulse>;
}
