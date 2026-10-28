import * as S from "@/components/Skeleton";
export default function Loading() {
  return <S.Pulse><S.SkTitle w="w-32"/><S.SkLine/><S.SkForm fields={6}/><S.SkTable rows={5} cols={7}/></S.Pulse>;
}
