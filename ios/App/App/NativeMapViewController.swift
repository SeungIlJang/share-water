import UIKit
import Capacitor
import WebKit
/// Routes an entire UIKit touch sequence to the native view selected on touch-down.
final class NativeMapTouchContainer: UIView {
    weak var plugin: WaterNativeMapPlugin?
    weak var webSurface: WKWebView?
    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        guard self.point(inside: point, with: event) else { return nil }
        if let target = plugin?.nativeTarget(at: point, in: self, event: event) { return target }
        // A control exclusion means web ownership, not permission for UIKit to
        // walk through a transparent WebView and rediscover the native sibling.
        if let web = webSurface {
            let target = web.scrollView.hitTest(convert(point, to: web.scrollView), with: event) ?? web
            return target
        }
        return super.hitTest(point, with: event)
    }
}

@objc(NativeMapViewController)
class NativeMapViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        let original = view!
        let container = NativeMapTouchContainer(frame: original.frame)
        container.isMultipleTouchEnabled = true
        original.frame = container.bounds
        original.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        container.addSubview(original)
        view = container
        let plugin = WaterNativeMapPlugin()
        container.plugin = plugin
        container.webSurface = webView
        bridge?.registerPluginInstance(plugin)
    }
}

#if DEBUG
import NMapsMap
import NMapsGeometry

/// A/B control: stock provider view with no WebView or bridge hit testing.
final class NativeMapSDKProbeController: UIViewController {
    private var renderer: NMFNaverMapView!
    private var timer: Timer?
    override func viewDidLoad() {
        super.viewDidLoad()
        renderer = NMFNaverMapView(frame: view.bounds)
        renderer.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(renderer)
        renderer.mapView.moveCamera(NMFCameraUpdate(position: NMFCameraPosition(NMGLatLng(lat: 37.512, lng: 127.074), zoom: 15)))
        let label = UILabel(frame: CGRect(x: 16, y: 70, width: 260, height: 38))
        label.backgroundColor = .white
        label.textColor = .black
        label.accessibilityIdentifier = "sdk-probe-bearing"
        view.addSubview(label)
        timer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self, weak label] _ in
            guard let self = self else { return }
            label?.text = "SDK 단독 검증 \(Int(self.renderer.mapView.cameraPosition.heading.rounded()))°"
        }
    }
    override func viewDidDisappear(_ animated: Bool) { super.viewDidDisappear(animated); timer?.invalidate() }
}
#endif
