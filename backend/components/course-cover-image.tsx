import Image from "next/image";

type CourseCoverImageProps = {
  src: string;
  alt: string;
  className?: string;
  sizes: string;
  priority?: boolean;
};

/**
 * Uploaded covers are served from our own authenticated storage route and can
 * use Next image optimization. Administrators may also supply an arbitrary
 * verified HTTPS URL; those are loaded directly so the image optimizer never
 * becomes an open remote-fetch proxy.
 */
export function CourseCoverImage({ src, alt, className, sizes, priority = false }: CourseCoverImageProps) {
  const isLocal = src.startsWith("/") && !src.startsWith("//");
  if (isLocal) return <Image src={src} alt={alt} className={className} fill sizes={sizes} priority={priority} />;

  return (
    // eslint-disable-next-line @next/next/no-img-element -- External admin URLs intentionally bypass the server-side image proxy.
    <img
      src={src}
      alt={alt}
      className={className}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : "auto"}
      decoding="async"
      referrerPolicy="no-referrer"
    />
  );
}
