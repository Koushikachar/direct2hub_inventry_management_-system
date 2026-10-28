import * as S from "@/components/Skeleton";
export default function Loading() {
  return <S.Pulse><S.SkTitle w="w-40"/><S.SkForm fields={5}/><S.SkTable rows={6} cols={7}/></S.Pulse>;
}
