import * as S from "@/components/Skeleton";
export default function Loading() {
  return <S.Pulse><S.SkTitle w="w-52"/><S.SkTabs/><S.SkBar/><S.SkTable rows={8} cols={6}/></S.Pulse>;
}
