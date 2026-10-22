import UIKit
import Capacitor

/// Routes an entire UIKit touch sequence to the native view selected on touch-down.
final class NativeMapTouchContainer: UIView {
    weak var plugin: WaterNativeMapPlugin?
    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        if let target = plugin?.nativeTarget(at: point, in: self, event: event) { return target }
        return super.hitTest(point, with: event)
    }
}

@objc(NativeMapViewController)
class NativeMapViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        let original = view!
        let container = NativeMapTouchContainer(frame: original.frame)
        original.frame = container.bounds
        original.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        container.addSubview(original)
        view = container
        let plugin = WaterNativeMapPlugin()
        container.plugin = plugin
        bridge?.registerPluginInstance(plugin)
    }
}
