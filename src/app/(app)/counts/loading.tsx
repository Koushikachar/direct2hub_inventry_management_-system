import * as S from "@/components/Skeleton";
export default function Loading() {
  return <S.Pulse><S.SkTitle w="w-44"/><S.SkForm fields={3}/><S.SkTable rows={5} cols={4}/></S.Pulse>;
}
