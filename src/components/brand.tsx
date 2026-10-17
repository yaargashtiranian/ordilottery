import { Compass } from "lucide-react";
import Image from "next/image";
import { brand } from "@/lib/site";

/** The compass is decorative; it is not presented as the company's official logo. */
export function Brand({ light = false }: { light?: boolean }) {
  return (
    <span className={`brand ${light ? "brand-light" : ""}`}>
      {brand.logo ? (
        <Image src={brand.logo} alt="" width={42} height={42} />
      ) : (
        <span className="brand-symbol" aria-hidden="true">
          <Compass strokeWidth={1.5} />
        </span>
      )}
      <span>
        <strong>
          {brand.name}
          <span className="brand-dot">.</span>
        </strong>
        <small>{brand.latinName}</small>
      </span>
    </span>
  );
}
