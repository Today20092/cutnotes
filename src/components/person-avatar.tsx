import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

/** Decorative: the adjacent name or the account link supplies the accessible label. */
export function PersonAvatar({
  name,
  src,
  className,
}: {
  name: string;
  src?: string | null;
  className?: string;
}) {
  return (
    <Avatar aria-hidden className={className}>
      {src && <AvatarImage src={src} alt="" />}
      <AvatarFallback>{name.trim().charAt(0).toUpperCase() || "?"}</AvatarFallback>
    </Avatar>
  );
}
