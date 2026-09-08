import Image from "next/image";

/** The adjacent wordmark supplies the accessible brand name. */
export function BrandMark({
  className = "",
  size = 40,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <Image
      src="/brand/centbloom-logo-gold-on-white.webp"
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      className={`brand-mark ${className}`}
      loading="eager"
      unoptimized
    />
  );
}
