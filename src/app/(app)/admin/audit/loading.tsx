import * as S from "@/components/Skeleton";
export default function Loading() {
  return <S.Pulse><S.SkTitle w="w-40"/><S.SkTabs/><S.SkBar/><S.SkTable rows={10} cols={5}/></S.Pulse>;
}
