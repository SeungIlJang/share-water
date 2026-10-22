package com.sharewater.app;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;
import android.view.MotionEvent;

public class MainActivity extends BridgeActivity {
    private NativeNaverMapPlugin nativeMap;

    @Override public void onCreate(Bundle state) {
        registerPlugin(NativeNaverMapPlugin.class);
        super.onCreate(state);
    }

    void attachNativeMap(NativeNaverMapPlugin plugin) { nativeMap = plugin; }
    NativeNaverMapPlugin getNativeMapPlugin() { return nativeMap; }

    @Override public boolean dispatchTouchEvent(MotionEvent event) {
        if (nativeMap != null && nativeMap.dispatchNativeTouch(event)) return true;
        return super.dispatchTouchEvent(event);
    }
}
