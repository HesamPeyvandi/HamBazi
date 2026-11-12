import { SkeletonHeading, SkeletonList, SkeletonPage } from '@/components/ui/Skeleton';
export default function Loading() { return <SkeletonPage narrow label="در حال بارگذاری اعلان‌ها…"><SkeletonHeading sub={false} /><SkeletonList count={6} /></SkeletonPage>; }
