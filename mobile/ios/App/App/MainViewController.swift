import UIKit
import Capacitor

/// The app's one screen: Capacitor's web view, which shows the web app.
///
/// SceneDelegate uses this class instead of Capacitor's own
/// CAPBridgeViewController, only so it can register plugins that live in this
/// app rather than in an npm package (Capacitor finds those by itself).
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(WebAuthPlugin())
    }
}
