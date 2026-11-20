import type { GearId } from "./Bird";

export function GearIcon({
  id,
  title,
  size = 48,
}: {
  id: GearId;
  title?: string;
  size?: number;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/assets/svg/gear/icons/${id}.svg`}
      alt={title ?? ""}
      width={size}
      height={size}
    />
  );
}
