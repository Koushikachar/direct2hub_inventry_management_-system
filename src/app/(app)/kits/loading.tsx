import * as S from "@/components/Skeleton";
export default function Loading() {
  return <S.Pulse><S.SkTitle w="w-24"/><S.SkLine/><S.SkForm fields={6}/><S.SkTable rows={4} cols={4}/></S.Pulse>;
}
