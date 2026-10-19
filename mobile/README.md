# Remembrancer for iPhone

The iPhone app is the web app (`../web`) inside a native shell made with
[Capacitor](https://capacitorjs.com). The app's screens are the same
`web/dist` build the website uses, packaged into the app; Capacitor adds the
iPhone-only parts (Xcode project, icon, permissions, native plugins).

```
mobile/
├── capacitor.config.json   app name, app ID, and where the web build is (../web/dist)
├── package.json            Capacitor and its plugins
└── ios/App/                the Xcode project (App.xcodeproj)
    ├── App/Info.plist      app settings and permissions
    ├── App/Assets.xcassets app icon and launch image
    └── CapApp-SPM/         Capacitor and plugins (Swift Package Manager)
```

Placeholders until the App Store setup (change before the first upload to
Apple; after that the app ID is permanent):

- app name: Remembrancer
- app ID: com.makeyourwordbook.remembrancer

## Everyday commands (from `mobile/`)

- `npm run sync` — build the web app and copy it into the iPhone project
  (run after any change in `web/`).
- `npm run open` — open the project in Xcode; pick a simulator or your
  iPhone and press ▶ Run.

Needs Xcode (Mac App Store) selected as the developer tools:
`sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`.

## Not done yet (see the plan on branch feature/iphone-app)

- The app calls the server at relative `/api`, which only works on the
  website: step 3 points it at https://makeyourwordbook.com.
- Signing in (step 4), background audio (5), icon and safe areas (6),
  keyboard (7), TestFlight (8).
