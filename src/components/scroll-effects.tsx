"use client";

import { useEffect } from "react";

/** Enhance visible HTML; preference changes must restore its original styles. */
export function ScrollEffects() {
  useEffect(() => {
    let disposed = false;
    let loading = false;
    let cleanup: (() => void) | undefined;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");

    /** Defer downloading GSAP until motion is permitted, including later changes. */
    function loadWhenPermitted() {
      if (preference.matches || disposed || loading || cleanup) return;
      loading = true;
      Promise.all([import("gsap"), import("gsap/ScrollTrigger")])
        .then(([{ gsap }, { ScrollTrigger }]) => {
          if (disposed) return;
          gsap.registerPlugin(ScrollTrigger);
          const media = gsap.matchMedia();
          cleanup = () => media.revert();
          // GSAP reverts all registered animations when either condition changes.
          media.add(
            {
              motion: "(prefers-reduced-motion: no-preference)",
              desktop: "(min-width: 900px)",
            },
            (context) => {
              if (!context.conditions?.motion) return;
              gsap.utils
                .toArray<HTMLElement>("[data-reveal]")
                .forEach((element) => {
                  gsap.from(element, {
                    y: 24,
                    opacity: 0.55,
                    duration: 0.75,
                    ease: "power2.out",
                    scrollTrigger: {
                      trigger: element,
                      start: "top 94%",
                      once: true,
                    },
                  });
                });
              if (!context.conditions.desktop) return;
              gsap.to(".journey-line-progress", {
                scaleY: 1,
                transformOrigin: "top",
                ease: "none",
                scrollTrigger: {
                  trigger: "#journey",
                  start: "top 55%",
                  end: "bottom 65%",
                  scrub: 0.6,
                },
              });
              gsap.to(".hero-plane", {
                y: -24,
                x: -16,
                rotation: -8,
                ease: "none",
                scrollTrigger: {
                  trigger: ".hero",
                  start: "top top",
                  end: "bottom top",
                  scrub: 1,
                },
              });
            },
          );
        })
        .catch(() => {
          // Keep the static page readable even if loading or animation setup fails.
          cleanup?.();
          cleanup = undefined;
        })
        .finally(() => {
          loading = false;
        });
    }

    loadWhenPermitted();
    preference.addEventListener("change", loadWhenPermitted);
    return () => {
      disposed = true;
      preference.removeEventListener("change", loadWhenPermitted);
      cleanup?.();
    };
  }, []);
  return null;
}
