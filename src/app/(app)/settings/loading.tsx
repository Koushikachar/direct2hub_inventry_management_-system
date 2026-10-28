import * as S from "@/components/Skeleton";
export default function Loading() {
  return <S.Pulse><S.SkTitle w="w-36"/><S.SkPanel lines={3}/><S.SkPanel lines={2}/><S.SkPanel lines={2}/><S.SkTable rows={4} cols={3}/><S.SkForm fields={3}/></S.Pulse>;
}
