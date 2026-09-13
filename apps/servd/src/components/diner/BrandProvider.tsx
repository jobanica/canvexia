import { brandStyle, type BrandInput } from "@/lib/theme/brand";

/**
 * Wraps diner-facing pages and applies the restaurant's brand colors by setting
 * the `--brand-*` CSS variables on a container. Everything inside re-skins
 * automatically. This is what makes the diner experience white-label.
 */
export function BrandProvider({
  brand,
  children,
}: {
  brand: BrandInput;
  children: React.ReactNode;
}) {
  return (
    <div style={brandStyle(brand)} className="min-h-screen bg-brand-surface">
      {children}
    </div>
  );
}
