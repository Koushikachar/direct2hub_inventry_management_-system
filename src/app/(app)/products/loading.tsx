import * as S from "@/components/Skeleton";
export default function Loading() {
  return <S.Pulse><S.SkTitle w="w-36"/><S.SkForm fields={6}/><S.SkBar/><S.SkTable rows={8} cols={5}/></S.Pulse>;
}
