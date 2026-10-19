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

## Plan (branch feature/iphone-app)

The app carries its own copy of the web app (not a wrapper around the
website) so it can work offline — the main reason for an app.

Done:
1. ~~Decisions and accounts~~ — deferred: Apple Developer account and the
   final name/ID are needed before step 10 (first upload to Apple).
2. Empty Capacitor shell (`mobile/`).
3. The app talks to makeyourwordbook.com (`web/src/client/native/platform.js`).
4. Signing in inside the app (`web/src/client/native/auth.js`): Cognito's
   login page in an in-app browser sheet, back to `remembrancer://auth`
   (Info.plist), tokens from `/api/auth/app/token` (PKCE), kept in the
   Keychain; every request sends the ID token in `X-Id-Token`, which the API
   treats like the website's cookie. Needs `remembrancer://auth` as a callback
   URL on the Cognito app client, and the API deployed.
   Known: after Log out, the next Log in may skip the password (the login
   sheet remembers Cognito's own sign-in).

Next:
5. Note images in the app: fetched with the token, kept on the phone.
6. Background audio: reading continues with the screen locked.
7. Offline reading: notebooks and notes kept on the phone, synced when
   online.
8. Offline listening: read-aloud audio kept on the phone, and a **Download**
   option per notebook ("Make available offline").
9. Offline editing: changes queued and sent when back online; **the latest
   change wins** (with a notice when it overwrote a newer change).
10. Icon and launch screen, keyboard (hide the ^ ˅ ✓ bar), TestFlight.

Later:
- Managing space on the phone: **Remove download** for a notebook, and
  **Remove all downloads from this device**. These delete only the copies
  kept on the phone (notes, images, audio); the notebooks themselves stay in
  the account, untouched, and can be downloaded again.
- Share → Remembrancer (add text from other apps as a note), notifications,
  App Store, Android.
