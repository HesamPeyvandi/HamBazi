import { Skeleton, SkeletonHeading, SkeletonList, SkeletonPage } from '@/components/ui/Skeleton';
export default function Loading() {
  return <SkeletonPage narrow label="در حال بارگذاری پروفایل…"><div className="card mb-5 flex items-center gap-4 p-5" aria-hidden="true"><Skeleton className="h-20 w-20 shrink-0 !rounded-full" /><div className="flex-1 space-y-2"><Skeleton className="h-6 w-40" /><Skeleton className="h-4 w-24" /></div></div><SkeletonHeading sub={false} /><SkeletonList count={3} /></SkeletonPage>;
}
