import { SkeletonHeading, SkeletonList, SkeletonPage, SkeletonStats } from '@/components/ui/Skeleton';
export default function Loading() { return <SkeletonPage label="در حال بارگذاری داشبورد…"><SkeletonHeading /><SkeletonStats /><SkeletonList count={3} /></SkeletonPage>; }
