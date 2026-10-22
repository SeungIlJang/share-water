import UIKit
import Capacitor
import NMapsMap
import NMapsGeometry

@objc(WaterNativeMapPlugin)
public class WaterNativeMapPlugin: CAPPlugin, CAPBridgedPlugin, NMFMapViewTouchDelegate, NMFMapViewCameraDelegate, NMFAuthManagerDelegate {
    public let identifier = "WaterNativeMapPlugin"
    public let jsName = "WaterNativeMap"
    public let pluginMethods: [CAPPluginMethod] = ["create", "setBounds", "getState", "moveCamera", "fitBounds", "setMarkers", "setRoute", "setUserLocation", "destroy"].map { CAPPluginMethod(name: $0, returnType: CAPPluginReturnPromise) }
    private var native: NMFNaverMapView?
    private var markers: [String: NMFMarker] = [:]
    private var route: NMFPolylineOverlay?
    private var bounds = CGRect.zero
    private var excluded: [CGRect] = []
    private var viewportWidth: CGFloat = 390
    private var selectedID: String?
    private var map: NMFMapView? { native?.mapView }
    private var ratio: CGFloat { (bridge?.webView?.bounds.width ?? viewportWidth) / max(1, viewportWidth) }

    private func coordinate(_ object: JSObject?) -> NMGLatLng {
        NMGLatLng(lat: object?["latitude"] as? Double ?? 37.512, lng: object?["longitude"] as? Double ?? 127.074)
    }
    private func location(_ point: NMGLatLng) -> JSObject { ["latitude": point.lat, "longitude": point.lng] }
    private func state() -> JSObject {
        guard let map = map else { return ["ready": false] }
        let camera = map.cameraPosition
        var result = location(camera.target)
        result.merge(["ready": true, "zoom": camera.zoom, "bearing": camera.heading, "tilt": camera.tilt, "markerCount": markers.count]) { _, new in new }
        if let id = selectedID, let marker = markers[id] {
            let point = map.projection.point(from: marker.position)
            // Projection is relative to the map view, whereas UI geometry uses WebView CSS pixels.
            if let web = bridge?.webView {
                let webPoint = map.convert(point, to: web)
                result["selected"] = ["id": id, "x": Double(webPoint.x / ratio), "y": Double(webPoint.y / ratio)]
            }
        }
        return result
    }
    private func rectangle(_ data: JSObject) -> CGRect {
        CGRect(x: data["x"] as? Double ?? 0, y: data["y"] as? Double ?? 0,
               width: data["width"] as? Double ?? 1, height: data["height"] as? Double ?? 1)
    }
    private func readBounds(_ call: CAPPluginCall) {
        if let data = call.getObject("bounds") {
            bounds = rectangle(data)
            viewportWidth = CGFloat(data["viewportWidth"] as? Double ?? 390)
        }
        excluded = (call.getArray("excludedRects", JSObject.self) ?? []).map(rectangle)
        guard let native = native, let web = bridge?.webView, let parent = native.superview else { return }
        let cssFrame = CGRect(x: bounds.minX * ratio, y: bounds.minY * ratio, width: bounds.width * ratio, height: bounds.height * ratio)
        native.frame = web.convert(cssFrame, to: parent)
    }
    func nativeTarget(at point: CGPoint, in container: UIView, event: UIEvent?) -> UIView? {
        guard let native = native, let web = bridge?.webView else { return nil }
        let webPoint = container.convert(point, to: web)
        let cssPoint = CGPoint(x: webPoint.x / ratio, y: webPoint.y / ratio)
        guard bounds.contains(cssPoint), !excluded.contains(where: { $0.contains(cssPoint) }) else { return nil }
        return native.hitTest(container.convert(point, to: native), with: event)
    }
    @objc func create(_ call: CAPPluginCall) {
        guard let key = call.getString("clientId"), !key.isEmpty else { call.reject("Native map client ID is missing"); return }
        DispatchQueue.main.async {
            self.dispose()
            guard let container = self.bridge?.viewController?.view as? NativeMapTouchContainer, let web = self.bridge?.webView else { call.reject("Native map host unavailable"); return }
            NMFAuthManager.shared().delegate = self
            NMFAuthManager.shared().client = NMFNcpKeyClient(ncpKeyId: key, beta: false)
            let native = NMFNaverMapView(frame: .zero)
            self.native = native
            container.insertSubview(native, at: 0)
            web.isOpaque = false
            web.backgroundColor = .clear
            web.scrollView.backgroundColor = .clear
            native.showCompass = false
            native.showZoomControls = false
            native.showScaleBar = true
            native.showLocationButton = false
            native.showIndoorLevelPicker = false
            native.mapView.isRotateGestureEnabled = true
            native.mapView.isZoomGestureEnabled = true
            native.mapView.isTiltGestureEnabled = false
            native.mapView.touchDelegate = self
            native.mapView.addCameraDelegate(delegate: self)
            self.readBounds(call)
            let position = NMFCameraPosition(self.coordinate(call.getObject("center")), zoom: call.getDouble("zoom") ?? 15, tilt: 0, heading: call.getDouble("bearing") ?? 0)
            native.mapView.moveCamera(NMFCameraUpdate(position: position))
            call.resolve(self.state())
        }
    }
    @objc func setBounds(_ call: CAPPluginCall) { DispatchQueue.main.async { self.readBounds(call); call.resolve() } }
    @objc func getState(_ call: CAPPluginCall) { DispatchQueue.main.async { call.resolve(self.state()) } }
    @objc func moveCamera(_ call: CAPPluginCall) { DispatchQueue.main.async {
        guard let map = self.map else { call.reject("Map not ready"); return }
        let old = map.cameraPosition
        let center = call.getObject("center").map(self.coordinate) ?? old.target
        let position = NMFCameraPosition(center, zoom: call.getDouble("zoom") ?? old.zoom, tilt: 0, heading: call.getDouble("bearing") ?? old.heading)
        map.moveCamera(NMFCameraUpdate(position: position)); call.resolve(self.state())
    } }
    @objc func fitBounds(_ call: CAPPluginCall) { DispatchQueue.main.async {
        guard let map = self.map else { call.reject("Map not ready"); return }
        let points = (call.getArray("points", JSObject.self) ?? []).map(self.coordinate)
        if points.count > 1 { map.moveCamera(NMFCameraUpdate(fit: NMGLatLngBounds(latLngs: points), padding: 40)) }
        call.resolve()
    } }
    @objc func setMarkers(_ call: CAPPluginCall) { DispatchQueue.main.async {
        guard let map = self.map else { call.reject("Map not ready"); return }
        self.markers.values.forEach { $0.mapView = nil }; self.markers.removeAll()
        self.selectedID = call.getString("selectedId")
        for item in call.getArray("markers", JSObject.self) ?? [] {
            guard let id = item["id"] as? String else { continue }
            let marker = NMFMarker(position: self.coordinate(item))
            marker.iconImage = NMFOverlayImage(image: self.markerImage(selected: id == self.selectedID, order: item["order"] as? Int ?? 0))
            marker.width = 42; marker.height = 48; marker.anchor = CGPoint(x: 0.5, y: 1)
            marker.isFlat = false; marker.angle = 0
            marker.captionText = item["title"] as? String ?? ""
            marker.captionTextSize = 11; marker.captionMinZoom = 15
            marker.zIndex = id == self.selectedID ? 300 : 100
            marker.touchHandler = { [weak self] _ in
                guard let self = self else { return false }
                self.selectedID = id
                var data = self.state(); data["id"] = id
                self.notifyListeners("markerTap", data: data); return true
            }
            marker.mapView = map; self.markers[id] = marker
        }
        call.resolve(self.state())
    } }
    private func markerImage(selected: Bool, order: Int) -> UIImage {
        UIGraphicsImageRenderer(size: CGSize(width: 48, height: 56)).image { context in
            let path = UIBezierPath()
            path.move(to: CGPoint(x: 24, y: 54))
            path.addCurve(to: CGPoint(x: 3, y: 24.5), controlPoint1: CGPoint(x: 19.5, y: 47), controlPoint2: CGPoint(x: 3, y: 37))
            path.addCurve(to: CGPoint(x: 45, y: 24.5), controlPoint1: CGPoint(x: 3, y: -4.5), controlPoint2: CGPoint(x: 45, y: -4.5))
            path.addCurve(to: CGPoint(x: 24, y: 54), controlPoint1: CGPoint(x: 45, y: 37), controlPoint2: CGPoint(x: 28.5, y: 47))
            (selected ? UIColor(red: 0.85, green: 0.96, blue: 0.98, alpha: 1) : .white).setFill(); path.fill()
            UIColor.systemTeal.setStroke(); path.lineWidth = selected ? 3.5 : 2; path.stroke()
            let text = order > 0 ? "💧\(order)" : "💧"
            (text as NSString).draw(in: CGRect(x: 9, y: 13, width: 35, height: 26), withAttributes: [.font: UIFont.systemFont(ofSize: 18)])
        }
    }
    @objc func setRoute(_ call: CAPPluginCall) { DispatchQueue.main.async {
        self.route?.mapView = nil; self.route = nil
        let points = (call.getArray("points", JSObject.self) ?? []).map(self.coordinate)
        if let map = self.map, points.count >= 2 {
            let route = NMFPolylineOverlay(points)
            route?.width = 6; route?.color = UIColor(red: 0.03, green: 0.5, blue: 0.55, alpha: 1)
            route?.mapView = map; self.route = route
        }
        call.resolve()
    } }
    @objc func setUserLocation(_ call: CAPPluginCall) { DispatchQueue.main.async {
        self.map?.locationOverlay.location = self.coordinate(call.getObject("position"))
        self.map?.locationOverlay.hidden = false; call.resolve()
    } }
    @objc func destroy(_ call: CAPPluginCall) { DispatchQueue.main.async { self.dispose(); call.resolve() } }
    private func dispose() {
        map?.removeCameraDelegate(delegate: self); map?.touchDelegate = nil
        markers.values.forEach { $0.mapView = nil }; markers.removeAll()
        route?.mapView = nil; route = nil; selectedID = nil
        native?.removeFromSuperview(); native = nil
        if NMFAuthManager.shared().delegate === self { NMFAuthManager.shared().delegate = nil }
    }
    public func authorized(_ state: NMFAuthState, error: Error?) {
        if let error = error as NSError? { notifyListeners("authError", data: ["code": String(error.code), "message": "네이버 모바일 지도 인증 설정을 확인해 주세요."]) }
    }
    public func mapView(_ mapView: NMFMapView, cameraIsChangingByReason reason: Int) { notifyListeners("cameraMove", data: state()) }
    public func mapViewCameraIdle(_ mapView: NMFMapView) { notifyListeners("cameraIdle", data: state()) }
    public func mapView(_ mapView: NMFMapView, didTapMap latlng: NMGLatLng, point: CGPoint) { notifyListeners("mapTap", data: location(latlng)) }
    public func mapView(_ mapView: NMFMapView, didLongTapMap latlng: NMGLatLng, point: CGPoint) { notifyListeners("mapLongPress", data: location(latlng)) }
}
