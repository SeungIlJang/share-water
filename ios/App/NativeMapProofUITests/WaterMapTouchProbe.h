#import <XCTest/XCTest.h>
#import <UIKit/UIKit.h>

/// Test-runner only: rotation with 25% separation change (combined pinch).
/// Returns an error description, or nil on successful real touch injection.
FOUNDATION_EXPORT NSString * _Nullable WaterMapRotate(XCUIApplication * _Nonnull app, CGRect area, CGFloat radians);
