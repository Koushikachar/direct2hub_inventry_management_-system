import * as S from "@/components/Skeleton";
export default function Loading() {
  return <S.Pulse><S.SkTitle w="w-44"/><S.SkForm fields={6}/><S.SkTable rows={6} cols={5}/></S.Pulse>;
}
