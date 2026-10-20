import Foundation
import AuthenticationServices
import Capacitor

/// Signing in with Apple's sign-in sheet (ASWebAuthenticationSession), for
/// the app's JavaScript (web/src/client/native/auth.js), as the Capacitor
/// plugin "WebAuth".
///
/// It shows the Cognito login page in a sheet and watches for the page to
/// go to an address starting with `callbackScheme` ("remembrancer://…"). That
/// address — carrying the sign-in code — is handed back to JavaScript, and
/// the sheet closes. Compared with an ordinary in-app browser:
///   - No "Open in Remembrancer?" question: the sheet itself catches the
///     address instead of iOS passing it between apps.
///   - "Ephemeral" (private) mode keeps no cookies, so the login page never
///     remembers an earlier sign-in: after Log out, the next Log in asks for
///     the password again.
///
/// A Capacitor plugin is a Swift class the JavaScript side can call: each
/// method listed in `pluginMethods` gets a `CAPPluginCall` with the options
/// JavaScript passed, and answers with `resolve` (success) or `reject`.
/// This one is registered in MainViewController.
@objc(WebAuthPlugin)
public class WebAuthPlugin: CAPPlugin, CAPBridgedPlugin, ASWebAuthenticationPresentationContextProviding {
    public let identifier = "WebAuthPlugin"
    public let jsName = "WebAuth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "signIn", returnType: CAPPluginReturnPromise)
    ]

    /// The sheet while it's open (it must be kept alive until it finishes).
    private var session: ASWebAuthenticationSession?

    /// signIn({ url, callbackScheme, ephemeral? }) -> { url }: the
    /// "remembrancer://…" address the login page finished at. Rejects with
    /// code "CANCELLED" when the sheet is closed without signing in.
    @objc func signIn(_ call: CAPPluginCall) {
        guard let urlString = call.getString("url"), let url = URL(string: urlString),
              let scheme = call.getString("callbackScheme") else {
            call.reject("Missing url or callbackScheme")
            return
        }
        let ephemeral = call.getBool("ephemeral") ?? true

        // Sheets are shown from the main (user interface) thread.
        DispatchQueue.main.async {
            let session = ASWebAuthenticationSession(url: url, callbackURLScheme: scheme) { [weak self] callbackURL, error in
                self?.session = nil
                if let callbackURL = callbackURL {
                    call.resolve(["url": callbackURL.absoluteString])
                } else if let error = error as? ASWebAuthenticationSessionError, error.code == .canceledLogin {
                    call.reject("Sign-in was cancelled", "CANCELLED")
                } else {
                    call.reject(error?.localizedDescription ?? "Sign-in failed")
                }
            }
            session.presentationContextProvider = self
            session.prefersEphemeralWebBrowserSession = ephemeral
            self.session = session
            if !session.start() {
                self.session = nil
                call.reject("Could not open the sign-in sheet")
            }
        }
    }

    /// The window the sheet appears over: the app's own.
    public func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        return bridge?.viewController?.view.window ?? ASPresentationAnchor()
    }
}
