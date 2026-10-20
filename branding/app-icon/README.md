# App icon

Design "U5": a rounded white bookmark sending out two sound waves (saving
notes, listening to them), on the website's brand blue `#2563eb`.

- `icon.svg` — the design (130×130 grid).
- `AppIcon-1024.png` — the iPhone app icon (full square; iOS rounds the corners).
- `AppIcon-dark-1024.png`, `AppIcon-tinted-1024.png` — the iPhone's dark and
  tinted icon styles (transparent background; iOS draws the background/tint).
- `make-icons.swift` — draws the PNGs and the launch screen:
  `swift make-icons.swift <output folder>`.

The copies the app uses are in
`mobile/ios/App/App/Assets.xcassets` (AppIcon, and Splash for the launch screen).
