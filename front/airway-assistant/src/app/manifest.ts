import type {
  MetadataRoute,
} from "next";

export default function manifest():
  MetadataRoute.Manifest {
  return {
    name:
      "Airway Imaging Assistant",

    short_name:
      "Airway",

    description:
      "Standardized airway image capture assistant",

    start_url: "/",

    display: "standalone",

    background_color:
      "#f8fafc",

    theme_color:
      "#0369a1",

    orientation:
      "portrait",

    icons: [
      {
        src: "/icon.svg",

        sizes: "any",

        type: "image/svg+xml",
      },
    ],
  };
}