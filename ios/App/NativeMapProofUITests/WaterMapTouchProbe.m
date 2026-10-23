#import "WaterMapTouchProbe.h"
#import <math.h>

// XCTest's stock rotate gesture uses a fixed narrow finger span. Use the same
// XCTest event synthesis interfaces exposed by Appium WebDriverAgent to control
// the span explicitly. This file belongs only to the UI-test bundle, never App.
// API reference: https://github.com/appium/WebDriverAgent (FBXCTestDaemonsProxy).
@interface NSObject (WaterMapTestSynthesis)
- (instancetype)initForTouchAtPoint:(CGPoint)point offset:(double)offset;
- (void)moveToPoint:(CGPoint)point atOffset:(double)offset;
- (void)liftUpAtOffset:(double)offset;
- (instancetype)initWithName:(NSString *)name interfaceOrientation:(NSInteger)orientation;
- (void)addPointerEventPath:(id)path;
- (void)setTargetProcessID:(NSInteger)processID;
- (void)setParentWindowSize:(CGSize)size;
- (id)eventSynthesizer;
- (void)synthesizeEvent:(id)record completion:(void (^)(BOOL, NSError *))completion;
@end

NSString *WaterMapRotate(XCUIApplication *app, CGRect area, CGFloat radians) {
    Class pathClass=NSClassFromString(@"XCPointerEventPath");
    Class recordClass=NSClassFromString(@"XCSynthesizedEventRecord");
    id device=XCUIDevice.sharedDevice;
    if(!pathClass || !recordClass || ![device respondsToSelector:@selector(eventSynthesizer)]) return @"XCTest event synthesis unavailable";
    @try {
        id record=[[recordClass alloc] initWithName:@"water-map-two-finger-rotation" interfaceOrientation:UIInterfaceOrientationPortrait];
        NSNumber *pid=[app valueForKey:@"processID"];
        [record setTargetProcessID:pid.integerValue];
        [record setParentWindowSize:app.frame.size];
        CGPoint center=CGPointMake(CGRectGetMidX(area),CGRectGetMidY(area));
        CGFloat radius=MIN(110,MIN(area.size.width,area.size.height)*.38);
        for(int finger=0;finger<2;finger++) {
            CGFloat offset=finger==0?M_PI:0;
            CGPoint start=CGPointMake(center.x+radius*cos(offset),center.y+radius*sin(offset));
            id path=[[pathClass alloc] initForTouchAtPoint:start offset:0];
            for(int step=1;step<=48;step++) {
                CGFloat angle=offset+radians*step/48.0;
                // Real fingers change their separation while turning. Exercise
                // the SDK's combined pinch/rotation path, not camera commands.
                CGFloat span = radius * (1 + .25 * step/48.0);
                [path moveToPoint:CGPointMake(center.x+span*cos(angle),center.y+span*sin(angle)) atOffset:.12+1.2*step/48.0];
            }
            [path liftUpAtOffset:1.4];
            [record addPointerEventPath:path];
        }
        __block BOOL done=NO, success=NO;
        __block NSError *failure=nil;
        [[device eventSynthesizer] synthesizeEvent:record completion:^(BOOL result,NSError *error){success=result;failure=error;done=YES;}];
        NSDate *deadline=[NSDate dateWithTimeIntervalSinceNow:15];
        while(!done && deadline.timeIntervalSinceNow>0) [[NSRunLoop currentRunLoop] runMode:NSDefaultRunLoopMode beforeDate:[NSDate dateWithTimeIntervalSinceNow:.02]];
        if(!done)return @"XCTest touch injection timed out";
        return failure.localizedDescription ?: (success?nil:@"XCTest rejected touch injection");
    } @catch(NSException *exception) { return exception.reason ?: @"XCTest touch injection failed"; }
}
