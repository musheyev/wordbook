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

## Plan

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

5, 7, 8. Note images, offline reading and offline listening
   (`web/src/client/offline/`, see the header of each file):
   - **Download** in a notebook's menu (and on My Notebooks) downloads the
     whole notebook: every note's and word's text and tags, the notes'
     images, and the audio Play all reads. New notes added later are
     downloaded too. **Remove download** removes only the phone's copy.
   - A note's ↓ button, or Select → Download, downloads single notes/words;
     they then show offline in every notebook they belong to.
   - A small ↓ marks downloaded notebooks (outlined: only some notes) and
     notes. With no connection: an Offline bar; notebooks show their
     downloaded notes, then "N more notes aren't downloaded"; Play all plays
     the downloaded notes; Add/Edit/Delete are greyed out.
   - Downloads refresh when the app starts or the connection returns (at
     most every 15 minutes). Log out deletes everything offline.
   - Note images inside the app load with the app's sign-in (no cookie
     there), from the phone when downloaded.
   - Test in a browser with the console: `offlineTest.on()`,
     `offlineTest.noConnection()`, `offlineTest.connection()`,
     `offlineTest.off()` (offline/network.js).
   - Known: iOS may clear an app's web storage when the phone is very short
     of space (the app asks it not to); a download is easy to redo.

9. Offline editing (`web/src/client/offline/outbox.js`): with no connection
   you can edit downloaded notes, write new notes, and change colours and
   tags. Changes show at once (↻ on the note, "N changes waiting to be sent"
   in the Offline bar) and are sent in order when the connection returns.
   **The latest change wins**: if the note was saved elsewhere after the
   offline edit, that version is kept; a notice says so either way. Deleting,
   renaming notebooks and looking up words still need a connection.
   - **Remove all downloads** and the space downloads take: bottom of My
     Notebooks. Changes not yet sent are kept.

6. Background audio (AppDelegate audio session, Info.plist UIBackgroundModes):
   set up; in the Simulator reading continues ~30 s locked, then the
   Simulator stops the web page (it can't grant WebKit's media assertion).
   To confirm on a real iPhone; if it stops there too, play the read-aloud
   queue natively instead.
10. (part) App icon "U5" (rounded bookmark with sound waves, brand blue;
   `branding/app-icon/`), with dark and tinted styles; launch screen (the
   icon on white); keyboard ^ ˅ ✓ bar hidden. Sign-in uses Apple's sign-in
   sheet (WebAuthPlugin.swift): private, so Log in after Log out asks for the
   password, and no "Open in Remembrancer?" question.

Next:
- Test on a real iPhone (free Apple ID in Xcode): background audio,
  offline features (airplane mode).
10. TestFlight and the App Store: Apple Developer membership, privacy
   policy page, App Store listing.

Later:
- Share → Remembrancer (add text from other apps as a note), notifications,
  App Store, Android.
