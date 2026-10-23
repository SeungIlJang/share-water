import XCTest

final class NativeMapProofUITests: XCTestCase {
    private var app: XCUIApplication!
    private var status: XCUIElement { app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "운영 미반영")).firstMatch }
    private func bearing() -> Int? {
        let text = status.label
        guard let range = text.range(of: #"\d+°"#, options: .regularExpression) else { return nil }
        return Int(text[range].dropLast())
    }
    private func waitForBearing(_ predicate: @escaping (Int) -> Bool) -> Bool {
        let expectation = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
            guard let value = self.bearing() else { return false }
            return predicate(value)
        }, object: nil)
        return XCTWaiter.wait(for: [expectation], timeout: 15) == .completed
    }
    private func capture(_ name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name; attachment.lifetime = .keepAlways; add(attachment)
    }
    override func setUpWithError() throws {
        continueAfterFailure = false
        app = XCUIApplication()
        if name.contains("testStandaloneSDKRotation") {
            app.launchArguments = ["--native-map-sdk-probe"]
            app.launch()
            XCTAssertTrue(app.staticTexts["sdk-probe-bearing"].waitForExistence(timeout: 45))
            return
        }
        app.launch()
        XCTAssertTrue(status.waitForExistence(timeout: 45), "Native proof UI must initialize")
        XCTAssertTrue(app.buttons["90°"].waitForExistence(timeout: 15))
        XCTAssertTrue(app.staticTexts["지도 렌더링 확인됨"].waitForExistence(timeout: 45), "Wait for actual SDK rendering before gestures")
    }
    func testStandaloneSDKRotation() {
        XCTAssertNil(WaterMapRotate(app, app.frame.insetBy(dx: 30, dy: 200), .pi / 2))
        let label = app.staticTexts["sdk-probe-bearing"]
        let changed = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
            let text = label.label
            guard let range = text.range(of: #"\d+°"#, options: .regularExpression), let value = Int(text[range].dropLast()) else { return false }
            return min(value, 360-value) > 20
        }, object: nil)
        let rotated = XCTWaiter.wait(for: [changed], timeout: 15) == .completed
        capture("ios-stock-sdk-real-rotation")
        XCTAssertTrue(rotated, "Stock SDK must rotate without WebView involvement")
    }
    func testNativeRotationWebControlsPanelLongPressAndResume() {
        capture("ios-native-map-initial")
        for angle in [0,45,90,180] {
            app.buttons["\(angle)°"].tap()
            XCTAssertTrue(waitForBearing { abs($0-angle) < 2 }, "HTML control must move native camera")
            capture("ios-native-map-bearing-\(angle)")
        }
        app.buttons["북쪽"].tap()
        XCTAssertTrue(waitForBearing { $0 < 2 || $0 > 358 })
        // Avoid targeting the entire application: its edge touches can hit fixed UI.
        app.buttons["패널 접기 ↓"].tap()
        XCTAssertTrue(app.buttons["패널 복원 ↑"].waitForExistence(timeout: 10))
        // XCTest synthesizes two real touches through UIKit, not a JS camera command.
        let gestureArea = app.images["지도 제스처 검증 영역"]
        XCTAssertTrue(gestureArea.waitForExistence(timeout: 10))
        gestureArea.press(forDuration: 1.2)
        XCTAssertTrue(app.staticTexts["길게 누른 실제 좌표"].waitForExistence(timeout: 10), "Single native touch must reach the map")
        app.buttons["닫기"].tap()
        XCTAssertNil(WaterMapRotate(app, gestureArea.frame, .pi / 2), "Real multi-touch injection must succeed")
        let rotated = waitForBearing { min($0,360-$0) > 20 }
        capture("ios-native-map-real-rotation-result")
        XCTAssertTrue(rotated, "Two-finger rotation must reach the native map")
        capture("ios-native-map-two-finger")
        app.buttons["북쪽"].tap()
        XCTAssertTrue(waitForBearing { $0 < 2 || $0 > 358 })
        app.buttons["패널 복원 ↑"].tap()
        app.buttons["경로 표시"].tap()
        capture("ios-native-map-route")
        app.buttons["패널 접기 ↓"].tap()
        XCTAssertTrue(app.buttons["패널 복원 ↑"].waitForExistence(timeout: 10))
        capture("ios-native-map-collapsed")
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.25,dy: 0.4)).press(forDuration: 1.2)
        XCTAssertTrue(app.staticTexts["길게 누른 실제 좌표"].waitForExistence(timeout: 10))
        capture("ios-native-map-long-press")
        XCUIDevice.shared.press(.home)
        app.activate()
        XCTAssertTrue(status.waitForExistence(timeout: 15))
        XCTAssertTrue(waitForBearing { $0 < 2 || $0 > 358 })
        capture("ios-native-map-resumed")
    }
}
