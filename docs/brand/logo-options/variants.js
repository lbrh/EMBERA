var v = (id, name, file, description) => ({ id, name, description, light: `${file}.svg`, dark: `${file}-dark.svg` });
window.VARIANTS = {
  projectName: "EMBERA",
  brandName: "EMBERA",
  concepts: [
    {
      name: "From 01 · Stripe Flame",
      variants: [
        v("01", "Stripe Flame (original)", "stripe-flame", "Round 1 pick. Flame cut into IBM's 8-bar stripes."),
        v("13", "Stripe Flame, 5-bar", "stripe-flame-5", "Fewer, fatter bars so the stripes still read at favicon size."),
        v("14", "Stripe Flame, tonal", "stripe-flame-tonal", "Bars step down IBM's blue ramp, strongest at the base where the fire is hottest."),
        v("15", "Stripe Flame tile", "stripe-flame-tile", "White striped flame knocked out of a Blue 60 product tile. Merges 01 and 05."),
        v("16", "Lockup", "lockup", "Flame and 8-bar EMBERA on one shared set of stripes, like the IBM logo itself.")
      ]
    },
    {
      name: "From 05 · Scan Tile",
      variants: [
        v("05", "Scan Tile (original)", "tile-scan", "Round 1 pick. Focus brackets around a flame on Blue 60."),
        v("17", "Scan Frame", "scan-frame", "The same idea without the tile: blue brackets and flame on any background."),
        v("18", "Scan Tile, night", "scan-tile-night", "Blue 100 tile, Blue 40 brackets, white flame. Suits a dark ops-room UI."),
        v("19", "Scan Tile, gradient", "scan-tile-gradient", "Blue 50 to Blue 80 diagonal, like the watsonx and IBM Cloud product icons."),
        v("20", "Scan Line", "scan-line", "Mid-scan: flame outlined above the scan line, solid below it. Shows the AI assessing the image."),
        v("21", "Reticle", "reticle", "Targeting ring with cardinal ticks around the flame. Detection, located.")
      ]
    },
    {
      name: "From 07 · Fire Pin",
      variants: [
        v("07", "Fire Pin (original)", "pin-flame", "Round 1 pick. Carbon-style line pin with a flame in the head."),
        v("22", "Solid Pin", "pin-solid", "Filled pin with the flame knocked out. Much stronger at 16px."),
        v("23", "Flame Pin", "flame-pin", "The flame itself tapers into a map-pin point, with the pin's hole in its belly."),
        v("24", "Pin Ping", "pin-ping", "Pin landing on the map with a ring spreading out from it: a new incident reported."),
        v("25", "Pin Tile", "pin-tile", "White line pin and flame on a Blue 60 product tile."),
        v("26", "Striped Pin", "pin-stripe", "8-bar pin with the flame cut out of its head.")
      ]
    }
  ]
};
