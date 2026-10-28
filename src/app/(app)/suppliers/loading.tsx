import * as S from "@/components/Skeleton";
export default function Loading() {
  return <S.Pulse><S.SkTitle w="w-40"/><S.SkBar h="h-10" w="w-32"/><S.SkForm fields={4}/><S.SkTable rows={6} cols={3}/></S.Pulse>;
}
