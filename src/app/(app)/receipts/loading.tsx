import * as S from "@/components/Skeleton";
export default function Loading() {
  return <S.Pulse><S.SkTitle w="w-48"/><S.SkLine/><S.SkTable rows={7} cols={7}/></S.Pulse>;
}
