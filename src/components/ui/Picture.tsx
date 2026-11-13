import { bundledVariants } from '@/lib/images';

type Props = {
  src: string; alt: string; className?: string;
  /** `sizes` attribute: how wide the image is rendered at each breakpoint (drives which file the browser picks). */
  sizes?: string;
  /** Above-the-fold / LCP image: loaded eagerly with high fetch priority. Everything else is lazy. */
  priority?: boolean;
  'aria-hidden'?: boolean | 'true' | 'false';
  width?: number; height?: number;
  /** Art direction: a different photo from this media query up (e.g. wide hero on desktop). */
  art?: { media: string; src: string };
};

/**
 * Responsive image: AVIF first, WebP next, with a WebP `<img>` fallback; width/height-free layouts keep working because
 * callers size it with CSS (object-cover). Non-bundled sources (uploads) render as a plain lazy <img>.
 * Works in server and client components (no hooks).
 */
export function Picture({ src, alt, className, sizes = '100vw', priority = false, width, height, art, ...rest }: Props) {
  const v = bundledVariants(src);
  const artV = art ? bundledVariants(art.src) : null;
  const common = {
    className, width, height, decoding: 'async' as const,
    loading: priority ? ('eager' as const) : ('lazy' as const),
    fetchPriority: priority ? ('high' as const) : undefined, ...rest,
  };
  if (!v) { // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} {...common} />;
  }
  return (
    <picture className="contents">
      {artV?.avif && <source media={art!.media} type="image/avif" srcSet={artV.avif} sizes={sizes} />}
      {artV && <source media={art!.media} type="image/webp" srcSet={artV.webp} sizes={sizes} />}
      {v.avif && <source type="image/avif" srcSet={v.avif} sizes={sizes} />}
      <source type="image/webp" srcSet={v.webp} sizes={sizes} />
      <img src={v.fallback} alt={alt} {...common} />
    </picture>
  );
}
