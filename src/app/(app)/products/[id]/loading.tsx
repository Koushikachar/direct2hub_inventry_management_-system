import * as S from "@/components/Skeleton";
export default function Loading() {
  return <S.Pulse><S.SkTitle w="w-64"/><S.SkStats n={4}/><S.SkForm fields={5}/><S.SkTable rows={5} cols={4}/></S.Pulse>;
}
