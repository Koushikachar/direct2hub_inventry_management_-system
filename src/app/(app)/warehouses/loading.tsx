import * as S from "@/components/Skeleton";
export default function Loading() {
  return <S.Pulse><S.SkTitle w="w-40"/><S.SkStats n={2}/><S.SkTable rows={3} cols={5}/><S.SkForm fields={4}/></S.Pulse>;
}
