import { SkeletonGrid, SkeletonHeading, SkeletonPage } from '@/components/ui/Skeleton';
export default function Loading() { return <SkeletonPage label="در حال بارگذاری علاقه‌مندی‌ها…"><SkeletonHeading sub={false} /><SkeletonGrid count={3} /></SkeletonPage>; }
