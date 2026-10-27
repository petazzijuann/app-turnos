/** SAAS · Isotipo de la marca (public/brand, generado por scripts/gen-icons.mjs). */
import { config } from './config'
import { cx } from './ui'

export function Logo({ className, size = 44 }: { className?: string; size?: number }) {
  return (
    <span className={cx('inline-flex items-center', className)}>
      <img
        src="/brand/futurislabs-icon-128.png"
        srcSet="/brand/futurislabs-icon-64.png 64w, /brand/futurislabs-icon-128.png 128w"
        sizes={`${size}px`}
        width={size}
        height={size}
        alt={`${config.brand} ${config.appName}`}
        className="shrink-0 object-contain"
        style={{ width: size, height: size }}
      />
    </span>
  )
}
