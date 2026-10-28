import * as S from "@/components/Skeleton";
export default function Loading() {
  return <S.Pulse><S.SkTitle w="w-40"/><S.SkPills n={3}/><S.SkStats n={4}/><div className="grid gap-4 lg:grid-cols-2"><S.SkChart/><S.SkChart/></div><div className="grid gap-4 lg:grid-cols-2"><S.SkTable rows={4} cols={3}/><S.SkTable rows={4} cols={2}/></div><S.SkTable rows={4} cols={4}/></S.Pulse>;
}
